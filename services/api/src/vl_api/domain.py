"""Pure domain rules: streaks, weeks, pseudonyms, review scheduling. No I/O here."""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from fsrs import Card, Rating, Scheduler

# Pseudonyms are Sanskrit learner-words plus a number, e.g. "śiṣya-4821".
_NAMES = ("śiṣya", "chātra", "adhyetṛ", "jijñāsu", "vidyārthin", "pāṭhaka", "abhyāsin", "sādhaka")


def new_pseudonym() -> str:
    return f"{secrets.choice(_NAMES)}-{secrets.randbelow(9000) + 1000}"


def local_date(now: datetime, tz: str) -> date:
    return now.astimezone(ZoneInfo(tz)).date()


def iso_week(d: date) -> str:
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


@dataclass(frozen=True, slots=True)
class Streak:
    current: int
    longest: int
    last_date: str | None  # YYYY-MM-DD in the learner's timezone

    def touch(self, today: date) -> Streak:
        """Practising on `today` extends a run that ended yesterday, keeps today's, or starts afresh."""
        if self.last_date == today.isoformat():
            return self
        yesterday = (today - timedelta(days=1)).isoformat()
        current = self.current + 1 if self.last_date == yesterday else 1
        return Streak(current=current, longest=max(self.longest, current), last_date=today.isoformat())

    def as_of(self, today: date) -> int:
        """The streak a learner sees today: still alive if they practised today or yesterday."""
        if self.last_date in (today.isoformat(), (today - timedelta(days=1)).isoformat()):
            return self.current
        return 0


# ---------------------------------------------------------------- spaced repetition (FSRS)
_scheduler = Scheduler()


def new_card_state(now: datetime) -> dict[str, object]:
    card = Card(due=now)
    return card.to_dict()


def review(state: dict[str, object], rating: int, now: datetime, ms: int) -> dict[str, object]:
    card = Card.from_dict(state)  # type: ignore[arg-type]
    updated, _log = _scheduler.review_card(card, Rating(rating), review_datetime=now, review_duration=ms)
    return updated.to_dict()


def utcnow() -> datetime:
    return datetime.now(UTC)


# ---------------------------------------------------------------- scoring
LESSON_BONUS = 10


def session_score(correct: int, first_completion: bool) -> int:
    """Weekly leaderboard points: one per correct answer, ten for finishing a lesson the first time."""
    return correct + (LESSON_BONUS if first_completion else 0)


def plausible(attempt_ms: list[int]) -> bool:
    """Reject sessions answered faster than a human can read the questions (client-side grading)."""
    return all(ms >= 400 for ms in attempt_ms) and sum(attempt_ms) >= 1200 * len(attempt_ms)
