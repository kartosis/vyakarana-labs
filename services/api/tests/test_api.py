from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Any

import pytest

from conftest import Call, make_token
from vl_api import domain


def session(
    lesson: str = "samjna/pratyahara", completed: bool = True, n: int = 5, correct: int = 4
) -> dict[str, Any]:
    return {
        "lessonId": lesson,
        "attempts": [{"itemId": f"q{i}", "correct": i < correct, "ms": 3000} for i in range(n)],
        "completed": completed,
        "newCards": ["prat:ac", "prat:hal"] if completed else [],
        "tz": "Asia/Kolkata",
        "requestId": str(uuid.uuid4()),
    }


def reviews(*ratings: tuple[str, int]) -> dict[str, Any]:
    return {
        "items": [{"cardId": c, "rating": r, "ms": 2500} for c, r in ratings],
        "tz": "Asia/Kolkata",
        "requestId": str(uuid.uuid4()),
    }


def test_health(call: Call) -> None:
    status, body, _ = call("GET", "/api/v1/health")
    assert status == 200 and body == {"ok": True}


def test_auth_required_and_never_403(call: Call) -> None:
    status, body, res = call("GET", "/api/v1/me")
    assert status == 401
    assert res["headers"]["Content-Type"] == "application/problem+json"
    assert body["type"].endswith("/unauthorized")


def test_rejects_id_tokens_and_foreign_clients(call: Call) -> None:
    assert call("GET", "/api/v1/me", token=make_token(token_use="id"))[0] == 401
    assert call("GET", "/api/v1/me", token=make_token(client_id="someone-else"))[0] == 401
    assert call("GET", "/api/v1/me", token=make_token(exp=1))[0] == 401


def test_profile_is_created_with_pseudonym(call: Call) -> None:
    status, body, _ = call("GET", "/api/v1/me", token=make_token())
    assert status == 200
    assert "-" in body["pseudonym"] and body["settings"]["script"] == "deva"
    assert body["admin"] is False


def test_settings_update_validates(call: Call) -> None:
    t = make_token()
    status, body, _ = call("PATCH", "/api/v1/me", {"script": "iast", "dailyGoal": 20}, token=t)
    assert status == 200 and body["settings"]["script"] == "iast" and body["settings"]["dailyGoal"] == 20
    assert call("PATCH", "/api/v1/me", {"script": "klingon"}, token=t)[0] == 400
    assert call("PATCH", "/api/v1/me", {"unknown": 1}, token=t)[0] == 400


def test_practice_flow_updates_progress_streak_cards_and_leaderboard(call: Call) -> None:
    t = make_token("learner-a")
    status, body, _ = call("POST", "/api/v1/sessions", session(), token=t)
    assert status == 200
    assert body["firstCompletion"] is True and body["score"] == 80 and body["cardsAdded"] == 2
    assert body["streak"]["current"] == 1 and body["points"] == 14

    # Second completion: no bonus, no duplicate cards, best score kept.
    status, body, _ = call("POST", "/api/v1/sessions", session(correct=2), token=t)
    assert body["firstCompletion"] is False and body["cardsAdded"] == 0 and body["best"] == 80

    status, prog, _ = call("GET", "/api/v1/progress", token=t, query="tz=Asia/Kolkata")
    lesson = prog["lessons"]["samjna/pratyahara"]
    assert lesson["status"] == "completed" and lesson["attempts"] == 2
    assert prog["streak"]["current"] == 1 and prog["due"] == 2

    status, due, _ = call("GET", "/api/v1/reviews/due", token=t)
    assert {c["cardId"] for c in due["cards"]} == {"prat:ac", "prat:hal"}

    status, rev, _ = call("POST", "/api/v1/reviews", reviews(("prat:ac", 3)), token=t)
    assert rev == {"reviewed": 1, "correct": 1, "skipped": 0}
    status, due, _ = call("GET", "/api/v1/reviews/due", token=t)
    assert [c["cardId"] for c in due["cards"]] == ["prat:hal"]

    status, lb, res = call("GET", "/api/v1/leaderboard/current")
    assert status == 200 and lb["rows"][0]["score"] == 14 + 2 + 1
    assert res["headers"]["Cache-Control"].startswith("public")


def test_leaderboard_opt_out_and_rename_apply_at_once(call: Call, monkeypatch: pytest.MonkeyPatch) -> None:
    """Review #4. The old test posted another session after opting out, which hid that the row only
    disappeared on the learner's next activity. Now: no activity after the change."""
    a, b = make_token("a"), make_token("b")
    real = domain.utcnow
    earlier = real() - timedelta(weeks=3)
    monkeypatch.setattr(domain, "utcnow", lambda: earlier)
    call("POST", "/api/v1/sessions", session(), token=b)  # b also practised three weeks ago
    monkeypatch.setattr(domain, "utcnow", real)
    call("POST", "/api/v1/sessions", session(), token=a)
    call("POST", "/api/v1/sessions", session(), token=b)
    past = f"/api/v1/leaderboard/{domain.iso_week(domain.local_date(earlier, 'Asia/Kolkata'))}"
    now = "/api/v1/leaderboard/current"

    def names(path: str) -> list[str]:
        return [r["pseudonym"] for r in call("GET", path)[1]["rows"]]

    def scores(path: str) -> dict[str, int]:
        return {r["pseudonym"]: r["score"] for r in call("GET", path)[1]["rows"]}

    b_name = call("GET", "/api/v1/me", token=b)[1]["pseudonym"]
    assert len(names(now)) == 2 and names(past) == [b_name]
    b_score = scores(now)[b_name]

    call("PATCH", "/api/v1/me", {"lbOptIn": False}, token=b)
    assert b_name not in names(now) and len(names(now)) == 1
    assert names(past) == []  # earlier weeks too

    call("PATCH", "/api/v1/me", {"pseudonym": "Pāṇini's pupil"}, token=a)
    assert names(now) == ["Pāṇini's pupil"]

    call("PATCH", "/api/v1/me", {"lbOptIn": True}, token=b)  # opting back in restores the rows, score intact
    assert set(names(now)) == {"Pāṇini's pupil", b_name} and scores(now)[b_name] == b_score
    assert names(past) == [b_name]

    call("PATCH", "/api/v1/me", {"dailyGoal": 20}, token=b)  # unrelated settings leave the rows alone
    assert len(names(now)) == 2


def test_implausibly_fast_sessions_are_refused(call: Call) -> None:
    s = session()
    for a in s["attempts"]:
        a["ms"] = 50
    status, body, _ = call("POST", "/api/v1/sessions", s, token=make_token())
    assert status == 422 and body["type"].endswith("/implausible")


def test_invalid_lesson_ids_are_refused(call: Call) -> None:
    assert call("POST", "/api/v1/sessions", session(lesson="../etc/passwd"), token=make_token())[0] == 400


def test_guest_merge_does_not_overwrite(call: Call) -> None:
    t = make_token()
    call("POST", "/api/v1/sessions", session(), token=t)
    _status, body, _ = call(
        "POST", "/api/v1/progress/merge", {"read": ["samjna/pratyahara", "varnamala/sounds"]}, token=t
    )
    assert body["added"] == 1
    prog = call("GET", "/api/v1/progress", token=t)[1]
    assert prog["lessons"]["samjna/pratyahara"]["status"] == "completed"
    assert prog["lessons"]["varnamala/sounds"]["status"] == "read"


def test_session_cookie_is_httponly_and_scoped(call: Call) -> None:
    status, _, res = call("POST", "/api/v1/auth/session", {"refreshToken": "r" * 40}, token=make_token())
    assert status == 200
    cookie = res["cookies"][0]
    assert cookie.startswith("vl_rt=") and "HttpOnly" in cookie and "Secure" in cookie
    assert "Path=/api/v1/auth" in cookie and "SameSite=Strict" in cookie


def test_refresh_without_cookie_is_401(call: Call) -> None:
    assert call("POST", "/api/v1/auth/refresh")[0] == 401


def test_export_and_delete(call: Call, aws: Any) -> None:
    t = make_token("leaving")
    call("POST", "/api/v1/sessions", session(), token=t)
    status, exp, _ = call("GET", "/api/v1/me/export", token=t)
    kinds = {i["SK"].split("#")[0] for i in exp["items"]}
    assert {"PROFILE", "PROG", "CARD", "DAY", "STREAK"} <= kinds

    from unittest.mock import patch

    with patch("vl_api.app.cognito") as cog:
        status, body, _res = call("DELETE", "/api/v1/me", token=t)
        cog.return_value.admin_delete_user.assert_called_once()
    assert status == 200 and body["deletedItems"] >= 5
    assert call("GET", "/api/v1/me/export", token=t)[1]["items"] == []
    assert call("GET", "/api/v1/leaderboard/current")[1]["rows"] == []


def test_review_limit_is_validated(call: Call) -> None:
    """External review #14: a bad limit was a 500 (ValueError) or reached DynamoDB as 0 / negative."""
    t = make_token()
    for bad in ("abc", "0", "-5", "101", "1.5", ""):
        status, body, _ = call("GET", "/api/v1/reviews/due", token=t, query=f"limit={bad}")
        if bad == "":
            assert status == 200  # empty means the default
        else:
            assert status == 400, (bad, status, body)
    for good in ("1", "50", "100"):
        assert call("GET", "/api/v1/reviews/due", token=t, query=f"limit={good}")[0] == 200


# ---------------------------------------------------------------- review #1, #8: session integrity
def totals(call: Call, t: str) -> tuple[int, int, int, int]:
    """(attempts on the lesson, items today, due cards, this week's score): what a double count changes."""
    prog = call("GET", "/api/v1/progress", token=t, query="tz=Asia/Kolkata")[1]
    rows = call("GET", "/api/v1/leaderboard/current")[1]["rows"]
    lesson = prog["lessons"].get("samjna/pratyahara", {})
    return (
        lesson.get("attempts", 0),
        prog["today"].get("items", 0),
        prog["due"],
        sum(r["score"] for r in rows),
    )


def test_request_id_is_required(call: Call) -> None:
    s = session()
    del s["requestId"]
    assert call("POST", "/api/v1/sessions", s, token=make_token())[0] == 400
    r = reviews(("prat:ac", 3))
    del r["requestId"]
    assert call("POST", "/api/v1/reviews", r, token=make_token())[0] == 400


def test_session_replay_returns_the_first_response_and_counts_once(call: Call) -> None:
    t = make_token()
    s = session()
    first = call("POST", "/api/v1/sessions", s, token=t)
    once = totals(call, t)
    again = call("POST", "/api/v1/sessions", s, token=t)
    assert again[0] == 200 and again[1] == first[1] and first[1]["firstCompletion"] is True
    assert totals(call, t) == once == (1, 5, 2, 14)


def test_request_id_reused_with_another_body_is_409(call: Call) -> None:
    t = make_token()
    s = session()
    call("POST", "/api/v1/sessions", s, token=t)
    other = {**s, "attempts": s["attempts"][:3]}
    status, problem, _ = call("POST", "/api/v1/sessions", other, token=t)
    assert status == 409 and problem["type"].endswith("request-id-reused")


def test_request_ids_are_per_learner(call: Call) -> None:
    s = session()
    a = call("POST", "/api/v1/sessions", s, token=make_token("a"))
    b = call("POST", "/api/v1/sessions", s, token=make_token("b"))
    assert a[0] == b[0] == 200 and b[1]["firstCompletion"] is True


def test_lost_response_then_retry_counts_once(call: Call, monkeypatch: pytest.MonkeyPatch) -> None:
    """The write commits but the answer never reaches the learner (timeout): the retry must not count again
    and must still report the first-completion bonus."""
    from vl_api.repo import Repo

    real = Repo._transact
    lost = {"n": 0}

    def commit_then_fail(self: Repo, items: list[dict[str, Any]]) -> None:
        real(self, items)
        if lost["n"] == 0:
            lost["n"] += 1
            raise TimeoutError("response lost")

    monkeypatch.setattr(Repo, "_transact", commit_then_fail)
    t = make_token()
    s = session()
    with pytest.raises(TimeoutError):
        call("POST", "/api/v1/sessions", s, token=t)
    status, body, _ = call("POST", "/api/v1/sessions", s, token=t)
    assert status == 200 and body["firstCompletion"] is True and body["points"] == 14
    assert totals(call, t) == (1, 5, 2, 14)


def test_failure_before_commit_writes_nothing(call: Call, monkeypatch: pytest.MonkeyPatch) -> None:
    from vl_api.repo import Repo

    real = Repo._transact
    failed = {"n": 0}

    def fail_once(self: Repo, items: list[dict[str, Any]]) -> None:
        if failed["n"] == 0:
            failed["n"] += 1
            raise TimeoutError("network")
        real(self, items)

    monkeypatch.setattr(Repo, "_transact", fail_once)
    t = make_token()
    s = session()
    with pytest.raises(TimeoutError):
        call("POST", "/api/v1/sessions", s, token=t)
    assert totals(call, t) == (0, 0, 0, 0)  # all or nothing
    status, body, _ = call("POST", "/api/v1/sessions", s, token=t)
    assert status == 200 and body["firstCompletion"] is True
    assert totals(call, t) == (1, 5, 2, 14)


def test_concurrent_write_is_retried_not_lost(call: Call, aws: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    """Another request changes the leaderboard row between our read and our write: the transaction is refused
    and recomputed, so neither update is lost."""
    from vl_api.repo import Repo

    t = make_token("racer")
    call("POST", "/api/v1/sessions", session(), token=t)  # score 14
    real = Repo._transact
    raced = {"n": 0}

    def race(self: Repo, items: list[dict[str, Any]]) -> None:
        if raced["n"] == 0:
            raced["n"] += 1
            week = call("GET", "/api/v1/leaderboard/current")[1]["week"]
            aws.update_item(
                Key={"PK": f"LB#{week}", "SK": "U#racer"},
                UpdateExpression="ADD #s :n",
                ExpressionAttributeNames={"#s": "score"},
                ExpressionAttributeValues={":n": 100},
            )
        real(self, items)

    monkeypatch.setattr(Repo, "_transact", race)
    status, body, _ = call("POST", "/api/v1/sessions", session(correct=2), token=t)
    assert status == 200 and body["points"] == 2
    assert totals(call, t)[3] == 14 + 100 + 2


def test_opt_out_during_a_session_is_not_undone(
    call: Call, aws: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Left open by the #4 fix: a session that read the profile before an opt-out must not re-list the row."""
    from vl_api.repo import Repo

    t = make_token("shy")
    call("POST", "/api/v1/sessions", session(), token=t)
    real = Repo._transact
    raced = {"n": 0}

    def opt_out_meanwhile(self: Repo, items: list[dict[str, Any]]) -> None:
        if raced["n"] == 0:
            raced["n"] += 1
            call("PATCH", "/api/v1/me", {"lbOptIn": False}, token=t)
        real(self, items)

    monkeypatch.setattr(Repo, "_transact", opt_out_meanwhile)
    assert call("POST", "/api/v1/sessions", session(correct=2), token=t)[0] == 200
    assert call("GET", "/api/v1/leaderboard/current")[1]["rows"] == []


def test_review_rejects_duplicate_cards(call: Call) -> None:
    t = make_token()
    call("POST", "/api/v1/sessions", session(), token=t)
    for n in (2, 50):
        status, problem, _ = call("POST", "/api/v1/reviews", reviews(*[("prat:ac", 4)] * n), token=t)
        assert status == 400 and "more than once" in problem["detail"]
    assert totals(call, t)[3] == 14  # nothing counted


def test_review_of_a_card_not_due_is_skipped(call: Call) -> None:
    t = make_token()
    call("POST", "/api/v1/sessions", session(), token=t)
    first = call("POST", "/api/v1/reviews", reviews(("prat:ac", 4), ("prat:hal", 3)), token=t)[1]
    assert first == {"reviewed": 2, "correct": 2, "skipped": 0}
    score = totals(call, t)[3]
    again = call("POST", "/api/v1/reviews", reviews(("prat:ac", 4), ("prat:none", 4)), token=t)[1]
    assert again == {"reviewed": 0, "correct": 0, "skipped": 2}  # no longer due; not a card of this learner
    assert totals(call, t)[3] == score


def test_review_replay_counts_once(call: Call) -> None:
    t = make_token()
    call("POST", "/api/v1/sessions", session(), token=t)
    r = reviews(("prat:ac", 3))
    first = call("POST", "/api/v1/reviews", r, token=t)[1]
    score = totals(call, t)[3]
    assert (
        call("POST", "/api/v1/reviews", r, token=t)[1] == first == {"reviewed": 1, "correct": 1, "skipped": 0}
    )
    assert totals(call, t)[3] == score


def test_review_batch_limit(call: Call) -> None:
    t = make_token()
    many = reviews(*[(f"c{i}", 3) for i in range(51)])
    assert call("POST", "/api/v1/reviews", many, token=t)[0] == 400


# ---------------------------------------------------------------- review #7: "Mark as read" when signed in
def lessons(call: Call, t: str) -> dict[str, str]:
    status, body, _ = call("GET", "/api/v1/progress/lessons", token=t)
    assert status == 200
    return dict(body["lessons"])


def test_mark_and_unmark_read(call: Call) -> None:
    t = make_token()
    mark = {"lessonId": "varnamala/sounds", "read": True}
    assert call("POST", "/api/v1/progress/read", mark, token=t)[1] == {
        "lessonId": "varnamala/sounds",
        "status": "read",
    }
    assert call("POST", "/api/v1/progress/read", mark, token=t)[1]["status"] == "read"  # idempotent
    assert lessons(call, t) == {"varnamala/sounds": "read"}
    unmark = {"lessonId": "varnamala/sounds", "read": False}
    assert call("POST", "/api/v1/progress/read", unmark, token=t)[1]["status"] == "none"
    assert call("POST", "/api/v1/progress/read", unmark, token=t)[1]["status"] == "none"
    assert lessons(call, t) == {}


def test_read_mark_never_overrides_practice(call: Call) -> None:
    t = make_token()
    call("POST", "/api/v1/sessions", session(), token=t)
    lid = "samjna/pratyahara"
    assert (
        call("POST", "/api/v1/progress/read", {"lessonId": lid, "read": True}, token=t)[1]["status"]
        == "completed"
    )
    assert (
        call("POST", "/api/v1/progress/read", {"lessonId": lid, "read": False}, token=t)[1]["status"]
        == "completed"
    )
    assert lessons(call, t) == {lid: "completed"}
    assert call("GET", "/api/v1/progress", token=t)[1]["lessons"][lid]["attempts"] == 1


def test_read_marks_need_sign_in_and_valid_ids(call: Call) -> None:
    assert call("POST", "/api/v1/progress/read", {"lessonId": "a/b", "read": True})[0] == 401
    assert call("GET", "/api/v1/progress/lessons")[0] == 401
    t = make_token()
    assert call("POST", "/api/v1/progress/read", {"lessonId": "../x", "read": True}, token=t)[0] == 400
    with_id = {"lessonId": "a/b", "read": True, "requestId": str(uuid.uuid4())}  # sent through the outbox
    assert call("POST", "/api/v1/progress/read", with_id, token=t)[0] == 200


# ---------------------------------------------------------------- P1 exit review X2, X13: deletion is final
def user_partition(aws: Any, sub: str) -> list[str]:
    from boto3.dynamodb.conditions import Key

    return [it["SK"] for it in aws.query(KeyConditionExpression=Key("PK").eq(f"USER#{sub}"))["Items"]]


def delete_account(call: Call, t: str) -> tuple[int, Any]:
    from unittest.mock import patch

    with patch("vl_api.app.cognito"):
        status, body, _ = call("DELETE", "/api/v1/me", token=t)
    return status, body


def test_deleted_account_is_not_recreated_by_its_still_valid_token(call: Call, aws: Any) -> None:
    t = make_token("gone")
    call("POST", "/api/v1/sessions", session(), token=t)
    assert delete_account(call, t)[0] == 200
    # another tab still holds the access token (valid up to an hour) and flushes its outbox
    attempts = [
        ("POST", "/api/v1/sessions", session()),
        ("POST", "/api/v1/reviews", reviews(("prat:ac", 3))),
        ("POST", "/api/v1/progress/read", {"lessonId": "a/b", "read": True}),
        ("POST", "/api/v1/progress/merge", {"read": ["a/b"]}),
        ("PATCH", "/api/v1/me", {"dailyGoal": 20}),
        ("GET", "/api/v1/me", None),
    ]
    for method, path, body in attempts:
        status, problem, _ = call(method, path, body, token=t)
        assert status == 401 and problem["type"].endswith("account-deleted"), (method, path, status)
    assert user_partition(aws, "gone") == ["DELETED"]  # only the tombstone: no profile, no data
    assert call("GET", "/api/v1/leaderboard/current")[1]["rows"] == []


def test_save_in_flight_when_deletion_starts_is_refused(call: Call, aws: Any) -> None:
    """The tombstone is written first; a transaction computed before it must not land after it."""
    t = make_token("racing")
    call("POST", "/api/v1/sessions", session(), token=t)
    before = sorted(user_partition(aws, "racing"))
    aws.put_item(Item={"PK": "USER#racing", "SK": "DELETED", "at": "now"})  # deletion has begun
    status, problem, _ = call(
        "POST", "/api/v1/sessions", session(correct=0), token=t
    )  # 0 points: no leaderboard op
    assert status == 401 and problem["type"].endswith("account-deleted")
    assert sorted(user_partition(aws, "racing")) == sorted([*before, "DELETED"])  # nothing new written


def test_delete_retry_after_lost_response_succeeds(call: Call) -> None:
    from unittest.mock import patch

    from botocore.exceptions import ClientError

    t = make_token("twice")
    call("POST", "/api/v1/sessions", session(), token=t)
    assert delete_account(call, t)[0] == 200
    gone = ClientError({"Error": {"Code": "UserNotFoundException", "Message": "x"}}, "AdminDeleteUser")
    with patch("vl_api.app.cognito") as cog:
        cog.return_value.admin_delete_user.side_effect = gone
        status, body, _ = call("DELETE", "/api/v1/me", token=t)
    assert status == 200 and body["deletedItems"] == 0


# ---------------------------------------------------------------- X4: a retry repairs a failed row sync
def test_failed_opt_out_sync_is_repaired_by_retrying(call: Call, monkeypatch: pytest.MonkeyPatch) -> None:
    from vl_api.repo import Repo

    t = make_token("shy2")
    call("POST", "/api/v1/sessions", session(), token=t)
    real = Repo._sync_leaderboard_rows
    failed = {"n": 0}

    def flaky(self: Repo, *a: Any) -> None:
        if failed["n"] == 0:
            failed["n"] += 1
            raise TimeoutError("throttled")
        real(self, *a)

    monkeypatch.setattr(Repo, "_sync_leaderboard_rows", flaky)
    with pytest.raises(TimeoutError):
        call("PATCH", "/api/v1/me", {"lbOptIn": False}, token=t)
    assert call("PATCH", "/api/v1/me", {"lbOptIn": False}, token=t)[0] == 200  # profile already says False
    assert call("GET", "/api/v1/leaderboard/current")[1]["rows"] == []


# ---------------------------------------------------------------- X8: limit
@pytest.mark.parametrize("raw", ["%C2%B2", "²", "9" * 5000, "١٢"])
def test_review_limit_rejects_non_ascii_and_huge_numbers(call: Call, raw: str) -> None:
    status, problem, _ = call("GET", "/api/v1/reviews/due", token=make_token(), query=f"limit={raw}")
    assert status == 400 and problem["type"].endswith("invalid-limit")


# ---------------------------------------------------------------- X15: retry only retryable cancellations
def test_invalid_transaction_is_not_retried(call: Call, monkeypatch: pytest.MonkeyPatch) -> None:
    from botocore.exceptions import ClientError

    from vl_api.repo import Repo

    calls = {"n": 0}

    def invalid(self: Repo, items: list[dict[str, Any]]) -> None:
        calls["n"] += 1
        raise ClientError(
            {
                "Error": {"Code": "TransactionCanceledException", "Message": "x"},
                "CancellationReasons": [{"Code": "ValidationError", "Message": "bad"}],
            },
            "TransactWriteItems",
        )

    monkeypatch.setattr(Repo, "_transact", invalid)
    with pytest.raises(ClientError):
        call("POST", "/api/v1/sessions", session(), token=make_token())
    assert calls["n"] == 1
