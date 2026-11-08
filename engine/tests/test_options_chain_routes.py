"""
Unit tests for api/routes/options_chain.py — symbol normalization,
default expiry selection, and expiries listing.
"""
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app

HEADERS = {"X-Internal-Key": settings.internal_api_key}


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_unknown_symbol_falls_back_to_nifty(client):
    with patch(
        "app.api.routes.options_chain.UpstoxClient.get_options_chain",
        new=AsyncMock(return_value={"symbol": "NIFTY", "expiry": "x", "spot_price": 1,
                                     "atm_strike": 1, "iv_rank": 1, "iv_percentile": 1,
                                     "atm_iv": 1, "pcr": 1, "strikes": [], "is_mock": True}),
    ) as mocked:
        res = client.get("/api/v1/options-chain", params={"symbol": "DOGECOIN"}, headers=HEADERS)
    assert res.status_code == 200
    assert mocked.call_args[0][0] == "NIFTY"


def test_valid_symbol_and_explicit_expiry_are_passed_through(client):
    with patch(
        "app.api.routes.options_chain.UpstoxClient.get_options_chain",
        new=AsyncMock(return_value={"symbol": "BANKNIFTY", "expiry": "2026-05-28", "spot_price": 1,
                                     "atm_strike": 1, "iv_rank": 1, "iv_percentile": 1,
                                     "atm_iv": 1, "pcr": 1, "strikes": [], "is_mock": True}),
    ) as mocked:
        res = client.get(
            "/api/v1/options-chain",
            params={"symbol": "banknifty", "expiry": "2026-05-28"},
            headers=HEADERS,
        )
    assert res.status_code == 200
    assert mocked.call_args[0] == ("BANKNIFTY", "2026-05-28")


def test_expiries_returns_four_dates_for_nifty(client):
    res = client.get("/api/v1/options-chain/expiries", params={"symbol": "NIFTY"}, headers=HEADERS)
    assert res.status_code == 200
    body = res.json()
    assert body["symbol"] == "NIFTY"
    assert len(body["expiries"]) == 4


def test_expiries_uppercases_symbol(client):
    res = client.get("/api/v1/options-chain/expiries", params={"symbol": "banknifty"}, headers=HEADERS)
    assert res.json()["symbol"] == "BANKNIFTY"
