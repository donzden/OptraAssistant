import pytest
from app.services.iv_engine import implied_volatility, iv_rank, iv_percentile, generate_mock_historical_iv


# ─── implied_volatility ───────────────────────────────────────────────────────

class TestImpliedVolatility:
    def test_atm_call_round_trips(self):
        """IV recovered from a BS price should match the seed sigma."""
        from app.services.greeks import calculate_greeks
        seed_sigma = 0.18  # 18%
        price = calculate_greeks(spot=22000, strike=22000, t=0.1, sigma=seed_sigma, r=0.065)["price"]
        iv = implied_volatility(market_price=price, spot=22000, strike=22000, t=0.1, r=0.065)
        assert iv is not None
        assert abs(iv - seed_sigma * 100) < 0.2  # within 0.2pp

    def test_otm_call_returns_value(self):
        """OTM call (strike > spot) with a real market price should produce a valid IV."""
        iv = implied_volatility(market_price=300, spot=22000, strike=22500, t=0.25, r=0.065)
        assert iv is not None and iv > 0

    def test_expired_option_returns_none(self):
        """t <= 0 should return None."""
        iv = implied_volatility(market_price=100, spot=22000, strike=22000, t=0, r=0.065)
        assert iv is None

    def test_zero_price_returns_none(self):
        iv = implied_volatility(market_price=0, spot=22000, strike=22000, t=0.5, r=0.065)
        assert iv is None

    def test_below_intrinsic_returns_none(self):
        """Market price below intrinsic is arbitraged — no real IV."""
        # Deep ITM call: intrinsic = 22000-20000 = 2000, market_price = 1
        iv = implied_volatility(market_price=1, spot=22000, strike=20000, t=0.1, r=0.065)
        assert iv is None

    def test_put_round_trips(self):
        from app.services.greeks import calculate_greeks
        seed_sigma = 0.22
        price = calculate_greeks(spot=22000, strike=22000, t=0.15, sigma=seed_sigma, r=0.065, option_type="PE")["price"]
        iv = implied_volatility(market_price=price, spot=22000, strike=22000, t=0.15, r=0.065, option_type="PE")
        assert iv is not None
        assert abs(iv - seed_sigma * 100) < 0.2

    def test_returns_percentage_not_decimal(self):
        """IV should be e.g. 16.5, not 0.165."""
        from app.services.greeks import calculate_greeks
        price = calculate_greeks(spot=22000, strike=22000, t=0.1, sigma=0.16, r=0.065)["price"]
        iv = implied_volatility(market_price=price, spot=22000, strike=22000, t=0.1)
        assert iv is not None
        assert iv > 1.0  # definitely a percentage, not a decimal fraction


# ─── iv_rank ──────────────────────────────────────────────────────────────────

class TestIvRank:
    def test_at_52w_high_returns_100(self):
        assert iv_rank(current_iv=40, iv_52w_high=40, iv_52w_low=10) == 100.0

    def test_at_52w_low_returns_0(self):
        assert iv_rank(current_iv=10, iv_52w_high=40, iv_52w_low=10) == 0.0

    def test_midpoint_returns_50(self):
        rank = iv_rank(current_iv=25, iv_52w_high=40, iv_52w_low=10)
        assert abs(rank - 50.0) < 0.1

    def test_above_high_clipped_to_100(self):
        assert iv_rank(current_iv=50, iv_52w_high=40, iv_52w_low=10) == 100.0

    def test_below_low_clipped_to_0(self):
        assert iv_rank(current_iv=5, iv_52w_high=40, iv_52w_low=10) == 0.0

    def test_flat_range_returns_50(self):
        """When high == low (degenerate), default to 50."""
        assert iv_rank(current_iv=15, iv_52w_high=15, iv_52w_low=15) == 50.0

    def test_typical_nifty_values(self):
        rank = iv_rank(current_iv=14.5, iv_52w_high=28.0, iv_52w_low=10.0)
        assert 0 <= rank <= 100


# ─── iv_percentile ────────────────────────────────────────────────────────────

class TestIvPercentile:
    def test_all_below_returns_100(self):
        pct = iv_percentile(current_iv=30, historical_ivs=[10, 15, 20, 25])
        assert pct == 100.0

    def test_all_above_returns_0(self):
        pct = iv_percentile(current_iv=5, historical_ivs=[10, 15, 20, 25])
        assert pct == 0.0

    def test_half_below_returns_50(self):
        pct = iv_percentile(current_iv=15, historical_ivs=[10, 12, 16, 20])
        assert pct == 50.0

    def test_empty_history_returns_50(self):
        assert iv_percentile(current_iv=20, historical_ivs=[]) == 50.0

    def test_single_element_above(self):
        assert iv_percentile(current_iv=20, historical_ivs=[10]) == 100.0

    def test_single_element_below(self):
        assert iv_percentile(current_iv=5, historical_ivs=[10]) == 0.0

    def test_result_is_bounded_0_to_100(self):
        pct = iv_percentile(current_iv=16, historical_ivs=list(range(5, 40)))
        assert 0.0 <= pct <= 100.0


# ─── generate_mock_historical_iv ─────────────────────────────────────────────

class TestGenerateMockHistoricalIv:
    def test_returns_correct_length(self):
        ivs = generate_mock_historical_iv(atm_iv=16.0, num_days=252)
        assert len(ivs) == 252

    def test_custom_length(self):
        ivs = generate_mock_historical_iv(atm_iv=20.0, num_days=100)
        assert len(ivs) == 100

    def test_values_within_clip_range(self):
        ivs = generate_mock_historical_iv(atm_iv=16.0)
        assert all(7.0 <= v <= 50.0 for v in ivs)

    def test_seeded_deterministic(self):
        """Same seed → same output every time."""
        ivs1 = generate_mock_historical_iv(atm_iv=16.0)
        ivs2 = generate_mock_historical_iv(atm_iv=16.0)
        assert ivs1 == ivs2

    def test_centred_near_atm_iv(self):
        ivs = generate_mock_historical_iv(atm_iv=20.0)
        mean = sum(ivs) / len(ivs)
        assert 15.0 < mean < 25.0  # within a reasonable band around 20
