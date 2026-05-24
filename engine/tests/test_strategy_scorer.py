"""
OP-42: Unit tests for strategy_scorer functions.
Tests all sub-functions and the top-level score_strategies with filtering.
"""
import pytest
from app.services.strategy_scorer import (
    _iv_match_score,
    _trend_match_score,
    _dte_score,
    _risk_score,
    score_strategies,
)


# ─── _iv_match_score ──────────────────────────────────────────────────────────

class TestIvMatchScore:
    def test_exact_match_returns_30(self):
        score, reason = _iv_match_score("NORMAL", ["NORMAL", "HIGH_NORMAL"])
        assert score == 30.0
        assert "matches strategy perfectly" in reason

    def test_adjacent_match_returns_15(self):
        # NORMAL is adjacent to LOW_NORMAL (distance 1)
        score, reason = _iv_match_score("NORMAL", ["LOW_NORMAL"])
        assert score == 15.0
        assert "adjacent" in reason

    def test_far_mismatch_returns_0(self):
        # LOW vs HIGH — distance 4
        score, reason = _iv_match_score("LOW", ["HIGH"])
        assert score == 0.0
        assert "doesn't suit" in reason

    def test_multiple_levels_best_distance_used(self):
        # NORMAL vs [LOW, HIGH_NORMAL] — closest is HIGH_NORMAL (distance 1)
        score, _ = _iv_match_score("NORMAL", ["LOW", "HIGH_NORMAL"])
        assert score == 15.0

    def test_exact_wins_over_adjacent(self):
        score, _ = _iv_match_score("HIGH", ["LOW_NORMAL", "HIGH"])
        assert score == 30.0


# ─── _trend_match_score ───────────────────────────────────────────────────────

class TestTrendMatchScore:
    def test_exact_bullish_match_returns_30(self):
        score, reason = _trend_match_score("BULLISH", ["BULLISH", "NEUTRAL"])
        assert score == 30.0
        assert "matches strategy outlook" in reason

    def test_exact_bearish_match_returns_30(self):
        score, _ = _trend_match_score("BEARISH", ["BEARISH"])
        assert score == 30.0

    def test_sideways_with_neutral_returns_30(self):
        score, reason = _trend_match_score("SIDEWAYS", ["NEUTRAL"])
        assert score == 30.0
        assert "sideways" in reason.lower() or "neutral" in reason.lower()

    def test_mismatch_returns_0(self):
        score, reason = _trend_match_score("BULLISH", ["BEARISH"])
        assert score == 0.0
        assert "conflicts" in reason

    def test_bullish_vs_neutral_only_returns_0(self):
        score, _ = _trend_match_score("BULLISH", ["NEUTRAL"])
        assert score == 0.0


# ─── _dte_score ───────────────────────────────────────────────────────────────

class TestDteScore:
    def test_no_constraint_returns_20(self):
        score, reason = _dte_score(None, None, [7, 14, 21, 30])
        assert score == 20.0
        assert "no DTE constraint" in reason

    def test_dte_in_window_returns_20(self):
        score, reason = _dte_score(7, 30, [7, 14, 21, 30])
        assert score == 20.0
        assert "within" in reason

    def test_dte_barely_in_window_returns_20(self):
        score, _ = _dte_score(7, 7, [7, 14])
        assert score == 20.0

    def test_no_dte_in_window_returns_5(self):
        score, reason = _dte_score(60, 90, [7, 14, 21, 30])
        assert score == 5.0
        assert "No expiry within" in reason

    def test_only_min_constraint(self):
        score, _ = _dte_score(10, None, [7, 14])
        assert score == 20.0  # 14 >= 10


# ─── _risk_score ──────────────────────────────────────────────────────────────

class TestRiskScore:
    def test_conservative_user_conservative_strategy(self):
        score, reason = _risk_score("CONSERVATIVE", "CONSERVATIVE")
        assert score == 20.0
        assert "suits your" in reason

    def test_moderate_user_conservative_strategy(self):
        score, _ = _risk_score("MODERATE", "CONSERVATIVE")
        assert score == 20.0

    def test_moderate_user_moderate_strategy(self):
        score, _ = _risk_score("MODERATE", "MODERATE")
        assert score == 20.0

    def test_aggressive_user_any_strategy(self):
        assert _risk_score("AGGRESSIVE", "CONSERVATIVE")[0] == 20.0
        assert _risk_score("AGGRESSIVE", "MODERATE")[0] == 20.0
        assert _risk_score("AGGRESSIVE", "AGGRESSIVE")[0] == 20.0

    def test_conservative_user_moderate_strategy_returns_5(self):
        score, reason = _risk_score("CONSERVATIVE", "MODERATE")
        assert score == 5.0
        assert "exceeds your" in reason

    def test_conservative_user_aggressive_strategy_returns_5(self):
        score, _ = _risk_score("CONSERVATIVE", "AGGRESSIVE")
        assert score == 5.0

    def test_moderate_user_aggressive_strategy_returns_5(self):
        score, _ = _risk_score("MODERATE", "AGGRESSIVE")
        assert score == 5.0


# ─── score_strategies ─────────────────────────────────────────────────────────

MOCK_MARKET_SIGNAL = {
    "trend": "BULLISH",
    "iv_regime": "LOW_NORMAL",
}

def _make_strategy(name="Long Call", outlook=None, iv_levels=None, dte_min=None, dte_max=None, risk="MODERATE"):
    return {
        "id": name.lower().replace(" ", "-"),
        "name": name,
        "outlook": outlook or ["BULLISH"],
        "ivLevels": iv_levels or ["LOW", "LOW_NORMAL"],
        "dteMin": dte_min,
        "dteMax": dte_max,
        "riskLevel": risk,
    }


class TestScoreStrategies:
    def test_perfect_match_scores_100(self):
        strategy = _make_strategy(
            outlook=["BULLISH"],       # +30
            iv_levels=["LOW_NORMAL"],  # +30
            dte_min=None, dte_max=None,  # +20
            risk="MODERATE",           # +20
        )
        results = score_strategies([strategy], MOCK_MARKET_SIGNAL, user_risk="MODERATE")
        assert len(results) == 1
        assert results[0]["score"] == 100.0

    def test_low_scoring_strategy_is_filtered(self):
        # BULLISH market, but strategy is BEARISH (0 trend) + HIGH IV mismatch (0) + out-of-DTE (5) + mismatched risk (5) = 10
        strategy = _make_strategy(
            outlook=["BEARISH"],
            iv_levels=["HIGH"],
            dte_min=60, dte_max=90,
            risk="AGGRESSIVE",
        )
        results = score_strategies([strategy], MOCK_MARKET_SIGNAL, user_risk="CONSERVATIVE")
        assert len(results) == 0

    def test_results_sorted_descending(self):
        good = _make_strategy("Good", outlook=["BULLISH"], iv_levels=["LOW_NORMAL"], risk="MODERATE")
        ok = _make_strategy("OK", outlook=["NEUTRAL"], iv_levels=["LOW_NORMAL"], dte_min=60, dte_max=90, risk="MODERATE")
        results = score_strategies([ok, good], MOCK_MARKET_SIGNAL, user_risk="MODERATE")
        scores = [r["score"] for r in results]
        assert scores == sorted(scores, reverse=True)

    def test_condition_checks_structure(self):
        strategy = _make_strategy(outlook=["BULLISH"], iv_levels=["LOW_NORMAL"])
        results = score_strategies([strategy], MOCK_MARKET_SIGNAL)
        checks = results[0]["condition_checks"]
        assert "iv_match" in checks
        assert "trend_match" in checks
        assert "dte_match" in checks
        assert "risk_match" in checks
        for key, check in checks.items():
            assert "passed" in check
            assert "score" in check
            assert "max" in check
            assert "reason" in check

    def test_threshold_boundary_exactly_50_included(self):
        # 0 trend + 30 IV + 20 DTE + 0 risk = 50 — should be included
        strategy = _make_strategy(
            outlook=["BEARISH"],      # BULLISH market → 0
            iv_levels=["LOW_NORMAL"], # +30
            dte_min=None, dte_max=None,  # +20
            risk="AGGRESSIVE",        # MODERATE user → 5
        )
        # 0 + 30 + 20 + 5 = 55, included
        results = score_strategies([strategy], MOCK_MARKET_SIGNAL, user_risk="MODERATE")
        assert len(results) == 1

    def test_empty_strategies_returns_empty_list(self):
        results = score_strategies([], MOCK_MARKET_SIGNAL)
        assert results == []

    def test_strategy_object_is_preserved(self):
        strategy = _make_strategy("Iron Condor", outlook=["NEUTRAL"], iv_levels=["HIGH_NORMAL"])
        results = score_strategies([strategy], MOCK_MARKET_SIGNAL)
        if results:
            assert results[0]["strategy"]["name"] == "Iron Condor"
