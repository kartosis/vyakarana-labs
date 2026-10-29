"""Runtime settings, read once from the Lambda environment."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


@dataclass(frozen=True, slots=True)
class Settings:
    table_name: str
    user_pool_id: str
    client_id: str
    region: str
    cookie_secure: bool = True
    refresh_cookie_days: int = 30

    @property
    def issuer(self) -> str:
        return f"https://cognito-idp.{self.region}.amazonaws.com/{self.user_pool_id}"


@lru_cache(maxsize=1)
def settings() -> Settings:
    return Settings(
        table_name=os.environ["TABLE_NAME"],
        user_pool_id=os.environ["USER_POOL_ID"],
        client_id=os.environ["CLIENT_ID"],
        region=os.environ.get("AWS_REGION", "us-east-1"),
        cookie_secure=os.environ.get("COOKIE_SECURE", "true") == "true",
    )
