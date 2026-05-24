"""Tests for NSE/BSE expiry date calculation rules (OP-48)."""
from datetime import date

import pytest

from app.api.routes.options_chain import (
    NSE_HOLIDAYS,
    _adjust_for_holiday,
    _default_expiry,
    _last_thursday_of_month,
    _last_tuesday_of_month,
    _nearest_bse_monthly,
    _nearest_nse_monthly,
    _next_thursday,
    _next_tuesday,
)


# ── _next_tuesday ──────────────────────────────────────────────────────────────

def test_next_tuesday_from_monday():
    # 2026-05-25 is Monday → next Tuesday is 2026-05-26
    assert _next_tuesday(date(2026, 5, 25)) == date(2026, 5, 26)


def test_next_tuesday_from_tuesday_skips_to_next_week():
    # Called on a Tuesday → returns next Tuesday, not today
    assert _next_tuesday(date(2026, 5, 26)) == date(2026, 6, 2)


def test_next_tuesday_from_wednesday():
    # 2026-05-27 Wednesday → 6 days ahead → 2026-06-02
    assert _next_tuesday(date(2026, 5, 27)) == date(2026, 6, 2)


def test_next_tuesday_result_is_tuesday():
    for day_offset in range(7):
        result = _next_tuesday(date(2026, 5, 18) + __import__("datetime").timedelta(days=day_offset))
        assert result.weekday() == 1, f"Expected Tuesday, got weekday {result.weekday()} for {result}"


# ── _next_thursday ─────────────────────────────────────────────────────────────

def test_next_thursday_from_wednesday():
    # 2026-05-27 Wednesday → next Thursday 2026-05-28
    assert _next_thursday(date(2026, 5, 27)) == date(2026, 5, 28)


def test_next_thursday_from_thursday_skips_to_next_week():
    assert _next_thursday(date(2026, 5, 28)) == date(2026, 6, 4)


def test_next_thursday_result_is_thursday():
    from datetime import timedelta
    for day_offset in range(7):
        result = _next_thursday(date(2026, 5, 18) + timedelta(days=day_offset))
        assert result.weekday() == 3


# ── _last_tuesday_of_month ─────────────────────────────────────────────────────

def test_last_tuesday_may_2026():
    # May 2026: last day = May 31 (Sunday). Last Tuesday = May 26.
    assert _last_tuesday_of_month(2026, 5) == date(2026, 5, 26)


def test_last_tuesday_december_2026():
    # Dec 2026: last day = Dec 31 (Thursday). Last Tuesday = Dec 29.
    assert _last_tuesday_of_month(2026, 12) == date(2026, 12, 29)


def test_last_tuesday_is_always_tuesday():
    for month in range(1, 13):
        result = _last_tuesday_of_month(2026, month)
        assert result.weekday() == 1


# ── _last_thursday_of_month ────────────────────────────────────────────────────

def test_last_thursday_may_2026():
    # May 2026: last day = May 31 (Sunday). Last Thursday = May 28.
    assert _last_thursday_of_month(2026, 5) == date(2026, 5, 28)


def test_last_thursday_december_2026():
    # Dec 2026: last day = Dec 31 (Thursday). Last Thursday = Dec 31.
    assert _last_thursday_of_month(2026, 12) == date(2026, 12, 31)


def test_last_thursday_is_always_thursday():
    for month in range(1, 13):
        result = _last_thursday_of_month(2026, month)
        assert result.weekday() == 3


# ── _adjust_for_holiday ────────────────────────────────────────────────────────

def test_adjust_skips_saturday():
    # 2026-05-30 is Saturday → shift back to Friday 2026-05-29
    assert _adjust_for_holiday(date(2026, 5, 30)) == date(2026, 5, 29)


def test_adjust_skips_sunday():
    # 2026-05-31 is Sunday → shift back to Friday 2026-05-29
    assert _adjust_for_holiday(date(2026, 5, 31)) == date(2026, 5, 29)


def test_adjust_skips_holiday():
    NSE_HOLIDAYS.add("2026-05-26")  # make Tuesday a holiday
    try:
        result = _adjust_for_holiday(date(2026, 5, 26))
        assert result == date(2026, 5, 25)
    finally:
        NSE_HOLIDAYS.discard("2026-05-26")


def test_adjust_no_change_for_weekday():
    # 2026-05-25 Monday — no shift needed
    assert _adjust_for_holiday(date(2026, 5, 25)) == date(2026, 5, 25)


# ── _default_expiry symbol routing ────────────────────────────────────────────

def test_nifty_default_expiry_is_tuesday():
    result = date.fromisoformat(_default_expiry("NIFTY"))
    assert result.weekday() == 1  # Tuesday


def test_sensex_default_expiry_is_thursday():
    result = date.fromisoformat(_default_expiry("SENSEX"))
    assert result.weekday() == 3  # Thursday


def test_banknifty_default_expiry_is_last_tuesday():
    # BankNifty has no weekly — should return a monthly (last Tuesday)
    result = date.fromisoformat(_default_expiry("BANKNIFTY"))
    assert result.weekday() == 1  # last Tuesday of some month
    # Verify it is the last Tuesday of its month
    assert result == _last_tuesday_of_month(result.year, result.month)


def test_bankex_default_expiry_is_last_thursday():
    result = date.fromisoformat(_default_expiry("BANKEX"))
    assert result.weekday() == 3
    assert result == _last_thursday_of_month(result.year, result.month)


def test_unknown_symbol_falls_back_to_nifty_rules():
    result = date.fromisoformat(_default_expiry("UNKNOWN"))
    # Falls through to NSE monthly path (nearest last Tuesday)
    assert result.weekday() == 1
