"""Request and response models (Pydantic v2). Field limits double as abuse limits."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

LessonId = Annotated[str, Field(pattern=r"^[a-z0-9-]{1,40}/[a-z0-9-]{1,60}$")]
ItemId = Annotated[str, Field(pattern=r"^[A-Za-z0-9_.:-]{1,80}$")]
CardId = Annotated[str, Field(pattern=r"^[A-Za-z0-9_.:-]{1,80}$")]
# Client-generated (crypto.randomUUID) once per save and reused on every retry of it: review #1.
RequestId = Annotated[
    str, Field(alias="requestId", pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
]
MAX_REVIEWS = 50  # per request: one transaction holds the cards + day, streak, leaderboard, request (≤ 100)


def normalize_tz(v: str) -> str:
    """Accept any IANA zone name; anything unknown falls back to UTC."""
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

    try:
        ZoneInfo(v)
    except (ZoneInfoNotFoundError, ValueError):
        return "UTC"
    return v


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Attempt(Strict):
    item_id: ItemId = Field(alias="itemId")
    correct: bool
    ms: int = Field(ge=0, le=600_000)


class SessionIn(Strict):
    lesson_id: LessonId = Field(alias="lessonId")
    attempts: list[Attempt] = Field(min_length=1, max_length=60)
    completed: bool = False
    new_cards: list[CardId] = Field(default_factory=list, alias="newCards", max_length=60)
    tz: str = Field(default="UTC", max_length=64)
    request_id: RequestId

    @field_validator("tz")
    @classmethod
    def _tz(cls, v: str) -> str:
        return normalize_tz(v)


class MergeIn(Strict):
    read: list[LessonId] = Field(default_factory=list, max_length=500)


class ReviewIn(Strict):
    card_id: CardId = Field(alias="cardId")
    rating: Literal[1, 2, 3, 4]  # Again, Hard, Good, Easy
    ms: int = Field(ge=0, le=600_000)


class ReviewsIn(Strict):
    items: list[ReviewIn] = Field(min_length=1, max_length=MAX_REVIEWS)
    tz: str = Field(default="UTC", max_length=64)
    request_id: RequestId

    @field_validator("items")
    @classmethod
    def _once_each(cls, v: list[ReviewIn]) -> list[ReviewIn]:
        ids = [i.card_id for i in v]
        if len(set(ids)) != len(ids):
            raise ValueError("the same card appears more than once; each card is reviewed once per request")
        return v

    @field_validator("tz")
    @classmethod
    def _tz(cls, v: str) -> str:
        return normalize_tz(v)


class SettingsIn(Strict):
    script: Literal["deva", "both", "iast"] | None = None
    theme: Literal["system", "light", "dark"] | None = None
    daily_goal: int | None = Field(default=None, alias="dailyGoal", ge=1, le=500)
    lb_opt_in: bool | None = Field(default=None, alias="lbOptIn")
    pseudonym: str | None = Field(default=None, pattern=r"^[\wऀ-ॿ .'-]{3,32}$")


class SessionTokensIn(Strict):
    refresh_token: str = Field(alias="refreshToken", min_length=20, max_length=4096)
