"""
Every engine endpoint the Node API calls must require X-Internal-Key.
This is the only thing stopping the engine's market-data/AI endpoints
(which cost real API quota) from being open to the public internet.
"""
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app

GOOD_HEADERS = {"X-Internal-Key": settings.internal_api_key}
BAD_HEADERS = {"X-Internal-Key": "definitely-wrong"}


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.mark.parametrize(
    "method,path,body",
    [
        ("GET", "/api/v1/options-chain", None),
        ("GET", "/api/v1/options-chain/expiries", None),
        ("GET", "/api/v1/market/vix", None),
        ("GET", "/api/v1/market/sentiment", None),
        ("POST", "/api/v1/portfolio/greeks", {"positions": [], "spot_prices": {}}),
        ("GET", "/api/v1/strategies/analyse", None),
        ("POST", "/api/v1/strategies/score", {"strategies": [], "market_signal": {}, "user_risk": "MODERATE"}),
        ("POST", "/api/v1/strategies/explain", {"strategy": {}, "market_signal": {}}),
        ("POST", "/api/v1/strategies/recommend", {"strategies": []}),
        ("POST", "/api/v1/greeks/calculate", {"spot": 100, "strike": 100, "expiry_days": 10, "volatility": 0.2}),
        ("POST", "/api/v1/monitor/snapshot", {"legs": []}),
        ("POST", "/api/v1/monitor/check-rules", {"snapshot": {}, "exit_rules": [], "expiry": "2026-05-29", "strategy_name": "x"}),
        ("POST", "/api/v1/monitor/post-mortem", {"strategy_name": "x", "instrument": "NIFTY", "entry_date": "2026-01-01", "closed_at": "2026-01-02", "final_pnl": 0, "legs": []}),
    ],
)
def test_endpoint_rejects_missing_or_wrong_internal_key(client, method, path, body):
    no_key_res = client.request(method, path, json=body)
    assert no_key_res.status_code in (401, 403)

    wrong_key_res = client.request(method, path, json=body, headers=BAD_HEADERS)
    assert wrong_key_res.status_code in (401, 403)


def test_health_endpoint_needs_no_key(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
