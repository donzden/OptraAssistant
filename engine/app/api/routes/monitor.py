import random
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.services.greeks import calculate_greeks
from app.services.exit_signals import evaluate_rules, get_adjustment_suggestion, get_post_mortem_explanation
from app.core.config import settings

router = APIRouter()

_KEY = "dev-internal-key"


def _verify(x_internal_key: str | None) -> None:
    if x_internal_key != _KEY:
        raise HTTPException(status_code=403, detail="Forbidden")


class LegInput(BaseModel):
    symbol: str
    strike: float
    expiry: str
    optionType: str
    action: str
    lots: int
    lotSize: int
    entryPrice: float


class SnapshotRequest(BaseModel):
    legs: List[LegInput]


def _dte(expiry_str: str) -> float:
    try:
        return max((date.fromisoformat(expiry_str) - date.today()).days, 0)
    except Exception:
        return 7


def _ltp(entry: float, dte: float) -> float:
    vol = 0.025 + (0.015 if dte < 3 else 0)
    return round(max(entry * (1.0 + random.gauss(0, vol)), 0.05), 2)


class CheckRulesRequest(BaseModel):
    snapshot: Dict[str, Any]
    exit_rules: List[Dict[str, Any]]
    expiry: str
    strategy_name: str


@router.post("/monitor/check-rules")
def monitor_check_rules(body: CheckRulesRequest, x_internal_key: str = Header(None)):
    _verify(x_internal_key)
    triggered = evaluate_rules(body.snapshot, body.exit_rules, body.expiry)
    results = []
    for t in triggered:
        suggestion = get_adjustment_suggestion(
            t["ruleType"], t["ruleLabel"], body.snapshot,
            body.strategy_name, settings.anthropic_api_key,
        )
        results.append({**t, "suggestion": suggestion})
    return {"triggered": results}


class PostMortemRequest(BaseModel):
    strategy_name: str
    instrument: str
    entry_date: str
    closed_at: str
    final_pnl: float
    legs: List[Dict[str, Any]]


@router.post("/monitor/post-mortem")
def monitor_post_mortem(body: PostMortemRequest, x_internal_key: str = Header(None)):
    _verify(x_internal_key)
    explanation = get_post_mortem_explanation(
        body.strategy_name, body.instrument, body.entry_date,
        body.closed_at, body.final_pnl, body.legs, settings.anthropic_api_key,
    )
    return {"explanation": explanation}


@router.post("/monitor/snapshot")
def monitor_snapshot(body: SnapshotRequest, x_internal_key: str = Header(None)):
    _verify(x_internal_key)

    leg_results = []
    net_pnl = net_delta = net_theta = net_gamma = net_vega = 0.0

    for leg in body.legs:
        dte = _dte(leg.expiry)
        ltp = _ltp(leg.entryPrice, dte)
        t = max(dte, 0.5) / 365.0
        spot = leg.strike * (1.0 + random.gauss(0, 0.004))

        try:
            g = calculate_greeks(
                spot=spot, strike=leg.strike, t=t,
                sigma=0.18, r=0.065, option_type=leg.optionType,
            )
        except Exception:
            g = {"delta": 0.0, "theta": 0.0, "gamma": 0.0, "vega": 0.0}

        sign = 1 if leg.action == "BUY" else -1
        leg_pnl = round((ltp - leg.entryPrice) * sign * leg.lots * leg.lotSize, 2)

        net_pnl += leg_pnl
        net_delta += g.get("delta", 0.0) * sign * leg.lots
        net_theta += g.get("theta", 0.0) * sign * leg.lots
        net_gamma += g.get("gamma", 0.0) * sign * leg.lots
        net_vega += g.get("vega", 0.0) * sign * leg.lots

        leg_results.append({
            "symbol": leg.symbol,
            "strike": leg.strike,
            "optionType": leg.optionType,
            "action": leg.action,
            "lots": leg.lots,
            "entryPrice": leg.entryPrice,
            "ltp": ltp,
            "pnl": leg_pnl,
            "delta": round(g.get("delta", 0.0), 4),
            "theta": round(g.get("theta", 0.0), 4),
            "ivChange": round(random.gauss(0, 0.004), 4),
        })

    return {
        "legs": leg_results,
        "net_pnl": round(net_pnl, 2),
        "net_delta": round(net_delta, 4),
        "net_theta": round(net_theta, 4),
        "net_gamma": round(net_gamma, 6),
        "net_vega": round(net_vega, 4),
        "timestamp": datetime.utcnow().isoformat(),
    }
