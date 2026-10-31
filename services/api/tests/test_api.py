from __future__ import annotations

from typing import Any

from conftest import Call, make_token


def session(
    lesson: str = "samjna/pratyahara", completed: bool = True, n: int = 5, correct: int = 4
) -> dict[str, Any]:
    return {
        "lessonId": lesson,
        "attempts": [{"itemId": f"q{i}", "correct": i < correct, "ms": 3000} for i in range(n)],
        "completed": completed,
        "newCards": ["prat:ac", "prat:hal"] if completed else [],
        "tz": "Asia/Kolkata",
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

    status, rev, _ = call(
        "POST",
        "/api/v1/reviews",
        {"items": [{"cardId": "prat:ac", "rating": 3, "ms": 2500}], "tz": "Asia/Kolkata"},
        token=t,
    )
    assert rev == {"reviewed": 1, "correct": 1}
    status, due, _ = call("GET", "/api/v1/reviews/due", token=t)
    assert [c["cardId"] for c in due["cards"]] == ["prat:hal"]

    status, lb, res = call("GET", "/api/v1/leaderboard/current")
    assert status == 200 and lb["rows"][0]["score"] == 14 + 2 + 1
    assert res["headers"]["Cache-Control"].startswith("public")


def test_leaderboard_opt_out_hides_learner(call: Call) -> None:
    a, b = make_token("a"), make_token("b")
    call("POST", "/api/v1/sessions", session(), token=a)
    call("POST", "/api/v1/sessions", session(), token=b)
    assert len(call("GET", "/api/v1/leaderboard/current")[1]["rows"]) == 2
    call("PATCH", "/api/v1/me", {"lbOptIn": False}, token=b)
    call("POST", "/api/v1/sessions", session(completed=False), token=b)
    rows = call("GET", "/api/v1/leaderboard/current")[1]["rows"]
    assert len(rows) == 1


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
