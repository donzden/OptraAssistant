"""
OP-28: AI explanation engine using Claude API.
Generates plain-English explanations for why a strategy fits current conditions.
Cached for 30 min per (strategy_name, iv_regime, trend) key.
"""
import asyncio
import hashlib
import time
from typing import Optional

import anthropic

from ..core.config import settings

_cache: dict[str, tuple[str, float]] = {}
CACHE_TTL = 30 * 60  # 30 minutes


def _cache_key(strategy_name: str, iv_regime: str, trend: str) -> str:
    raw = f"{strategy_name}|{iv_regime}|{trend}"
    return hashlib.md5(raw.encode()).hexdigest()


def _fallback_explanation(strategy: dict, market_signal: dict) -> str:
    name = strategy.get("name", "this strategy")
    trend = market_signal.get("trend", "current market")
    iv_regime = market_signal.get("iv_regime", "current IV").replace("_", " ").lower()
    rules = strategy.get("rules", {})
    entry = rules.get("entry", "follow entry rules")
    exit_rule = rules.get("exit", "manage risk carefully")
    max_profit = rules.get("max_profit", "limited")
    max_loss = rules.get("max_loss", "defined")

    return (
        f"{name} is recommended because the current market shows a {trend.lower()} trend "
        f"with {iv_regime} implied volatility — conditions that historically favour this setup. "
        f"The strategy involves: {entry.lower()}. "
        f"Maximum profit potential is {max_profit.lower()}, while maximum loss is {max_loss.lower()}. "
        f"Exit when: {exit_rule.lower()}."
    )


async def explain_strategy(
    strategy: dict,
    market_signal: dict,
    portfolio_greeks: Optional[dict] = None,
    detailed: bool = False,
) -> str:
    if not settings.anthropic_api_key:
        return _fallback_explanation(strategy, market_signal)

    key = _cache_key(
        strategy.get("name", ""),
        market_signal.get("iv_regime", ""),
        market_signal.get("trend", ""),
    )
    if key in _cache:
        explanation, ts = _cache[key]
        if time.time() - ts < CACHE_TTL and not detailed:
            return explanation

    name = strategy.get("name", "")
    rules = strategy.get("rules", {})
    trend = market_signal.get("trend", "SIDEWAYS")
    iv_regime = market_signal.get("iv_regime", "NORMAL").replace("_", " ").lower()
    iv_rank = market_signal.get("iv_rank", 50)
    vix = market_signal.get("vix", 15)
    pcr = market_signal.get("pcr", 1.0)

    greeks_context = ""
    if portfolio_greeks:
        greeks_context = (
            f"Portfolio Greeks: delta={portfolio_greeks.get('total_delta', 0):.2f}, "
            f"theta={portfolio_greeks.get('total_theta', 0):.2f}, "
            f"vega={portfolio_greeks.get('total_vega', 0):.2f}. "
        )

    detail_instruction = (
        "Provide a detailed 6-8 sentence breakdown covering: setup rationale, "
        "exact conditions that make this ideal NOW, the key risk, ideal exit trigger, "
        "and how it complements the user's existing portfolio Greeks."
        if detailed
        else "Keep it to 3-5 clear sentences. Be specific about current conditions."
    )

    prompt = f"""You are an expert options trading advisor. Explain why {name} is recommended right now.

Current market conditions:
- Trend: {trend}
- IV Regime: {iv_regime} (IV Rank: {iv_rank:.0f}%)
- VIX: {vix:.1f}
- Put/Call Ratio: {pcr:.2f}
- Market signal: {market_signal.get('market_phase', 'unknown')}

Strategy details:
- Category: {strategy.get('category', '')}
- Type: {strategy.get('type', '')} ({"pays premium up front" if strategy.get('type') == 'DEBIT' else "collects premium up front"})
- Entry: {rules.get('entry', '')}
- Exit: {rules.get('exit', '')}
- Max Profit: {rules.get('max_profit', 'limited')}
- Max Loss: {rules.get('max_loss', 'defined')}
- Greeks profile: Delta={rules.get('delta', '')}, Vega={rules.get('vega', '')}, Theta={rules.get('theta', '')}
{greeks_context}

{detail_instruction}
Do not use bullet points or headers. Write in flowing, trader-friendly language."""

    try:
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=512 if not detailed else 1024,
            messages=[{"role": "user", "content": prompt}],
        )
        explanation = message.content[0].text.strip()
        if not detailed:
            _cache[key] = (explanation, time.time())
        return explanation
    except Exception:
        return _fallback_explanation(strategy, market_signal)
