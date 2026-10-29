from datetime import UTC, date, datetime, timedelta

import pytest

from vl_api import domain
from vl_api.errors import ApiError


def test_streak_extends_on_consecutive_days() -> None:
    s = domain.Streak(0, 0, None)
    s = s.touch(date(2026, 10, 27))
    s = s.touch(date(2026, 10, 28))
    s = s.touch(date(2026, 10, 28))  # same day twice: unchanged
    assert (s.current, s.longest) == (2, 2)


def test_streak_resets_after_a_gap_but_keeps_longest() -> None:
    s = domain.Streak(5, 5, "2026-10-20").touch(date(2026, 10, 28))
    assert (s.current, s.longest) == (1, 5)


def test_streak_shown_is_zero_once_a_day_is_missed() -> None:
    s = domain.Streak(3, 3, "2026-10-26")
    assert s.as_of(date(2026, 10, 27)) == 3
    assert s.as_of(date(2026, 10, 28)) == 0


def test_local_date_follows_learner_timezone() -> None:
    now = datetime(2026, 10, 29, 2, 0, tzinfo=UTC)
    assert domain.local_date(now, "America/New_York") == date(2026, 10, 28)
    assert domain.local_date(now, "Asia/Kolkata") == date(2026, 10, 29)


def test_iso_week() -> None:
    assert domain.iso_week(date(2026, 10, 29)) == "2026-W44"
    assert domain.iso_week(date(2027, 1, 1)) == "2026-W53"


def test_review_pushes_due_date_forward() -> None:
    now = datetime(2026, 10, 29, tzinfo=UTC)
    state = domain.new_card_state(now)
    after_good = domain.review(state, 3, now, 4000)
    later = datetime.fromisoformat(str(after_good["due"])) - now
    assert later > timedelta(0)
    after_again = domain.review(state, 1, now, 4000)
    assert datetime.fromisoformat(str(after_again["due"])) <= datetime.fromisoformat(str(after_good["due"]))


def test_plausibility() -> None:
    assert domain.plausible([3000, 2500, 4000])
    assert not domain.plausible([100, 100, 100])
    assert not domain.plausible([500, 500, 500])  # each ≥400 but too fast overall


def test_session_score() -> None:
    assert domain.session_score(7, first_completion=True) == 17
    assert domain.session_score(7, first_completion=False) == 7


def test_api_never_emits_403() -> None:
    with pytest.raises(ValueError):
        ApiError(403, "x", "y")
