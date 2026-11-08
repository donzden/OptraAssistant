"""
Unit tests for kite_client.py — Zerodha Kite client, mock-mode fallback,
and market-sentiment derivation. Live HTTP paths are tested with a
patched httpx.AsyncClient; mock-mode paths need no network access at all.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.kite_client import KiteClient


# ── mock mode (no credentials) ────────────────────────────────────────────────

def test_has_credentials_false_when_no_api_key():
    client = KiteClient(access_token="some-token")
    with patch("app.services.kite_client.settings") as mock_settings:
        mock_settings.kite_api_key = ""
        assert client.has_credentials is False


def test_has_credentials_true_when_token_and_key_present():
    client = KiteClient(access_token="user-token")
    with patch("app.services.kite_client.settings") as mock_settings:
        mock_settings.kite_api_key = "key"
        assert client.has_credentials is True


@pytest.mark.asyncio
async def test_get_options_chain_returns_mock_without_credentials():
    client = KiteClient()
    with patch("app.services.kite_client.settings") as mock_settings:
        mock_settings.kite_api_key = ""
        chain = await client.get_options_chain("NIFTY", "2026-05-29")
    assert chain.is_mock is True
    assert chain.symbol == "NIFTY"
    assert len(chain.strikes) == 21
    assert any(s.is_atm for s in chain.strikes)


@pytest.mark.asyncio
async def test_get_vix_returns_mock_without_credentials():
    client = KiteClient()
    with patch("app.services.kite_client.settings") as mock_settings:
        mock_settings.kite_api_key = ""
        vix = await client.get_vix()
    assert vix.value == 14.2
    assert vix.sentiment == "MODERATE"


@pytest.mark.asyncio
async def test_get_spot_price_returns_mock_without_credentials():
    client = KiteClient()
    with patch("app.services.kite_client.settings") as mock_settings:
        mock_settings.kite_api_key = ""
        spot = await client.get_spot_price("BANKNIFTY")
    assert spot == 46340.0


@pytest.mark.asyncio
async def test_get_options_chain_falls_back_to_mock_on_live_error():
    client = KiteClient(access_token="tok")
    with patch("app.services.kite_client.settings") as mock_settings:
        mock_settings.kite_api_key = "key"
        with patch.object(client, "_live_options_chain", AsyncMock(side_effect=RuntimeError("boom"))):
            chain = await client.get_options_chain("NIFTY", "2026-05-29")
    assert chain.is_mock is True


# ── vix sentiment buckets ─────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "vix_value,expected",
    [(10.0, "LOW_VOL"), (15.0, "MODERATE"), (20.0, "HIGH_VOL"), (30.0, "EXTREME")],
)
def test_vix_sentiment_buckets(vix_value, expected):
    client = KiteClient()
    assert client._vix_sentiment(vix_value) == expected


# ── market sentiment derivation ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_market_sentiment_bullish_when_vix_low():
    client = KiteClient()
    from app.schemas.options import VixResponse
    with patch.object(client, "get_vix", AsyncMock(return_value=VixResponse(
        value=10.0, change=0, change_pct=0, sentiment="LOW_VOL",
    ))):
        sentiment = await client.get_market_sentiment()
    assert sentiment.nifty_trend == "BULLISH"
    assert "selling" in sentiment.recommended_stance.lower()


@pytest.mark.asyncio
async def test_market_sentiment_bearish_when_vix_high():
    client = KiteClient()
    from app.schemas.options import VixResponse
    with patch.object(client, "get_vix", AsyncMock(return_value=VixResponse(
        value=25.0, change=0, change_pct=0, sentiment="EXTREME",
    ))):
        sentiment = await client.get_market_sentiment()
    assert sentiment.nifty_trend == "BEARISH"
    assert "hedge" in sentiment.recommended_stance.lower()


@pytest.mark.asyncio
async def test_market_sentiment_sideways_in_between():
    client = KiteClient()
    from app.schemas.options import VixResponse
    with patch.object(client, "get_vix", AsyncMock(return_value=VixResponse(
        value=16.0, change=0, change_pct=0, sentiment="MODERATE",
    ))):
        sentiment = await client.get_market_sentiment()
    assert sentiment.nifty_trend == "SIDEWAYS"


# ── PCR calculation ───────────────────────────────────────────────────────────

def test_calc_pcr_ratio_of_pe_to_ce_open_interest():
    from app.schemas.options import OptionStrike, OptionData, GreeksData

    def od(oi):
        return OptionData(
            ltp=1, open_interest=oi, volume=1, iv=15,
            greeks=GreeksData(delta=0, gamma=0, theta=0, vega=0, rho=0),
        )

    strikes = [
        OptionStrike(strike_price=100, is_atm=True, ce=od(1000), pe=od(2000)),
        OptionStrike(strike_price=200, is_atm=False, ce=od(1000), pe=od(0)),
    ]
    client = KiteClient()
    assert client._calc_pcr(strikes) == 1.0  # (2000+0) / (1000+1000)


def test_calc_pcr_defaults_to_one_when_no_ce_open_interest():
    client = KiteClient()
    assert client._calc_pcr([]) == 1.0


# ── live HTTP paths ────────────────────────────────────────────────────────────

def _fake_async_client(get_return=None, get_side_effect=None):
    """Builds a MagicMock standing in for `async with httpx.AsyncClient(...) as client`."""
    instance = MagicMock()
    if get_side_effect is not None:
        instance.get = AsyncMock(side_effect=get_side_effect)
    else:
        instance.get = AsyncMock(return_value=get_return)
    ctx = MagicMock()
    ctx.__aenter__ = AsyncMock(return_value=instance)
    ctx.__aexit__ = AsyncMock(return_value=False)
    return ctx


@pytest.mark.asyncio
async def test_get_vix_live_mode_hits_kite_quote_endpoint():
    client = KiteClient(access_token="tok")
    resp = MagicMock()
    resp.raise_for_status = MagicMock()
    resp.json.return_value = {"data": {"NSE:INDIA VIX": {"last_price": 20.0}}}

    with patch("app.services.kite_client.settings") as mock_settings:
        mock_settings.kite_api_key = "key"
        with patch("app.services.kite_client.httpx.AsyncClient", return_value=_fake_async_client(get_return=resp)):
            vix = await client.get_vix()

    assert vix.value == 20.0
    assert vix.sentiment == "HIGH_VOL"


@pytest.mark.asyncio
async def test_get_vix_live_mode_falls_back_to_mock_on_http_error():
    client = KiteClient(access_token="tok")
    with patch("app.services.kite_client.settings") as mock_settings:
        mock_settings.kite_api_key = "key"
        with patch("app.services.kite_client.httpx.AsyncClient", return_value=_fake_async_client(get_side_effect=RuntimeError("down"))):
            vix = await client.get_vix()

    assert vix.value == 14.2  # mock fallback


@pytest.mark.asyncio
async def test_get_positions_returns_net_positions_list():
    client = KiteClient()
    resp = MagicMock()
    resp.raise_for_status = MagicMock()
    resp.json.return_value = {"data": {"net": [{"tradingsymbol": "NIFTY25MAY22000CE"}]}}

    with patch("app.services.kite_client.settings") as mock_settings:
        mock_settings.kite_api_key = "key"
        with patch("app.services.kite_client.httpx.AsyncClient", return_value=_fake_async_client(get_return=resp)):
            positions = await client.get_positions("user-access-token")

    assert positions == [{"tradingsymbol": "NIFTY25MAY22000CE"}]
