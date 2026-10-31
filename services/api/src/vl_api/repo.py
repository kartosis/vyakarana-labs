"""DynamoDB single-table repository. Keys and access patterns: docs/ARCHITECTURE.md §5.

Capacity is provisioned inside the always-free tier, so writes are batched per practice session
(one request ≈ six small writes) rather than per answer.
"""

from __future__ import annotations

from collections.abc import Iterable, Iterator
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, cast

from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from . import domain
from .models import ReviewsIn, SessionIn, SettingsIn

Item = dict[str, Any]
DAY_TTL_DAYS = 400
LB_TTL_DAYS = 120


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
        prof = self.profile(sub, now)
        correct = sum(1 for a in s.attempts if a.correct)
        total = len(s.attempts)
        pct = round(100 * correct / total)
        prog = self.get(pk(sub), f"PROG#{s.lesson_id}") or {}
        was_completed = prog.get("status") == "completed"
        first_completion = s.completed and not was_completed
        status = "completed" if (s.completed or was_completed) else "practised"
        best = max(int(prog.get("bestScore", 0)), pct)

        self.t.update_item(
            Key={"PK": pk(sub), "SK": f"PROG#{s.lesson_id}"},
            UpdateExpression="SET #st = :st, bestScore = :b, lastScore = :l, lastAt = :now"
            + (", completedAt = :now" if first_completion else "")
            + " ADD #att :one",
            ExpressionAttributeNames={"#st": "status", "#att": "attempts"},
            ExpressionAttributeValues={
                ":st": status,
                ":b": best,
                ":l": pct,
                ":now": now.isoformat(),
                ":one": 1,
            },
        )

        cards_added = 0
        if s.completed:
            for cid in s.new_cards:
                state = _num(domain.new_card_state(now))
                try:
                    self.t.put_item(
                        Item={
                            "PK": pk(sub),
                            "SK": f"CARD#{cid}",
                            "lesson": s.lesson_id,
                            "state": state,
                            "due": now.isoformat(),
                            "LSI1SK": f"DUE#{now.isoformat()}",
                        },
                        ConditionExpression="attribute_not_exists(SK)",
                    )
                    cards_added += 1
                except ClientError as e:
                    if not _conditional_failed(e):
                        raise

        today = domain.local_date(now, s.tz)
        ms = sum(a.ms for a in s.attempts)
        self._bump_day(
            sub, today.isoformat(), now, items=total, correct=correct, ms=ms, lessons=int(first_completion)
        )
        streak = self._touch_streak(sub, today)
        score = domain.session_score(correct, first_completion)
        self._bump_leaderboard(sub, prof, today, score, now)
        self._bump_stats(now, sessions=1, items=total)
        return {
            "score": pct,
            "best": best,
            "status": status,
            "firstCompletion": first_completion,
            "cardsAdded": cards_added,
            "streak": {"current": streak.current, "longest": streak.longest},
            "points": score,
        }

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
        prof = self.profile(sub, now)
        reviewed = 0
        correct = 0
        for item in r.items:
            card = self.get(pk(sub), f"CARD#{item.card_id}")
            if not card:
                continue
            new_state = domain.review(plain(card["state"]), item.rating, now, item.ms)
            due = str(new_state["due"])
            self.t.update_item(
                Key={"PK": pk(sub), "SK": f"CARD#{item.card_id}"},
                UpdateExpression="SET #state = :s, #due = :d, LSI1SK = :k, lastRating = :r ADD #rev :one",
                ExpressionAttributeNames={"#state": "state", "#due": "due", "#rev": "reviews"},
                ExpressionAttributeValues={
                    ":s": _num(new_state),
                    ":d": due,
                    ":k": f"DUE#{due}",
                    ":r": item.rating,
                    ":one": 1,
                },
            )
            reviewed += 1
            correct += int(item.rating >= 3)
        if reviewed:
            today = domain.local_date(now, r.tz)
            self._bump_day(sub, today.isoformat(), now, reviews=reviewed, correct=correct)
            self._touch_streak(sub, today)
            self._bump_leaderboard(sub, prof, today, correct, now)
            self._bump_stats(now, reviews=reviewed)
        return {"reviewed": reviewed, "correct": correct}

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
    def _bump_day(self, sub: str, day: str, now: datetime, **counts: int) -> None:
        adds = {k: v for k, v in counts.items() if v}
        expr = "SET #ttl = :ttl"
        if adds:  # counter names (items, sessions …) can be DynamoDB reserved words: always alias them
            expr += " ADD " + ", ".join(f"#{k} :{k}" for k in adds)
        self.t.update_item(
            Key={"PK": pk(sub), "SK": f"DAY#{day}"},
            UpdateExpression=expr,
            ExpressionAttributeNames={"#ttl": "ttl", **{f"#{k}": k for k in adds}},
            ExpressionAttributeValues={
                ":ttl": int((now + timedelta(days=DAY_TTL_DAYS)).timestamp()),
                **{f":{k}": v for k, v in adds.items()},
            },
        )

    def _touch_streak(self, sub: str, today: Any) -> domain.Streak:
        for _ in range(3):  # optimistic concurrency
            cur = self.get(pk(sub), "STREAK")
            old = (
                domain.Streak(int(cur["current"]), int(cur["longest"]), cur.get("lastDate"))
                if cur
                else domain.Streak(0, 0, None)
            )
            new = old.touch(today)
            if new == old:
                return old
            version = int(cur.get("version", 0)) if cur else 0
            try:
                self.t.put_item(
                    Item={
                        "PK": pk(sub),
                        "SK": "STREAK",
                        "current": new.current,
                        "longest": new.longest,
                        "lastDate": new.last_date,
                        "version": version + 1,
                    },
                    ConditionExpression="attribute_not_exists(SK) OR #ver = :v",
                    ExpressionAttributeNames={"#ver": "version"},
                    ExpressionAttributeValues={":v": version},
                )
                return new
            except ClientError as e:
                if not _conditional_failed(e):
                    raise
        return old

    def _bump_leaderboard(self, sub: str, prof: Item, today: Any, points: int, now: datetime) -> None:
        if points <= 0:
            return
        week = domain.iso_week(today)
        out = self.t.update_item(
            Key={"PK": f"LB#{week}", "SK": f"U#{sub}"},
            UpdateExpression="SET pseudonym = :p, #ttl = :ttl ADD #score :n",
            ExpressionAttributeNames={"#ttl": "ttl", "#score": "score"},
            ExpressionAttributeValues={
                ":p": prof.get("pseudonym", "śiṣya"),
                ":n": points,
                ":ttl": int((now + timedelta(days=LB_TTL_DAYS)).timestamp()),
            },
            ReturnValues="UPDATED_NEW",
        )
        score = int(out["Attributes"]["score"])
        key = {"PK": f"LB#{week}", "SK": f"U#{sub}"}
        if _opted_in(prof):
            self.t.update_item(
                Key=key,
                UpdateExpression="SET GSI1PK = :g, GSI1SK = :s",
                ExpressionAttributeValues={":g": f"LB#{week}", ":s": f"{score:08d}#{sub}"},
            )
        else:
            self.t.update_item(Key=key, UpdateExpression="REMOVE GSI1PK, GSI1SK")

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
