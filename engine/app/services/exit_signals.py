"""Exit rule evaluation and adjustment suggestion service (OP-38)."""
from datetime import date
from typing import List


def _dte(expiry_str: str) -> float:
    try:
        return max((date.fromisoformat(expiry_str) - date.today()).days, 0)
    except Exception:
        return 7


def evaluate_rules(snapshot: dict, exit_rules: list, expiry: str) -> list:
    """Evaluate exit rules against a live snapshot. Returns triggered rule dicts."""
    triggered = []
    net_pnl = snapshot.get("net_pnl", 0)
    net_delta = abs(snapshot.get("net_delta", 0))
    dte = _dte(expiry)

    for rule in exit_rules:
        rtype = rule.get("type", "")
        threshold = float(rule.get("threshold", 0))
        label = rule.get("label", rtype)

        if rtype == "pnl_pct":
            net_premium = float(rule.get("netPremium", 0))
            if net_premium > 0:
                pct = (net_pnl / net_premium) * 100
                if pct < -threshold:
                    triggered.append({
                        "ruleType": rtype, "ruleLabel": label,
                        "currentPnl": net_pnl, "triggerValue": pct,
                    })
        elif rtype == "pnl_abs":
            if net_pnl < -threshold:
                triggered.append({
                    "ruleType": rtype, "ruleLabel": label,
                    "currentPnl": net_pnl, "triggerValue": net_pnl,
                })
        elif rtype == "delta":
            if net_delta > threshold:
                triggered.append({
                    "ruleType": rtype, "ruleLabel": label,
                    "currentPnl": net_pnl, "triggerValue": net_delta,
                })
        elif rtype == "dte":
            if dte <= threshold:
                triggered.append({
                    "ruleType": rtype, "ruleLabel": label,
                    "currentPnl": net_pnl, "triggerValue": dte,
                })

    return triggered


def _fallback_suggestion(rule_type: str, snapshot: dict) -> str:
    delta = snapshot.get("net_delta", 0)
    if rule_type == "delta":
        direction = "Put" if delta > 0 else "Call"
        return (
            f"Net delta is drifting beyond your threshold. "
            f"Consider buying 1 lot ATM {direction} to reduce directional exposure."
        )
    if rule_type in ("pnl_pct", "pnl_abs"):
        return (
            "Loss has exceeded your exit threshold. "
            "Close the position now to protect remaining capital — do not average down."
        )
    if rule_type == "dte":
        return (
            "Expiry is approaching and theta decay is accelerating. "
            "Roll to the next monthly expiry or close to avoid rapid time-value erosion."
        )
    return "Review the position and consider closing or adding a hedge."


def get_adjustment_suggestion(
    rule_type: str,
    rule_label: str,
    snapshot: dict,
    strategy_name: str,
    anthropic_api_key: str = "",
) -> str:
    if not anthropic_api_key:
        return _fallback_suggestion(rule_type, snapshot)
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=anthropic_api_key)
        pnl = snapshot.get("net_pnl", 0)
        delta = snapshot.get("net_delta", 0)
        theta = snapshot.get("net_theta", 0)
        vega = snapshot.get("net_vega", 0)
        prompt = (
            f"You are an expert options risk manager. A position has triggered an exit alert.\n\n"
            f"Strategy: {strategy_name}\n"
            f"Alert: {rule_label}\n"
            f"Current P&L: ₹{pnl:.0f}\n"
            f"Greeks — Δ: {delta:.2f}, Θ: {theta:.2f}, V: {vega:.2f}\n\n"
            f"Suggest ONE specific, actionable adjustment in 2 sentences. "
            f"Name the option type, moneyness (ATM/OTM), and BUY or SELL. "
            f"Target a retail Indian trader on NIFTY/BANKNIFTY."
        )
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=160,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text.strip()
    except Exception:
        return _fallback_suggestion(rule_type, snapshot)


def get_post_mortem_explanation(
    strategy_name: str,
    instrument: str,
    entry_date: str,
    closed_at: str,
    final_pnl: float,
    legs: list,
    anthropic_api_key: str = "",
) -> str:
    outcome = "profitable" if final_pnl >= 0 else "loss-making"
    legs_summary = ", ".join(
        f"{l.get('action','?')} {l.get('optionType','?')} {l.get('strike','?')}"
        for l in legs[:4]
    )
    fallback = (
        f"The {strategy_name} on {instrument} ({legs_summary}) was {outcome} with "
        f"₹{final_pnl:.0f} P&L from {entry_date[:10]} to {closed_at[:10]}. "
        f"{'The strategy captured time-value decay as expected.' if final_pnl >= 0 else 'The loss suggests the market moved beyond the profit zone — review entry conditions and stop-loss rules.'}"
    )
    if not anthropic_api_key:
        return fallback
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=anthropic_api_key)
        holding = (
            (date.fromisoformat(closed_at[:10]) - date.fromisoformat(entry_date[:10])).days
        )
        prompt = (
            f"You are an expert options trading coach. Provide a post-mortem analysis.\n\n"
            f"Strategy: {strategy_name} on {instrument}\n"
            f"Legs: {legs_summary}\n"
            f"Held: {holding} days ({entry_date[:10]} → {closed_at[:10]})\n"
            f"Final P&L: ₹{final_pnl:.0f} ({outcome})\n\n"
            f"In 4-5 sentences: what likely worked or didn't, what market condition the strategy needed vs what happened, "
            f"and one specific lesson for next time. Write for a retail Indian options trader. No bullet points."
        )
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text.strip()
    except Exception:
        return fallback
