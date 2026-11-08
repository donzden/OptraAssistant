"""
Unit tests for api/routes/strategies.py — market analysis caching,
strategy scoring, and AI explanation wiring.
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


def test_analyse_returns_cached_signal_without_recomputing(client):
    with patch("app.api.routes.strategies.get_cached_signal", new=AsyncMock(return_value={"trend": "BULLISH"})), \
         patch("app.api.routes.strategies.analyse_market", new=AsyncMock()) as mock_analyse, \
         patch("app.api.routes.strategies.set_cached_signal", new=AsyncMock()) as mock_set:
        res = client.get("/api/v1/strategies/analyse", params={"symbol": "NIFTY"}, headers=HEADERS)
    assert res.status_code == 200
    assert res.json() == {"trend": "BULLISH"}
    mock_analyse.assert_not_called()
    mock_set.assert_not_called()


def test_analyse_computes_and_caches_on_a_miss(client):
    with patch("app.api.routes.strategies.get_cached_signal", new=AsyncMock(return_value=None)), \
         patch("app.api.routes.strategies.analyse_market", new=AsyncMock(return_value={"trend": "SIDEWAYS"})), \
         patch("app.api.routes.strategies.set_cached_signal", new=AsyncMock()) as mock_set:
        res = client.get("/api/v1/strategies/analyse", params={"symbol": "NIFTY"}, headers=HEADERS)
    assert res.status_code == 200
    assert res.json() == {"trend": "SIDEWAYS"}
    mock_set.assert_called_once_with("NIFTY", {"trend": "SIDEWAYS"})


def test_score_delegates_to_strategy_scorer(client):
    with patch("app.api.routes.strategies.score_strategies", return_value=[{"strategy": {"id": "s1"}, "score": 9}]) as mock_score:
        res = client.post(
            "/api/v1/strategies/score",
            json={"strategies": [{"id": "s1"}], "market_signal": {"trend": "BULLISH"}, "user_risk": "AGGRESSIVE"},
            headers=HEADERS,
        )
    assert res.status_code == 200
    assert res.json() == {"ranked": [{"strategy": {"id": "s1"}, "score": 9}], "total": 1}
    mock_score.assert_called_once_with([{"id": "s1"}], {"trend": "BULLISH"}, "AGGRESSIVE")


def test_explain_delegates_to_claude_explainer(client):
    with patch("app.api.routes.strategies.explain_strategy", new=AsyncMock(return_value="Good fit.")) as mock_explain:
        res = client.post(
            "/api/v1/strategies/explain",
            json={"strategy": {"id": "s1"}, "market_signal": {}, "detailed": True},
            headers=HEADERS,
        )
    assert res.status_code == 200
    assert res.json() == {"explanation": "Good fit."}
    mock_explain.assert_called_once_with({"id": "s1"}, {}, None, True)


def test_recommend_attaches_explanations_to_top_three_only(client):
    ranked = [{"strategy": {"id": f"s{i}"}, "score": 10 - i} for i in range(5)]
    with patch("app.api.routes.strategies.get_cached_signal", new=AsyncMock(return_value={"trend": "BULLISH"})), \
         patch("app.api.routes.strategies.score_strategies", return_value=ranked), \
         patch("app.api.routes.strategies.explain_strategy", new=AsyncMock(return_value="explained")) as mock_explain:
        res = client.post(
            "/api/v1/strategies/recommend",
            json={"strategies": [], "user_risk": "MODERATE", "symbol": "NIFTY"},
            headers=HEADERS,
        )
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 5
    assert all("explanation" in item for item in body["ranked"][:3])
    assert "explanation" not in body["ranked"][3]
    assert mock_explain.call_count == 3
