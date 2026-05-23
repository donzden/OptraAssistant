"""
OP-26: Market condition analyser.
Derives trend, IV regime, VIX regime, market phase, and DTE buckets
from the existing market data pipeline (sentiment + options chain).
EMA/ADX are approximated from the sentiment signal until live OHLCV
time-series is available.
"""
from datetime import datetime, timezone
from typing import Optional
from .kite_client import KiteClient


IV_REGIME_THRESHOLDS = {
    "LOW": (0, 30),
    "LOW_NORMAL": (30, 50),
    "NORMAL": (50, 65),
    "HIGH_NORMAL": (65, 80),
    "HIGH": (80, 100),
}

VIX_REGIME_THRESHOLDS = {
    "LOW_VOL": (0, 13),
    "MODERATE": (13, 20),
    "HIGH_VOL": (20, 25),
    "EXTREME": (25, float("inf")),
}


def _iv_regime(iv_rank: float) -> str:
    for regime, (lo, hi) in IV_REGIME_THRESHOLDS.items():
        if lo <= iv_rank < hi:
            return regime
    return "HIGH"


def _vix_regime(vix_value: float) -> str:
    for regime, (lo, hi) in VIX_REGIME_THRESHOLDS.items():
        if lo <= vix_value < hi:
            return regime
    return "EXTREME"


def _dte_buckets() -> list[str]:
    """Always return all three buckets — filtering happens at the scorer."""
    return ["WEEKLY", "MONTHLY", "NEXT_CYCLE"]


def _adx_from_trend(trend: str) -> float:
    """Approximate ADX from trend signal until live OHLCV is available."""
    return {"BULLISH": 32.0, "BEARISH": 30.0, "SIDEWAYS": 18.0}.get(trend, 18.0)


def _market_phase(adx: float) -> str:
    return "TRENDING" if adx >= 25 else "RANGE_BOUND"


async def analyse_market(symbol: str = "NIFTY") -> dict:
    client = KiteClient()

    sentiment = await client.get_market_sentiment()
    vix_data = await client.get_vix()
    chain = await client.get_options_chain(symbol)

    trend = sentiment.get("nifty_trend", "SIDEWAYS")
    vix_value = vix_data.get("value", 15.0)
    iv_rank = chain.get("iv_rank", 50.0)
    pcr = chain.get("pcr", 1.0)
    spot_price = chain.get("spot_price", 0)

    adx = _adx_from_trend(trend)

    return {
        "instrument": symbol,
        "spot_price": spot_price,
        "trend": trend,
        "iv_regime": _iv_regime(iv_rank),
        "iv_rank": iv_rank,
        "iv_percentile": chain.get("iv_percentile", iv_rank),
        "vix": vix_value,
        "vix_regime": _vix_regime(vix_value),
        "pcr": pcr,
        "adx": adx,
        "market_phase": _market_phase(adx),
        "dte_buckets": _dte_buckets(),
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "is_mock": chain.get("is_mock", True),
    }
