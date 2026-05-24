"""
OP-42: Unit tests for market_analyser pure functions.
Tests _iv_regime, _vix_regime, _market_phase, and _adx_from_trend.
No network calls — all pure functions.
"""
import pytest
from app.services.market_analyser import _iv_regime, _vix_regime, _market_phase, _adx_from_trend


# ─── _iv_regime ───────────────────────────────────────────────────────────────

class TestIvRegime:
    def test_zero_is_low(self):
        assert _iv_regime(0) == "LOW"

    def test_mid_low(self):
        assert _iv_regime(15) == "LOW"

    def test_boundary_low_to_low_normal(self):
        assert _iv_regime(29.9) == "LOW"
        assert _iv_regime(30) == "LOW_NORMAL"

    def test_mid_low_normal(self):
        assert _iv_regime(40) == "LOW_NORMAL"

    def test_boundary_low_normal_to_normal(self):
        assert _iv_regime(49.9) == "LOW_NORMAL"
        assert _iv_regime(50) == "NORMAL"

    def test_mid_normal(self):
        assert _iv_regime(57) == "NORMAL"

    def test_boundary_normal_to_high_normal(self):
        assert _iv_regime(64.9) == "NORMAL"
        assert _iv_regime(65) == "HIGH_NORMAL"

    def test_mid_high_normal(self):
        assert _iv_regime(72) == "HIGH_NORMAL"

    def test_boundary_high_normal_to_high(self):
        assert _iv_regime(79.9) == "HIGH_NORMAL"
        assert _iv_regime(80) == "HIGH"

    def test_extreme_high(self):
        assert _iv_regime(100) == "HIGH"

    def test_above_100_returns_high(self):
        assert _iv_regime(120) == "HIGH"


# ─── _vix_regime ──────────────────────────────────────────────────────────────

class TestVixRegime:
    def test_low_vol(self):
        assert _vix_regime(5) == "LOW_VOL"
        assert _vix_regime(12.9) == "LOW_VOL"

    def test_boundary_low_to_moderate(self):
        assert _vix_regime(13) == "MODERATE"

    def test_moderate(self):
        assert _vix_regime(16) == "MODERATE"
        assert _vix_regime(19.9) == "MODERATE"

    def test_boundary_moderate_to_high_vol(self):
        assert _vix_regime(20) == "HIGH_VOL"

    def test_high_vol(self):
        assert _vix_regime(22) == "HIGH_VOL"
        assert _vix_regime(24.9) == "HIGH_VOL"

    def test_boundary_high_vol_to_extreme(self):
        assert _vix_regime(25) == "EXTREME"

    def test_extreme(self):
        assert _vix_regime(30) == "EXTREME"
        assert _vix_regime(50) == "EXTREME"


# ─── _market_phase ────────────────────────────────────────────────────────────

class TestMarketPhase:
    def test_below_threshold_is_range_bound(self):
        assert _market_phase(0) == "RANGE_BOUND"
        assert _market_phase(18) == "RANGE_BOUND"
        assert _market_phase(24.9) == "RANGE_BOUND"

    def test_at_threshold_is_trending(self):
        assert _market_phase(25) == "TRENDING"

    def test_above_threshold_is_trending(self):
        assert _market_phase(32) == "TRENDING"
        assert _market_phase(50) == "TRENDING"


# ─── _adx_from_trend ─────────────────────────────────────────────────────────

class TestAdxFromTrend:
    def test_bullish_returns_32(self):
        assert _adx_from_trend("BULLISH") == 32.0

    def test_bearish_returns_30(self):
        assert _adx_from_trend("BEARISH") == 30.0

    def test_sideways_returns_18(self):
        assert _adx_from_trend("SIDEWAYS") == 18.0

    def test_unknown_returns_18(self):
        assert _adx_from_trend("RANDOM") == 18.0
        assert _adx_from_trend("") == 18.0

    def test_bullish_triggers_trending_phase(self):
        adx = _adx_from_trend("BULLISH")
        assert _market_phase(adx) == "TRENDING"

    def test_sideways_triggers_range_bound_phase(self):
        adx = _adx_from_trend("SIDEWAYS")
        assert _market_phase(adx) == "RANGE_BOUND"
