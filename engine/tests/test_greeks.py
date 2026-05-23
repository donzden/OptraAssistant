import pytest
from app.services.greeks import calculate_greeks


def test_call_delta_atm():
    result = calculate_greeks(spot=100, strike=100, t=0.25, sigma=0.2, r=0.065, option_type="CE")
    assert 0.45 < result["delta"] < 0.60


def test_put_delta_negative():
    result = calculate_greeks(spot=100, strike=100, t=0.25, sigma=0.2, r=0.065, option_type="PE")
    assert -0.60 < result["delta"] < -0.40


def test_put_call_parity():
    kwargs = dict(spot=18000, strike=18000, t=0.1, sigma=0.15, r=0.065)
    call = calculate_greeks(**kwargs, option_type="CE")
    put = calculate_greeks(**kwargs, option_type="PE")
    # C - P ≈ S - K*e^(-rT)
    import math
    expected = kwargs["spot"] - kwargs["strike"] * math.exp(-kwargs["r"] * kwargs["t"])
    assert abs((call["price"] - put["price"]) - expected) < 0.5


def test_expired_option_intrinsic_only():
    result = calculate_greeks(spot=100, strike=95, t=0, sigma=0.2, r=0.065, option_type="CE")
    assert result["price"] == 5
    assert result["gamma"] == 0


def test_vega_positive():
    result = calculate_greeks(spot=100, strike=100, t=0.5, sigma=0.2, r=0.065)
    assert result["vega"] > 0
