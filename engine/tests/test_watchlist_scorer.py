"""
OP-43: Watchlist condition-match scorer tests.
Given a market signal fixture, assert correct match % for watchlist strategies.
Match % = total_score / total_max * 100, derived from score_strategies output.
"""
import pytest
from app.services.strategy_scorer import score_strategies


def _match_pct(strategy: dict, market_signal: dict, user_risk: str = "MODERATE") -> float:
    results = score_strategies([strategy], market_signal, user_risk=user_risk)
    if not results:
        return 0.0
    checks = results[0]["condition_checks"]
    total_score = sum(c["score"] for c in checks.values())
    total_max = sum(c["max"] for c in checks.values())
    return round(total_score / total_max * 100) if total_max else 0.0


def _make_strategy(
    name: str,
    outlook: list,
    iv_levels: list,
    dte_min=None,
    dte_max=None,
    risk: str = "MODERATE",
) -> dict:
    return {
        "id": name.lower().replace(" ", "-"),
        "name": name,
        "outlook": outlook,
        "ivLevels": iv_levels,
        "dteMin": dte_min,
        "dteMax": dte_max,
        "riskLevel": risk,
    }


# ─── Market signal fixtures ───────────────────────────────────────────────────

BULLISH_LOW_IV = {
    "trend": "BULLISH",
    "iv_regime": "LOW_NORMAL",
    "dte_buckets": [7, 14, 21, 30],
}

SIDEWAYS_HIGH_IV = {
    "trend": "SIDEWAYS",
    "iv_regime": "HIGH",
    "dte_buckets": [7, 14, 21, 30],
}

BEARISH_NORMAL_IV = {
    "trend": "BEARISH",
    "iv_regime": "NORMAL",
    "dte_buckets": [7, 14, 21, 30],
}


# ─── Perfect-match strategies ─────────────────────────────────────────────────

class TestPerfectMatch:
    def test_long_call_100pct_in_bullish_low_iv(self):
        strategy = _make_strategy(
            "Long Call",
            outlook=["BULLISH"],
            iv_levels=["LOW", "LOW_NORMAL"],
            dte_min=None,
            dte_max=None,
            risk="MODERATE",
        )
        pct = _match_pct(strategy, BULLISH_LOW_IV, user_risk="MODERATE")
        assert pct == 100, f"Expected 100%, got {pct}%"

    def test_short_iron_condor_100pct_in_sideways_high_iv(self):
        strategy = _make_strategy(
            "Short Iron Condor",
            outlook=["NEUTRAL"],
            iv_levels=["HIGH", "HIGH_NORMAL"],
            dte_min=None,
            dte_max=None,
            risk="MODERATE",
        )
        pct = _match_pct(strategy, SIDEWAYS_HIGH_IV, user_risk="MODERATE")
        assert pct == 100, f"Expected 100%, got {pct}%"

    def test_long_put_100pct_in_bearish_normal_iv(self):
        strategy = _make_strategy(
            "Long Put",
            outlook=["BEARISH"],
            iv_levels=["NORMAL", "LOW_NORMAL"],
            dte_min=None,
            dte_max=None,
            risk="MODERATE",
        )
        pct = _match_pct(strategy, BEARISH_NORMAL_IV, user_risk="MODERATE")
        assert pct == 100, f"Expected 100%, got {pct}%"


# ─── Near-match strategies ─────────────────────────────────────────────────────

class TestNearMatch:
    def test_strategy_with_adjacent_iv_scores_above_50pct(self):
        # NORMAL strategy in LOW_NORMAL market → IV adjacent (15pts out of 30)
        strategy = _make_strategy(
            "Covered Call",
            outlook=["BULLISH"],
            iv_levels=["NORMAL"],
            risk="MODERATE",
        )
        pct = _match_pct(strategy, BULLISH_LOW_IV, user_risk="MODERATE")
        assert pct > 50, f"Expected >50%, got {pct}%"

    def test_strategy_with_wrong_trend_scores_below_50pct(self):
        # Bearish strategy + HIGH IV requirement in Bullish low-IV market → trend 0pts, IV 0pts
        strategy = _make_strategy(
            "Long Put",
            outlook=["BEARISH"],
            iv_levels=["HIGH"],
            risk="MODERATE",
        )
        pct = _match_pct(strategy, BULLISH_LOW_IV, user_risk="MODERATE")
        assert pct < 50, f"Expected <50%, got {pct}%"

    def test_strategy_with_dte_constraint_outside_range_lower_score(self):
        # DTE 60-90 but market has max 30-day expiries → dte penalty
        strategy = _make_strategy(
            "LEAPS Call",
            outlook=["BULLISH"],
            iv_levels=["LOW_NORMAL"],
            dte_min=60,
            dte_max=90,
            risk="MODERATE",
        )
        pct_constrained = _match_pct(strategy, BULLISH_LOW_IV, user_risk="MODERATE")
        strategy_no_dte = _make_strategy(
            "Long Call",
            outlook=["BULLISH"],
            iv_levels=["LOW_NORMAL"],
            risk="MODERATE",
        )
        pct_unconstrained = _match_pct(strategy_no_dte, BULLISH_LOW_IV, user_risk="MODERATE")
        assert pct_constrained < pct_unconstrained


# ─── Poor-match strategies ─────────────────────────────────────────────────────

class TestPoorMatch:
    def test_opposite_outlook_and_iv_returns_low_or_zero(self):
        # Short iron condor in bullish, low IV → poor on both dimensions
        strategy = _make_strategy(
            "Short Iron Condor",
            outlook=["NEUTRAL"],
            iv_levels=["HIGH", "HIGH_NORMAL"],
            dte_min=21,
            dte_max=45,
            risk="MODERATE",
        )
        pct = _match_pct(strategy, BULLISH_LOW_IV, user_risk="MODERATE")
        assert pct < 50, f"Expected <50%, got {pct}%"

    def test_aggressive_strategy_with_conservative_user_scores_lower(self):
        strategy = _make_strategy(
            "Naked Short Put",
            outlook=["BULLISH"],
            iv_levels=["LOW_NORMAL"],
            risk="AGGRESSIVE",
        )
        pct_conservative = _match_pct(strategy, BULLISH_LOW_IV, user_risk="CONSERVATIVE")
        pct_aggressive   = _match_pct(strategy, BULLISH_LOW_IV, user_risk="AGGRESSIVE")
        assert pct_conservative < pct_aggressive


# ─── Match % structure ────────────────────────────────────────────────────────

class TestMatchPctComputation:
    def test_match_pct_is_between_0_and_100(self):
        strategy = _make_strategy("Any", outlook=["BULLISH"], iv_levels=["LOW_NORMAL"])
        pct = _match_pct(strategy, BULLISH_LOW_IV)
        assert 0 <= pct <= 100

    def test_match_pct_is_integer_or_whole(self):
        strategy = _make_strategy("Any", outlook=["BULLISH"], iv_levels=["LOW_NORMAL"])
        pct = _match_pct(strategy, BULLISH_LOW_IV)
        assert pct == int(pct), f"Expected integer, got {pct}"

    def test_empty_strategies_returns_zero(self):
        pct = _match_pct(
            _make_strategy("Filtered", outlook=["BEARISH"], iv_levels=["HIGH"],
                           dte_min=60, dte_max=90, risk="AGGRESSIVE"),
            BULLISH_LOW_IV,
            user_risk="CONSERVATIVE",
        )
        assert pct == 0

    def test_green_threshold_strategies_score_above_80(self):
        strategy = _make_strategy(
            "Long Call",
            outlook=["BULLISH"],
            iv_levels=["LOW_NORMAL"],
            risk="MODERATE",
        )
        pct = _match_pct(strategy, BULLISH_LOW_IV, user_risk="MODERATE")
        assert pct >= 80, f"Perfect strategy should be >=80% (green zone), got {pct}%"
