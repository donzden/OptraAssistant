import random
from datetime import date, datetime
from typing import List

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.services.greeks import calculate_greeks

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
