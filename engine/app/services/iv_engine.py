from typing import Optional
import numpy as np
from scipy.optimize import brentq
from .greeks import calculate_greeks


def implied_volatility(
    market_price: float,
    spot: float,
    strike: float,
    t: float,
    r: float = 0.065,
    option_type: str = "CE",
) -> Optional[float]:
    """Return IV as a percentage (e.g. 16.5) or None if unsolvable."""
    if t <= 0 or market_price <= 0:
        return None
    intrinsic = max(spot - strike, 0) if option_type == "CE" else max(strike - spot, 0)
    if market_price < max(intrinsic - 0.01, 0):
        return None

    def objective(sigma: float) -> float:
        return calculate_greeks(spot, strike, t, sigma, r, option_type)["price"] - market_price

    try:
        iv = brentq(objective, 1e-4, 5.0, xtol=1e-6, maxiter=200)
        return round(iv * 100, 2)
    except (ValueError, RuntimeError):
        return None


def iv_rank(current_iv: float, iv_52w_high: float, iv_52w_low: float) -> float:
    """Where current IV sits in its 52-week range, 0–100."""
    if iv_52w_high <= iv_52w_low:
        return 50.0
    rank = (current_iv - iv_52w_low) / (iv_52w_high - iv_52w_low) * 100
    return round(max(0.0, min(100.0, rank)), 1)


def iv_percentile(current_iv: float, historical_ivs: list) -> float:
    """Percentage of historical days where IV was below current IV."""
    if not historical_ivs:
        return 50.0
    pct = sum(1 for iv in historical_ivs if iv < current_iv) / len(historical_ivs) * 100
    return round(pct, 1)


def generate_mock_historical_iv(atm_iv: float, num_days: int = 252) -> list:
    """Generate a plausible 1-year IV series for rank/percentile calculation in dev."""
    rng = np.random.default_rng(seed=42)
    ivs = np.clip(rng.normal(loc=atm_iv, scale=3.5, size=num_days), 7.0, 50.0)
    return ivs.tolist()
