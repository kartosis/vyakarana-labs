"""Lambda entry point: Powertools router behind a Function URL, behind CloudFront at /api/v1/*."""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

import boto3
from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.event_handler import LambdaFunctionUrlResolver, Response
from aws_lambda_powertools.shared.cookies import Cookie, SameSite
from pydantic import ValidationError

from . import domain
from .auth import Principal, principal_from_headers
from .config import settings
from .errors import ApiError, bad_request, unauthorized
from .models import MergeIn, ReadIn, ReviewsIn, SessionIn, SessionTokensIn, SettingsIn, normalize_tz
from .repo import Contended, Repo, RequestIdReused

logger = Logger(service="vl-api")
tracer = Tracer(service="vl-api")
app = LambdaFunctionUrlResolver()

PREFIX = "/api/v1"
REFRESH_COOKIE = "vl_rt"
AUTH_PATH = f"{PREFIX}/auth"


@lru_cache(maxsize=1)
def repo() -> Repo:
    return Repo(boto3.resource("dynamodb").Table(settings().table_name))


@lru_cache(maxsize=1)
def cognito() -> Any:
    return boto3.client("cognito-idp")


def me() -> Principal:
    return principal_from_headers(dict(app.current_event.headers or {}))


def body(model: type[Any]) -> Any:
    try:
        raw = app.current_event.json_body
    except (json.JSONDecodeError, TypeError) as exc:
        raise bad_request("Body must be JSON.") from exc
    try:
        return model.model_validate(raw or {})
    except ValidationError as exc:
        raise bad_request(
            "; ".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors())
        ) from exc


def ok(
    data: Any, status: int = 200, cookies: list[Cookie] | None = None, cache: str = "no-store"
) -> Response[str]:
    return Response(
        status_code=status,
        content_type="application/json",
        body=json.dumps(data, ensure_ascii=False),
        headers={"Cache-Control": cache},
        cookies=cookies,
    )


def refresh_cookie(value: str, max_age: int) -> Cookie:
    return Cookie(
        name=REFRESH_COOKIE,
        value=value,
        path=AUTH_PATH,
        secure=settings().cookie_secure,
        http_only=True,
        max_age=max_age,
        same_site=SameSite.STRICT_MODE,
    )


def cookie_value(name: str) -> str | None:
    for c in app.current_event.cookies or []:
        k, _, v = c.partition("=")
        if k.strip() == name:
            return v.strip()
    return None


@app.exception_handler(ApiError)  # type: ignore[untyped-decorator]  # Powertools' decorator is untyped
def _api_error(e: ApiError) -> Response[str]:
    return e.response()


@app.exception_handler(RequestIdReused)  # type: ignore[untyped-decorator]
def _reused(_: RequestIdReused) -> Response[str]:
    return ApiError(
        409,
        "request-id-reused",
        "Request id already used",
        "This request id was used for different data. Send a new id for new data.",
    ).response()


@app.exception_handler(Contended)  # type: ignore[untyped-decorator]
def _contended(_: Contended) -> Response[str]:
    r = ApiError(503, "busy", "Busy", "Your data changed while saving. Try again; nothing was counted twice.")
    out = r.response()
    out.headers["Retry-After"] = "1"
    return out


# ---------------------------------------------------------------- health
@app.get(f"{PREFIX}/health")
def health() -> Response[str]:
    return ok({"ok": True})


# ---------------------------------------------------------------- session (token handler)
@app.post(f"{AUTH_PATH}/session")
def start_session() -> Response[str]:
    """Browser has just signed in with Cognito: keep the refresh token in an HttpOnly cookie."""
    me()  # the access token must be valid
    tokens = body(SessionTokensIn)
    max_age = settings().refresh_cookie_days * 86400
    return ok({"ok": True}, cookies=[refresh_cookie(tokens.refresh_token, max_age)])


@app.post(f"{AUTH_PATH}/refresh")
def refresh() -> Response[str]:
    token = cookie_value(REFRESH_COOKIE)
    if not token:
        raise unauthorized("No saved session.")
    try:
        out = cognito().initiate_auth(
            ClientId=settings().client_id,
            AuthFlow="REFRESH_TOKEN_AUTH",
            AuthParameters={"REFRESH_TOKEN": token},
        )
    except cognito().exceptions.NotAuthorizedException as exc:
        raise ApiError(401, "session-expired", "Session expired", "Sign in again.") from exc
    res = out["AuthenticationResult"]
    return ok(
        {"accessToken": res["AccessToken"], "idToken": res.get("IdToken"), "expiresIn": res["ExpiresIn"]}
    )


@app.post(f"{AUTH_PATH}/logout")
def logout() -> Response[str]:
    token = cookie_value(REFRESH_COOKIE)
    if token:
        try:
            cognito().revoke_token(Token=token, ClientId=settings().client_id)
        except Exception:  # revocation is best-effort; the cookie is cleared regardless
            logger.warning("revoke_token failed")
    return ok({"ok": True}, cookies=[refresh_cookie("", 0)])


# ---------------------------------------------------------------- profile
def profile_view(item: dict[str, Any]) -> dict[str, Any]:
    from .repo import plain

    return {
        "pseudonym": item.get("pseudonym"),
        "settings": plain(item.get("settings", {})),
        "createdAt": item.get("createdAt"),
    }


@app.get(f"{PREFIX}/me")
def get_me() -> Response[str]:
    p = me()
    item = repo().profile(p.sub, domain.utcnow())
    return ok({**profile_view(item), "admin": p.is_admin})


@app.patch(f"{PREFIX}/me")
def patch_me() -> Response[str]:
    p = me()
    item = repo().update_settings(p.sub, body(SettingsIn), domain.utcnow())
    return ok(profile_view(item))


@app.delete(f"{PREFIX}/me")
def delete_me() -> Response[str]:
    p = me()
    removed = repo().delete_user(p.sub)
    cognito().admin_delete_user(UserPoolId=settings().user_pool_id, Username=p.username)
    return ok({"deletedItems": removed}, cookies=[refresh_cookie("", 0)])


@app.get(f"{PREFIX}/me/export")
def export_me() -> Response[str]:
    p = me()
    return ok({"sub": p.sub, "items": repo().export(p.sub)})


# ---------------------------------------------------------------- progress
@app.get(f"{PREFIX}/progress")
def get_progress() -> Response[str]:
    p = me()
    tz = normalize_tz(app.current_event.get_query_string_value("tz", "UTC") or "UTC")
    return ok(repo().progress(p.sub, domain.utcnow(), tz))


@app.get(f"{PREFIX}/progress/lessons")
def get_lesson_statuses() -> Response[str]:
    p = me()
    return ok({"lessons": repo().lesson_statuses(p.sub)})


@app.post(f"{PREFIX}/progress/read")
def post_read() -> Response[str]:
    p = me()
    r = body(ReadIn)
    return ok(
        {"lessonId": r.lesson_id, "status": repo().set_read(p.sub, r.lesson_id, r.read, domain.utcnow())}
    )


@app.post(f"{PREFIX}/progress/merge")
def merge_progress() -> Response[str]:
    p = me()
    m = body(MergeIn)
    return ok({"added": repo().merge_read(p.sub, m.read, domain.utcnow())})


@app.post(f"{PREFIX}/sessions")
def post_session() -> Response[str]:
    p = me()
    s = body(SessionIn)
    if not domain.plausible([a.ms for a in s.attempts]):
        raise ApiError(
            422, "implausible", "Answers came in too fast", "Take your time; each answer is timed."
        )
    return ok(repo().record_session(p.sub, s, domain.utcnow()))


# ---------------------------------------------------------------- reviews
@app.get(f"{PREFIX}/reviews/due")
def get_due() -> Response[str]:
    p = me()
    raw = app.current_event.get_query_string_value("limit", "") or "50"
    if not raw.isdigit() or not 1 <= int(raw) <= 100:
        raise ApiError(400, "invalid-limit", "limit must be a whole number from 1 to 100")
    return ok({"cards": repo().due_cards(p.sub, domain.utcnow(), int(raw))})


@app.post(f"{PREFIX}/reviews")
def post_reviews() -> Response[str]:
    p = me()
    return ok(repo().apply_reviews(p.sub, body(ReviewsIn), domain.utcnow()))


# ---------------------------------------------------------------- leaderboard (public, cached 60 s)
@app.get(f"{PREFIX}/leaderboard/<week>")
def get_leaderboard(week: str) -> Response[str]:
    if week == "current":
        week = domain.iso_week(domain.utcnow().date())
    if not (len(week) == 8 and week[4:6] == "-W" and week[:4].isdigit() and week[6:].isdigit()):
        raise bad_request("Week looks like 2026-W44.")
    return ok({"week": week, "rows": repo().leaderboard(week)}, cache="public, max-age=60")


@logger.inject_lambda_context(clear_state=True)
@tracer.capture_lambda_handler
def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    return app.resolve(event, context)
