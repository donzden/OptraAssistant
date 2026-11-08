"""
Unit tests for api/routes/monitor.py (engine side) — live snapshot simulation,
exit-rule checking, and post-mortem explanation. Also guards against the fix
for the hardcoded internal-key regression (see test_api_auth_gate.py).
"""
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app

HEADERS = {"X-Internal-Key": settings.internal_api_key}

LEG = {
    "symbol": "NIFTY", "strike": 24000, "expiry": "2026-05-29", "optionType": "CE",
    "action": "SELL", "lots": 1, "lotSize": 50, "entryPrice": 120,
}


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_snapshot_computes_pnl_and_net_greeks_for_each_leg(client):
    res = client.post("/api/v1/monitor/snapshot", json={"legs": [LEG]}, headers=HEADERS)
    assert res.status_code == 200
    body = res.json()
    assert len(body["legs"]) == 1
    assert "net_pnl" in body and "net_delta" in body and "timestamp" in body


def test_snapshot_accepts_multiple_legs(client):
    res = client.post(
        "/api/v1/monitor/snapshot",
        json={"legs": [LEG, {**LEG, "optionType": "PE", "action": "BUY"}]},
        headers=HEADERS,
    )
    assert res.status_code == 200
    assert len(res.json()["legs"]) == 2


def test_check_rules_returns_triggered_list_shape(client):
    res = client.post(
        "/api/v1/monitor/check-rules",
        json={
            "snapshot": {"net_pnl": 500},
            "exit_rules": [{"id": "r1", "type": "pnl_abs", "threshold": 100, "label": "Take 100"}],
            "expiry": "2026-05-29",
            "strategy_name": "Short Strangle",
        },
        headers=HEADERS,
    )
    assert res.status_code == 200
    assert "triggered" in res.json()
    assert isinstance(res.json()["triggered"], list)


def test_post_mortem_returns_an_explanation_string(client):
    res = client.post(
        "/api/v1/monitor/post-mortem",
        json={
            "strategy_name": "Short Strangle", "instrument": "NIFTY",
            "entry_date": "2026-01-01", "closed_at": "2026-01-15",
            "final_pnl": 1500, "legs": [],
        },
        headers=HEADERS,
    )
    assert res.status_code == 200
    assert isinstance(res.json()["explanation"], str)
