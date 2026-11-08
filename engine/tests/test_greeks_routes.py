"""Unit tests for api/greeks.py — the HTTP wrapper around calculate_greeks."""
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app

HEADERS = {"X-Internal-Key": settings.internal_api_key}


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_calculate_returns_greeks_for_an_atm_call(client):
    res = client.post(
        "/api/v1/greeks/calculate",
        json={"spot": 100, "strike": 100, "expiry_days": 30, "volatility": 0.2},
        headers=HEADERS,
    )
    assert res.status_code == 200
    body = res.json()
    assert 0.45 < body["delta"] < 0.60


def test_calculate_defaults_risk_free_rate_and_option_type(client):
    res = client.post(
        "/api/v1/greeks/calculate",
        json={"spot": 100, "strike": 110, "expiry_days": 10, "volatility": 0.25},
        headers=HEADERS,
    )
    assert res.status_code == 200
    assert res.json()["delta"] > 0  # defaults to CE, OTM call has positive delta


def test_calculate_put_has_negative_delta(client):
    res = client.post(
        "/api/v1/greeks/calculate",
        json={"spot": 100, "strike": 100, "expiry_days": 30, "volatility": 0.2, "option_type": "PE"},
        headers=HEADERS,
    )
    assert res.json()["delta"] < 0
