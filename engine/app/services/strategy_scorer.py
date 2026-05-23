"""
OP-27: Strategy scoring engine.
Scores each pre-built strategy against current market conditions.
Score = IV match (30%) + trend match (30%) + DTE (20%) + risk profile (20%).
Strategies scoring < 50 are filtered from the ranked list.
"""
from typing import Optional

RISK_COMPATIBILITY = {
    "CONSERVATIVE": ["CONSERVATIVE"],
    "MODERATE": ["CONSERVATIVE", "MODERATE"],
    "AGGRESSIVE": ["CONSERVATIVE", "MODERATE", "AGGRESSIVE"],
}

IV_LEVEL_ORDER = ["LOW", "LOW_NORMAL", "NORMAL", "HIGH_NORMAL", "HIGH"]


def _iv_match_score(market_iv_regime: str, strategy_iv_levels: list[str]) -> tuple[float, str]:
    if market_iv_regime in strategy_iv_levels:
        return 30.0, f"IV regime '{market_iv_regime}' matches strategy perfectly"
    market_idx = IV_LEVEL_ORDER.index(market_iv_regime) if market_iv_regime in IV_LEVEL_ORDER else 2
    best_distance = min(
        abs(market_idx - IV_LEVEL_ORDER.index(lvl))
        for lvl in strategy_iv_levels
        if lvl in IV_LEVEL_ORDER
    )
    if best_distance == 1:
        return 15.0, f"IV regime '{market_iv_regime}' is adjacent to strategy's preferred levels"
    return 0.0, f"IV regime '{market_iv_regime}' doesn't suit strategy (needs {', '.join(strategy_iv_levels)})"


def _trend_match_score(market_trend: str, strategy_outlook: list[str]) -> tuple[float, str]:
    if market_trend in strategy_outlook:
        return 30.0, f"Market trend '{market_trend}' matches strategy outlook"
    if "NEUTRAL" in strategy_outlook and market_trend == "SIDEWAYS":
        return 30.0, "Sideways market suits neutral strategy"
    return 0.0, f"Market trend '{market_trend}' conflicts with strategy outlook ({', '.join(strategy_outlook)})"


def _dte_score(dte_min: Optional[int], dte_max: Optional[int], available_dte: list[int]) -> tuple[float, str]:
    if dte_min is None and dte_max is None:
        return 20.0, "Strategy has no DTE constraint (any expiry works)"
    for dte in available_dte:
        if (dte_min is None or dte >= dte_min) and (dte_max is None or dte <= dte_max):
            return 20.0, f"DTE {dte}d available within strategy's {dte_min}-{dte_max}d window"
    return 5.0, f"No expiry within {dte_min}-{dte_max}d window — closest available"


def _risk_score(user_risk: str, strategy_risk: str) -> tuple[float, str]:
    allowed = RISK_COMPATIBILITY.get(user_risk, ["CONSERVATIVE"])
    if strategy_risk in allowed:
        return 20.0, f"Strategy risk '{strategy_risk}' suits your '{user_risk}' profile"
    return 5.0, f"Strategy is '{strategy_risk}' which exceeds your '{user_risk}' risk appetite"


def score_strategies(
    strategies: list[dict],
    market_signal: dict,
    user_risk: str = "MODERATE",
) -> list[dict]:
    trend = market_signal.get("trend", "SIDEWAYS")
    iv_regime = market_signal.get("iv_regime", "NORMAL")
    available_dte = [7, 14, 21, 30, 45]

    scored = []
    for strategy in strategies:
        iv_score, iv_reason = _iv_match_score(iv_regime, strategy.get("ivLevels", []))
        trend_score, trend_reason = _trend_match_score(trend, strategy.get("outlook", []))
        dte_score, dte_reason = _dte_score(strategy.get("dteMin"), strategy.get("dteMax"), available_dte)
        risk_score, risk_reason = _risk_score(user_risk, strategy.get("riskLevel", "MODERATE"))

        total = iv_score + trend_score + dte_score + risk_score

        scored.append({
            "strategy": strategy,
            "score": round(total, 1),
            "condition_checks": {
                "iv_match": {"passed": iv_score >= 20, "score": iv_score, "max": 30, "reason": iv_reason},
                "trend_match": {"passed": trend_score >= 20, "score": trend_score, "max": 30, "reason": trend_reason},
                "dte_match": {"passed": dte_score >= 15, "score": dte_score, "max": 20, "reason": dte_reason},
                "risk_match": {"passed": risk_score >= 15, "score": risk_score, "max": 20, "reason": risk_reason},
            },
        })

    ranked = [s for s in scored if s["score"] >= 50]
    ranked.sort(key=lambda x: x["score"], reverse=True)
    return ranked
