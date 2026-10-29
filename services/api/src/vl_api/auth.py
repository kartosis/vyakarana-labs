"""Cognito access-token verification.

CloudFront's origin access control signs every request to the Function URL and overwrites the
Authorization header, so the browser sends its Cognito access token in X-VL-Auth instead.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import jwt

from .config import settings
from .errors import ApiError, not_found, unauthorized

AUTH_HEADER = "x-vl-auth"


@dataclass(frozen=True, slots=True)
class Principal:
    sub: str
    groups: tuple[str, ...]
    username: str

    @property
    def is_admin(self) -> bool:
        return "admin" in self.groups


@lru_cache(maxsize=1)
def _jwks() -> jwt.PyJWKClient:
    s = settings()
    return jwt.PyJWKClient(f"{s.issuer}/.well-known/jwks.json", cache_keys=True, lifespan=3600)


def verify_access_token(token: str, *, jwks: jwt.PyJWKClient | None = None) -> Principal:
    s = settings()
    try:
        key = (jwks or _jwks()).get_signing_key_from_jwt(token)
        claims: dict[str, Any] = jwt.decode(
            token,
            key.key,
            algorithms=["RS256"],
            issuer=s.issuer,
            options={"require": ["exp", "iat", "sub", "token_use", "client_id"]},
            leeway=30,
        )
    except jwt.PyJWTError as exc:
        raise unauthorized("Your session has expired.") from exc
    # Access tokens carry client_id instead of aud.
    if claims.get("token_use") != "access" or claims.get("client_id") != s.client_id:
        raise unauthorized("Wrong kind of token.")
    return Principal(
        sub=str(claims["sub"]),
        groups=tuple(claims.get("cognito:groups", []) or []),
        username=str(claims.get("username", claims["sub"])),
    )


def principal_from_headers(headers: dict[str, str] | None) -> Principal:
    raw = (headers or {}).get(AUTH_HEADER) or (headers or {}).get(AUTH_HEADER.title())
    if not raw:
        raise unauthorized("Sign in to continue.")
    token = raw.removeprefix("Bearer ").strip()
    return verify_access_token(token)


def require_admin(p: Principal) -> Principal:
    if not p.is_admin:
        raise not_found()
    return p


__all__ = [
    "AUTH_HEADER",
    "ApiError",
    "Principal",
    "principal_from_headers",
    "require_admin",
    "verify_access_token",
]
