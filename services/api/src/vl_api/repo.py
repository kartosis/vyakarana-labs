"""DynamoDB single-table repository. Keys and access patterns: docs/ARCHITECTURE.md §5.

Capacity is provisioned inside the always-free tier, so writes are batched per practice session
(one request ≈ six small writes) rather than per answer.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from collections.abc import Callable, Iterable, Iterator
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, cast

from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from . import domain
from .models import ReviewsIn, SessionIn, SettingsIn

Item = dict[str, Any]
Plan = tuple[list[Item], dict[str, Any], dict[str, int]]  # transaction items, response, site-wide counts
DAY_TTL_DAYS = 400
LB_TTL_DAYS = 120
REQ_TTL_DAYS = 7  # how long a retry with the same request id gets the stored response
TX_ATTEMPTS = 4
REVIEW_GRACE = timedelta(minutes=1)
log = logging.getLogger(__name__)


class RequestIdReused(Exception):
    """The same request id arrived with a different body."""


class Contended(Exception):
    """The learner's data kept changing between read and write; retrying with the same request id is safe."""


def plain(v: Any) -> Any:
    """DynamoDB Decimals → int/float, recursively, for JSON."""
    if isinstance(v, Decimal):
        return int(v) if v == v.to_integral_value() else float(v)
    if isinstance(v, dict):
        return {k: plain(x) for k, x in v.items()}
    if isinstance(v, list):
        return [plain(x) for x in v]
    return v


def _num(v: Any) -> Any:
    """float → Decimal for writes (DynamoDB rejects floats)."""
    if isinstance(v, float):
        return Decimal(str(v))
    if isinstance(v, dict):
        return {k: _num(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_num(x) for x in v]
    return v


def _conditional_failed(e: ClientError) -> bool:
    return bool(e.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException")


def _put(
    table: str,
    item: Item,
    cond: str,
    names: dict[str, str] | None = None,
    values: Item | None = None,
) -> Item:
    op: Item = {"TableName": table, "Item": item, "ConditionExpression": cond}
    if names:
        op["ExpressionAttributeNames"] = names
    if values:
        op["ExpressionAttributeValues"] = values
    return {"Put": op}


def _update(
    table: str,
    key: Item,
    expr: str,
    names: dict[str, str] | None = None,
    values: Item | None = None,
    cond: str | None = None,
) -> Item:
    op: Item = {"TableName": table, "Key": key, "UpdateExpression": expr}
    if cond:
        op["ConditionExpression"] = cond
    if names:
        op["ExpressionAttributeNames"] = names
    if values:
        op["ExpressionAttributeValues"] = values
    return {"Update": op}


def _opted_in(prof: Item) -> bool:
    return bool(prof.get("settings", {}).get("lbOptIn", True))


def pk(sub: str) -> str:
    return f"USER#{sub}"


class Repo:
    def __init__(self, table: Any) -> None:
        self.t = table

    # ------------------------------------------------------------ reads
    def _query_all(self, **kw: Any) -> Iterator[Item]:
        while True:
            page = self.t.query(**kw)
            yield from page.get("Items", [])
            if "LastEvaluatedKey" not in page:
                return
            kw["ExclusiveStartKey"] = page["LastEvaluatedKey"]

    def user_items(self, sub: str) -> list[Item]:
        return list(self._query_all(KeyConditionExpression=Key("PK").eq(pk(sub))))

    def get(self, key_pk: str, key_sk: str) -> Item | None:
        return cast("Item | None", self.t.get_item(Key={"PK": key_pk, "SK": key_sk}).get("Item"))

    # ------------------------------------------------------------ profile
    def profile(self, sub: str, now: datetime) -> Item:
        item = self.get(pk(sub), "PROFILE")
        if item:
            return item
        item = {
            "PK": pk(sub),
            "SK": "PROFILE",
            "pseudonym": domain.new_pseudonym(),
            "settings": {"script": "deva", "theme": "system", "dailyGoal": 10, "lbOptIn": True},
            "role": "learner",
            "createdAt": now.isoformat(),
        }
        try:
            self.t.put_item(Item=item, ConditionExpression="attribute_not_exists(PK)")
            self.t.put_item(Item={"PK": f"USERDIR#{now:%Y-%m}", "SK": f"{now.isoformat()}#{sub}", "sub": sub})
        except ClientError as e:
            if not _conditional_failed(e):
                raise
            return self.get(pk(sub), "PROFILE") or item
        return item

    def update_settings(self, sub: str, s: SettingsIn, now: datetime) -> Item:
        prof = self.profile(sub, now)
        before = (_opted_in(prof), prof.get("pseudonym"))
        settings = dict(prof.get("settings", {}))
        for field, alias in (
            ("script", "script"),
            ("theme", "theme"),
            ("daily_goal", "dailyGoal"),
            ("lb_opt_in", "lbOptIn"),
        ):
            value = getattr(s, field)
            if value is not None:
                settings[alias] = value
        names = {"#s": "settings"}
        values: dict[str, Any] = {":s": settings}
        expr = "SET #s = :s"
        if s.pseudonym:
            expr += ", pseudonym = :p"
            values[":p"] = s.pseudonym
        out = self.t.update_item(
            Key={"PK": pk(sub), "SK": "PROFILE"},
            UpdateExpression=expr,
            ExpressionAttributeNames=names,
            ExpressionAttributeValues=values,
            ReturnValues="ALL_NEW",
        )
        new = cast("Item", out["Attributes"])
        if (_opted_in(new), new.get("pseudonym")) != before:
            self._sync_leaderboard_rows(sub, new, now)  # review #4: at once, not on the next activity
        return new

    # ------------------------------------------------------------ progress
    def progress(self, sub: str, now: datetime, tz: str) -> dict[str, Any]:
        lessons: dict[str, Any] = {}
        streak = domain.Streak(0, 0, None)
        today = domain.local_date(now, tz)
        today_counts: Item = {}
        due = 0
        for it in self.user_items(sub):
            sk = it["SK"]
            if sk.startswith("PROG#"):
                lessons[sk[5:]] = plain({k: v for k, v in it.items() if k not in ("PK", "SK")})
            elif sk == "STREAK":
                streak = domain.Streak(int(it["current"]), int(it["longest"]), it.get("lastDate"))
            elif sk == f"DAY#{today.isoformat()}":
                today_counts = plain({k: v for k, v in it.items() if k not in ("PK", "SK", "ttl")})
            elif sk.startswith("CARD#") and str(it.get("due", "")) <= now.isoformat():
                due += 1
        return {
            "lessons": lessons,
            "streak": {"current": streak.as_of(today), "longest": streak.longest},
            "today": today_counts,
            "due": due,
        }

    def lesson_statuses(self, sub: str) -> dict[str, str]:
        """Status of every lesson the learner has touched (read, practised, completed): one narrow query."""
        items = self._query_all(
            KeyConditionExpression=Key("PK").eq(pk(sub)) & Key("SK").begins_with("PROG#"),
            ProjectionExpression="SK, #st",
            ExpressionAttributeNames={"#st": "status"},
        )
        return {it["SK"][5:]: str(it.get("status", "read")) for it in items}

    def set_read(self, sub: str, lesson_id: str, read: bool, now: datetime) -> str:
        """Mark or unmark a lesson as read. Never touches a lesson that has been practised or completed.
        Returns the lesson's status afterwards ("none" when there is no record)."""
        key = {"PK": pk(sub), "SK": f"PROG#{lesson_id}"}
        try:
            if read:
                self.t.put_item(
                    Item={**key, "status": "read", "readAt": now.isoformat(), "attempts": 0},
                    ConditionExpression="attribute_not_exists(SK)",
                )
                return "read"
            self.t.delete_item(
                Key=key,
                ConditionExpression="#st = :read",
                ExpressionAttributeNames={"#st": "status"},
                ExpressionAttributeValues={":read": "read"},
            )
            return "none"
        except ClientError as e:
            if not _conditional_failed(e):
                raise
        current = self.t.get_item(Key=key, ConsistentRead=True).get("Item")
        return str(current.get("status", "read")) if current else "none"

    def merge_read(self, sub: str, lesson_ids: Iterable[str], now: datetime) -> int:
        """Guest 'mark as read' history → account. Server data always wins."""
        added = 0
        for lid in set(lesson_ids):
            try:
                self.t.put_item(
                    Item={
                        "PK": pk(sub),
                        "SK": f"PROG#{lid}",
                        "status": "read",
                        "readAt": now.isoformat(),
                        "attempts": 0,
                    },
                    ConditionExpression="attribute_not_exists(SK)",
                )
                added += 1
            except ClientError as e:
                if not _conditional_failed(e):
                    raise
        return added

    # ------------------------------------------------------------ practice sessions
    def record_session(self, sub: str, s: SessionIn, now: datetime) -> dict[str, Any]:
        def plan() -> Plan:
            prof = self.profile(sub, now)
            correct = sum(1 for a in s.attempts if a.correct)
            total = len(s.attempts)
            pct = round(100 * correct / total)
            prog_key = {"PK": pk(sub), "SK": f"PROG#{s.lesson_id}"}
            prog = self.t.get_item(Key=prog_key, ConsistentRead=True).get("Item") or {}
            was_completed = prog.get("status") == "completed"
            first_completion = s.completed and not was_completed
            status = "completed" if (s.completed or was_completed) else "practised"
            best = max(int(prog.get("bestScore", 0)), pct)

            # the attempt count doubles as the version of the progress item
            names = {"#st": "status", "#att": "attempts"}
            values: Item = {":st": status, ":b": best, ":l": pct, ":now": now.isoformat(), ":one": 1}
            if not prog:
                cond = "attribute_not_exists(SK)"
            elif "attempts" in prog:
                cond = "#att = :a"
                values[":a"] = prog["attempts"]
            else:
                cond = "attribute_not_exists(#att)"
            items = [
                _update(
                    self.t.name,
                    prog_key,
                    "SET #st = :st, bestScore = :b, lastScore = :l, lastAt = :now"
                    + (", completedAt = :now" if first_completion else "")
                    + " ADD #att :one",
                    names,
                    values,
                    cond,
                )
            ]

            cards_added = 0
            if s.completed and s.new_cards:
                wanted = list(dict.fromkeys(s.new_cards))  # one operation per item in a transaction
                held = self._get_many([{"PK": pk(sub), "SK": f"CARD#{c}"} for c in wanted])
                for cid in wanted:
                    if f"CARD#{cid}" in held:
                        continue
                    items.append(
                        _put(
                            self.t.name,
                            {
                                "PK": pk(sub),
                                "SK": f"CARD#{cid}",
                                "lesson": s.lesson_id,
                                "state": _num(domain.new_card_state(now)),
                                "due": now.isoformat(),
                                "LSI1SK": f"DUE#{now.isoformat()}",
                            },
                            "attribute_not_exists(SK)",
                        )
                    )
                    cards_added += 1

            today = domain.local_date(now, s.tz)
            ms = sum(a.ms for a in s.attempts)
            items.append(
                self._day_op(
                    sub,
                    today.isoformat(),
                    now,
                    items=total,
                    correct=correct,
                    ms=ms,
                    lessons=int(first_completion),
                )
            )
            streak, streak_op = self._streak_op(sub, today)
            items += streak_op
            score = domain.session_score(correct, first_completion)
            items += self._leaderboard_ops(sub, prof, today, score, now)
            response = {
                "score": pct,
                "best": best,
                "status": status,
                "firstCompletion": first_completion,
                "cardsAdded": cards_added,
                "streak": {"current": streak.current, "longest": streak.longest},
                "points": score,
            }
            return items, response, {"sessions": 1, "items": total}

        return self._once(sub, "session", s.request_id, s.model_dump_json(), now, plan)

    # ------------------------------------------------------------ reviews
    def due_cards(self, sub: str, now: datetime, limit: int = 50) -> list[Item]:
        out = self.t.query(
            IndexName="LSI1",
            KeyConditionExpression=Key("PK").eq(pk(sub)) & Key("LSI1SK").lte(f"DUE#{now.isoformat()}"),
            Limit=limit,
        )
        return [
            {"cardId": it["SK"][5:], "lesson": it.get("lesson"), "due": it.get("due")}
            for it in out.get("Items", [])
        ]

    def apply_reviews(self, sub: str, r: ReviewsIn, now: datetime) -> dict[str, Any]:
        """Review #8: each card once per request (models.ReviewsIn), only when due, and only from the state
        that was read (the update is conditional on the previous due date). Others are counted as skipped."""

        def plan() -> Plan:
            prof = self.profile(sub, now)
            held = self._get_many([{"PK": pk(sub), "SK": f"CARD#{i.card_id}"} for i in r.items])
            latest = (now + REVIEW_GRACE).isoformat()
            items: list[Item] = []
            reviewed = correct = skipped = 0
            for i in r.items:
                card = held.get(f"CARD#{i.card_id}")
                if not card or str(card.get("due", "")) > latest:
                    skipped += 1
                    continue
                new_state = domain.review(plain(card["state"]), i.rating, now, i.ms)
                due = str(new_state["due"])
                items.append(
                    _update(
                        self.t.name,
                        {"PK": pk(sub), "SK": f"CARD#{i.card_id}"},
                        "SET #state = :s, #due = :d, LSI1SK = :k, lastRating = :r ADD #rev :one",
                        {"#state": "state", "#due": "due", "#rev": "reviews"},
                        {
                            ":s": _num(new_state),
                            ":d": due,
                            ":k": f"DUE#{due}",
                            ":r": i.rating,
                            ":one": 1,
                            ":was": card["due"],
                        },
                        "#due = :was",
                    )
                )
                reviewed += 1
                correct += int(i.rating >= 3)
            if reviewed:
                today = domain.local_date(now, r.tz)
                items.append(self._day_op(sub, today.isoformat(), now, reviews=reviewed, correct=correct))
                items += self._streak_op(sub, today)[1]
                items += self._leaderboard_ops(sub, prof, today, correct, now)
            response = {"reviewed": reviewed, "correct": correct, "skipped": skipped}
            return items, response, {"reviews": reviewed}

        return self._once(sub, "reviews", r.request_id, r.model_dump_json(), now, plan)

    # ------------------------------------------------------------ leaderboard
    def leaderboard(self, week: str, limit: int = 50) -> list[Item]:
        out = self.t.query(
            IndexName="GSI1",
            KeyConditionExpression=Key("GSI1PK").eq(f"LB#{week}"),
            ScanIndexForward=False,
            Limit=limit,
        )
        return [
            {"rank": i + 1, "pseudonym": it.get("pseudonym"), "score": int(it.get("score", 0))}
            for i, it in enumerate(out.get("Items", []))
        ]

    # ------------------------------------------------------------ account lifecycle
    def export(self, sub: str) -> list[Item]:
        return [plain(it) for it in self.user_items(sub)]

    def delete_user(self, sub: str) -> int:
        items = self.user_items(sub)
        weeks = set()
        created = None
        for it in items:
            if it["SK"].startswith("DAY#"):
                weeks.add(domain.iso_week(datetime.fromisoformat(it["SK"][4:]).date()))
            if it["SK"] == "PROFILE":
                created = it.get("createdAt")
        with self.t.batch_writer() as bw:
            for it in items:
                bw.delete_item(Key={"PK": it["PK"], "SK": it["SK"]})
            for w in weeks:
                bw.delete_item(Key={"PK": f"LB#{w}", "SK": f"U#{sub}"})
            if created:
                bw.delete_item(Key={"PK": f"USERDIR#{created[:7]}", "SK": f"{created}#{sub}"})
        return len(items)

    # ------------------------------------------------------------ internals
    def _transact(self, items: list[Item]) -> None:
        """One atomic write of up to 100 items (a method of its own so tests can inject faults)."""
        self.t.meta.client.transact_write_items(TransactItems=items)

    def _once(
        self, sub: str, kind: str, request_id: str, body: str, now: datetime, plan: Callable[[], Plan]
    ) -> dict[str, Any]:
        """Apply `plan` exactly once per learner and request id (review #1).

        The request record is written in the same transaction as the changes, so both exist or neither, and
        a retry gets the stored response. Every value a write was computed from is guarded by a condition, so
        a concurrent change cancels the transaction and the plan is recomputed from fresh reads.
        """
        key = {"PK": pk(sub), "SK": f"REQ#{request_id}"}
        fingerprint = hashlib.sha256(f"{kind}\n{body}".encode()).hexdigest()
        for _ in range(TX_ATTEMPTS):
            done = self.t.get_item(Key=key, ConsistentRead=True).get("Item")
            if done:
                if done.get("fingerprint") != fingerprint:
                    raise RequestIdReused
                return cast("dict[str, Any]", json.loads(done["response"]))
            items, response, stats = plan()
            record = {
                **key,
                "kind": kind,
                "fingerprint": fingerprint,
                "response": json.dumps(response),
                "at": now.isoformat(),
                "ttl": int((now + timedelta(days=REQ_TTL_DAYS)).timestamp()),
            }
            items.append(_put(self.t.name, record, "attribute_not_exists(SK)"))
            try:
                self._transact(items)
            except ClientError as e:
                if e.response.get("Error", {}).get("Code") == "TransactionCanceledException":
                    continue  # something we read changed, or the same request landed meanwhile
                raise
            # site-wide counters (one hot item) stay outside the transaction; a lost bump is harmless
            try:
                self._bump_stats(now, **stats)
            except ClientError:
                log.warning("stats bump failed", exc_info=True)
            return response
        raise Contended

    def _get_many(self, keys: list[Item]) -> dict[str, Item]:
        """Strongly consistent batch read of items in one learner's partition, keyed by SK."""
        out: dict[str, Item] = {}
        pending = list(keys)
        for attempt in range(8):
            if not pending:
                return out
            batch, pending = pending[:100], pending[100:]
            res = self.t.meta.client.batch_get_item(
                RequestItems={self.t.name: {"Keys": batch, "ConsistentRead": True}}
            )
            for it in res.get("Responses", {}).get(self.t.name, []):
                out[it["SK"]] = it
            left = res.get("UnprocessedKeys", {}).get(self.t.name, {}).get("Keys", [])
            if left:
                pending = left + pending
                time.sleep(0.05 * 2**attempt)
        if pending:
            raise Contended
        return out

    def _day_op(self, sub: str, day: str, now: datetime, **counts: int) -> Item:
        adds = {k: v for k, v in counts.items() if v}
        expr = "SET #ttl = :ttl"
        if adds:  # counter names (items, sessions …) can be DynamoDB reserved words: always alias them
            expr += " ADD " + ", ".join(f"#{k} :{k}" for k in adds)
        return _update(
            self.t.name,
            {"PK": pk(sub), "SK": f"DAY#{day}"},
            expr,
            {"#ttl": "ttl", **{f"#{k}": k for k in adds}},
            {
                ":ttl": int((now + timedelta(days=DAY_TTL_DAYS)).timestamp()),
                **{f":{k}": v for k, v in adds.items()},
            },
        )

    def _streak_op(self, sub: str, today: Any) -> tuple[domain.Streak, list[Item]]:
        cur = self.t.get_item(Key={"PK": pk(sub), "SK": "STREAK"}, ConsistentRead=True).get("Item")
        old = (
            domain.Streak(int(cur["current"]), int(cur["longest"]), cur.get("lastDate"))
            if cur
            else domain.Streak(0, 0, None)
        )
        new = old.touch(today)
        if new == old:
            return old, []
        version = int(cur.get("version", 0)) if cur else 0
        return new, [
            _put(
                self.t.name,
                {
                    "PK": pk(sub),
                    "SK": "STREAK",
                    "current": new.current,
                    "longest": new.longest,
                    "lastDate": new.last_date,
                    "version": version + 1,
                },
                "attribute_not_exists(SK) OR #ver = :v",
                {"#ver": "version"},
                {":v": version},
            )
        ]

    def _leaderboard_ops(self, sub: str, prof: Item, today: Any, points: int, now: datetime) -> list[Item]:
        """The week's row with its new score, plus a check that the profile still says what was read
        (opt-in and pseudonym), so an opt-out or rename made meanwhile cannot be undone by this write."""
        if points <= 0:
            return []
        week = domain.iso_week(today)
        key = {"PK": f"LB#{week}", "SK": f"U#{sub}"}
        row = self.t.get_item(Key=key, ConsistentRead=True).get("Item")
        old = int(row["score"]) if row and "score" in row else None
        score = (old or 0) + points
        listed = _opted_in(prof)
        name = prof.get("pseudonym")
        names = {"#ttl": "ttl", "#score": "score"}
        values: Item = {
            ":p": name or "śiṣya",
            ":n": score,
            ":ttl": int((now + timedelta(days=LB_TTL_DAYS)).timestamp()),
        }
        expr = "SET pseudonym = :p, #ttl = :ttl, #score = :n"
        if listed:
            expr += ", GSI1PK = :g, GSI1SK = :s"
            values |= {":g": f"LB#{week}", ":s": f"{score:08d}#{sub}"}
        else:
            expr += " REMOVE GSI1PK, GSI1SK"
        if old is None:
            cond = "attribute_not_exists(#score)"
        else:
            cond = "#score = :old"
            values[":old"] = old
        check_names = {"#st": "settings", "#o": "lbOptIn"}
        check_values: Item = {":opt": listed}
        check = "#st.#o = :opt" if not listed else "(attribute_not_exists(#st.#o) OR #st.#o = :opt)"
        if name is None:
            check += " AND attribute_not_exists(pseudonym)"
        else:
            check += " AND pseudonym = :p"
            check_values[":p"] = name
        return [
            _update(self.t.name, key, expr, names, values, cond),
            {
                "ConditionCheck": {
                    "TableName": self.t.name,
                    "Key": {"PK": pk(sub), "SK": "PROFILE"},
                    "ConditionExpression": check,
                    "ExpressionAttributeNames": check_names,
                    "ExpressionAttributeValues": check_values,
                }
            },
        ]

    def _leaderboard_weeks(self, sub: str, now: datetime) -> set[str]:
        """Weeks that can still hold a leaderboard row for this learner. Every leaderboard bump follows a DAY#
        bump for the same local date, so the DAY# items within the row lifetime (plus slack for TTL lag and
        time zones) cover them all."""
        since = (now - timedelta(days=LB_TTL_DAYS + 14)).date().isoformat()
        days = self._query_all(
            KeyConditionExpression=Key("PK").eq(pk(sub)) & Key("SK").between(f"DAY#{since}", "DAY#9999"),
            ProjectionExpression="SK",
        )
        return {domain.iso_week(datetime.fromisoformat(d["SK"][4:]).date()) for d in days}

    def _sync_leaderboard_rows(self, sub: str, prof: Item, now: datetime) -> None:
        """Bring the learner's leaderboard rows in line with the profile (pseudonym; listed iff opted in)."""
        name = prof.get("pseudonym", "śiṣya")
        listed = _opted_in(prof)
        for week in sorted(self._leaderboard_weeks(sub, now)):
            key = {"PK": f"LB#{week}", "SK": f"U#{sub}"}
            # optimistic: the sort key embeds the score, which a session may change meanwhile
            for _ in range(3):
                row = self.t.get_item(Key=key, ConsistentRead=True).get("Item")
                if not row:
                    break
                score = int(row.get("score", 0))
                try:
                    if listed:
                        self.t.update_item(
                            Key=key,
                            UpdateExpression="SET pseudonym = :p, GSI1PK = :g, GSI1SK = :s",
                            ConditionExpression="#score = :n",
                            ExpressionAttributeNames={"#score": "score"},
                            ExpressionAttributeValues={
                                ":p": name,
                                ":g": f"LB#{week}",
                                ":s": f"{score:08d}#{sub}",
                                ":n": score,
                            },
                        )
                    else:
                        self.t.update_item(
                            Key=key,
                            UpdateExpression="SET pseudonym = :p REMOVE GSI1PK, GSI1SK",
                            ConditionExpression="attribute_exists(PK)",
                            ExpressionAttributeValues={":p": name},
                        )
                    break
                except ClientError as e:
                    if not _conditional_failed(e):
                        raise

    def _bump_stats(self, now: datetime, **counts: int) -> None:
        adds = {k: v for k, v in counts.items() if v}
        if not adds:
            return
        self.t.update_item(
            Key={"PK": f"STAT#{now:%Y-%m-%d}", "SK": "GLOBAL"},
            UpdateExpression="ADD " + ", ".join(f"#{k} :{k}" for k in adds),
            ExpressionAttributeNames={f"#{k}": k for k in adds},
            ExpressionAttributeValues={f":{k}": v for k, v in adds.items()},
        )
