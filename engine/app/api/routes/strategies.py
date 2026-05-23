"""
OP-26/27/28/29: Market analyser, strategy scorer, and AI explanation routes.
All routes require the internal API key.
"""
from fastapi import APIRouter, Depends, Query
from typing import Optional

from ...core.security import require_internal_key
from ...services.market_analyser import analyse_market
from ...services.strategy_scorer import score_strategies
from ...services.claude_explainer import explain_strategy

router = APIRouter(prefix="/strategies", tags=["strategies"])


@router.get("/analyse", dependencies=[Depends(require_internal_key)])
async def analyse(symbol: str = Query("NIFTY")):
    """OP-26: Return structured market signal (trend, IV regime, VIX regime, ADX, DTE buckets)."""
    return await analyse_market(symbol)


@router.post("/score", dependencies=[Depends(require_internal_key)])
async def score(payload: dict):
    """
    OP-27: Score a list of strategies against the current market signal.
    Body: { strategies: [...], market_signal: {...}, user_risk: "MODERATE" }
    """
    strategies = payload.get("strategies", [])
    market_signal = payload.get("market_signal", {})
    user_risk = payload.get("user_risk", "MODERATE")
    ranked = score_strategies(strategies, market_signal, user_risk)
    return {"ranked": ranked, "total": len(ranked)}


@router.post("/explain", dependencies=[Depends(require_internal_key)])
async def explain(payload: dict):
    """
    OP-28: Generate a plain-English AI explanation for a strategy recommendation.
    Body: { strategy: {...}, market_signal: {...}, portfolio_greeks: {...}?, detailed: false }
    """
    strategy = payload.get("strategy", {})
    market_signal = payload.get("market_signal", {})
    portfolio_greeks = payload.get("portfolio_greeks")
    detailed = payload.get("detailed", False)
    text = await explain_strategy(strategy, market_signal, portfolio_greeks, detailed)
    return {"explanation": text}


@router.post("/recommend", dependencies=[Depends(require_internal_key)])
async def recommend(payload: dict):
    """
    OP-29: Combined endpoint — analyse market, score strategies, return top recommendations
    with AI explanations for the top 3.
    Body: { strategies: [...], user_risk: "MODERATE", symbol: "NIFTY", portfolio_greeks: {...}? }
    """
    symbol = payload.get("symbol", "NIFTY")
    strategies = payload.get("strategies", [])
    user_risk = payload.get("user_risk", "MODERATE")
    portfolio_greeks = payload.get("portfolio_greeks")

    market_signal = await analyse_market(symbol)
    ranked = score_strategies(strategies, market_signal, user_risk)

    for item in ranked[:3]:
        item["explanation"] = await explain_strategy(
            item["strategy"], market_signal, portfolio_greeks, detailed=False
        )

    return {
        "market_signal": market_signal,
        "ranked": ranked,
        "total": len(ranked),
    }
