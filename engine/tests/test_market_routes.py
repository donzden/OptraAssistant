"""Unit tests for api/routes/market.py — thin pass-through to KiteClient."""
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.schemas.options import MarketSentimentResponse, VixResponse

HEADERS = {"X-Internal-Key": settings.internal_api_key}


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_vix_endpoint_returns_client_result(client):
    with patch(
        "app.api.routes.market.UpstoxClient.get_vix",
        new=AsyncMock(return_value=VixResponse(value=15.5, change=0.5, change_pct=3.2, sentiment="MODERATE")),
    ):
        res = client.get("/api/v1/market/vix", headers=HEADERS)
    assert res.status_code == 200
    assert res.json()["value"] == 15.5


def test_sentiment_endpoint_returns_client_result(client):
    with patch(
        "app.api.routes.market.UpstoxClient.get_market_sentiment",
        new=AsyncMock(return_value=MarketSentimentResponse(
            vix=VixResponse(value=12, change=0, change_pct=0, sentiment="LOW_VOL"),
            nifty_trend="BULLISH", pcr=0.9, recommended_stance="Sell premium", is_mock=True,
        )),
    ):
        res = client.get("/api/v1/market/sentiment", headers=HEADERS)
    assert res.status_code == 200
    assert res.json()["nifty_trend"] == "BULLISH"
