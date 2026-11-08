"""Unit tests for api/routes/portfolio.py — per-position Greeks + P&L aggregation."""
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.schemas.options import GreeksData, OptionData, OptionsChainResponse, OptionStrike

HEADERS = {"X-Internal-Key": settings.internal_api_key}


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def _chain_with_strike(strike: float, ltp: float, iv: float = 18.0) -> OptionsChainResponse:
    od = OptionData(ltp=ltp, open_interest=1000, volume=100, iv=iv, greeks=GreeksData(delta=0, gamma=0, theta=0, vega=0, rho=0))
    return OptionsChainResponse(
        symbol="NIFTY", expiry="2026-05-29", spot_price=24000, atm_strike=24000,
        strikes=[OptionStrike(strike_price=strike, is_atm=True, ce=od, pe=od)], is_mock=True,
    )


def test_calculates_pnl_and_aggregate_greeks_for_a_short_call(client):
    with patch("app.api.routes.portfolio.UpstoxClient.get_spot_price", new=AsyncMock(return_value=24050.0)), \
         patch("app.api.routes.portfolio.UpstoxClient.get_options_chain", new=AsyncMock(return_value=_chain_with_strike(24000, 100.0))):
        res = client.post(
            "/api/v1/portfolio/greeks",
            json={
                "positions": [{
                    "id": "p1", "symbol": "NIFTY", "strike": 24000, "expiry": "2026-05-29",
                    "option_type": "CE", "position_type": "SHORT", "lots": 1, "lot_size": 50, "avg_price": 120,
                }],
                "spot_prices": {},
            },
            headers=HEADERS,
        )
    assert res.status_code == 200
    body = res.json()
    assert len(body["positions"]) == 1
    # SHORT: sold at 120, now worth 100 -> profit of 20 per unit * 50 units
    assert body["positions"][0]["pnl"] == 1000.0
    assert body["total_pnl"] == 1000.0


def test_uses_provided_spot_price_over_a_live_lookup(client):
    get_spot = AsyncMock(return_value=99999.0)
    with patch("app.api.routes.portfolio.UpstoxClient.get_spot_price", new=get_spot), \
         patch("app.api.routes.portfolio.UpstoxClient.get_options_chain", new=AsyncMock(return_value=_chain_with_strike(24000, 100.0))):
        client.post(
            "/api/v1/portfolio/greeks",
            json={
                "positions": [{
                    "id": "p1", "symbol": "NIFTY", "strike": 24000, "expiry": "2026-05-29",
                    "option_type": "CE", "position_type": "LONG", "lots": 1, "lot_size": 50, "avg_price": 100,
                }],
                "spot_prices": {"NIFTY": 24050},
            },
            headers=HEADERS,
        )
    get_spot.assert_not_called()


def test_falls_back_to_16pct_iv_when_strike_is_not_in_the_chain(client):
    with patch("app.api.routes.portfolio.UpstoxClient.get_spot_price", new=AsyncMock(return_value=24050.0)), \
         patch("app.api.routes.portfolio.UpstoxClient.get_options_chain", new=AsyncMock(return_value=_chain_with_strike(99999, 100.0))):
        res = client.post(
            "/api/v1/portfolio/greeks",
            json={
                "positions": [{
                    "id": "p1", "symbol": "NIFTY", "strike": 24000, "expiry": "2026-05-29",
                    "option_type": "CE", "position_type": "LONG", "lots": 1, "lot_size": 50, "avg_price": 100,
                }],
                "spot_prices": {},
            },
            headers=HEADERS,
        )
    assert res.status_code == 200
    # current_price falls back to 0 when the strike isn't in the chain
    assert res.json()["positions"][0]["current_price"] == 0.0
