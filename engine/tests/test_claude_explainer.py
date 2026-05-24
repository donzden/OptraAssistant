"""
OP-42: Unit tests for claude_explainer functions.
Tests cache key generation, fallback explanation, and mocked Anthropic calls.
"""
import pytest
from unittest.mock import MagicMock, patch
from app.services.claude_explainer import _cache_key, _fallback_explanation, explain_strategy, _cache


MOCK_STRATEGY = {
    "name": "Long Call",
    "category": "DIRECTIONAL",
    "type": "DEBIT",
    "riskLevel": "MODERATE",
    "rules": {
        "entry": "Buy 1 ATM call option",
        "exit": "Exit when profit target hit or near expiry",
        "max_profit": "Unlimited upside",
        "max_loss": "Premium paid",
        "delta": "Positive",
        "vega": "Positive",
        "theta": "Negative",
    },
}

MOCK_SIGNAL = {
    "trend": "BULLISH",
    "iv_regime": "LOW_NORMAL",
    "iv_rank": 42,
    "vix": 13.5,
    "pcr": 0.85,
    "market_phase": "TRENDING",
}


# ─── _cache_key ───────────────────────────────────────────────────────────────

class TestCacheKey:
    def test_returns_hex_string(self):
        key = _cache_key("Long Call", "NORMAL", "BULLISH")
        assert isinstance(key, str)
        assert len(key) == 32  # MD5 hex digest

    def test_same_inputs_produce_same_key(self):
        k1 = _cache_key("Iron Condor", "HIGH_NORMAL", "SIDEWAYS")
        k2 = _cache_key("Iron Condor", "HIGH_NORMAL", "SIDEWAYS")
        assert k1 == k2

    def test_different_inputs_produce_different_keys(self):
        k1 = _cache_key("Long Call", "NORMAL", "BULLISH")
        k2 = _cache_key("Long Put", "NORMAL", "BULLISH")
        assert k1 != k2

    def test_order_matters(self):
        k1 = _cache_key("A", "B", "C")
        k2 = _cache_key("B", "A", "C")
        assert k1 != k2


# ─── _fallback_explanation ────────────────────────────────────────────────────

class TestFallbackExplanation:
    def test_contains_strategy_name(self):
        result = _fallback_explanation(MOCK_STRATEGY, MOCK_SIGNAL)
        assert "Long Call" in result

    def test_contains_trend(self):
        result = _fallback_explanation(MOCK_STRATEGY, MOCK_SIGNAL)
        assert "bullish" in result.lower()

    def test_contains_iv_regime(self):
        result = _fallback_explanation(MOCK_STRATEGY, MOCK_SIGNAL)
        assert "low" in result.lower() and "normal" in result.lower()

    def test_contains_entry_rule(self):
        result = _fallback_explanation(MOCK_STRATEGY, MOCK_SIGNAL)
        assert "buy" in result.lower() or "call" in result.lower()

    def test_returns_string(self):
        result = _fallback_explanation(MOCK_STRATEGY, MOCK_SIGNAL)
        assert isinstance(result, str)
        assert len(result) > 50

    def test_missing_rules_does_not_crash(self):
        strategy_no_rules = {"name": "Bare Strategy", "rules": {}}
        result = _fallback_explanation(strategy_no_rules, MOCK_SIGNAL)
        assert "Bare Strategy" in result


# ─── explain_strategy (no API key → fallback) ─────────────────────────────────

class TestExplainStrategyNoApiKey:
    @pytest.mark.asyncio
    async def test_no_api_key_uses_fallback(self):
        with patch("app.services.claude_explainer.settings") as mock_settings:
            mock_settings.anthropic_api_key = None
            result = await explain_strategy(MOCK_STRATEGY, MOCK_SIGNAL)
        assert isinstance(result, str)
        assert len(result) > 20
        assert "Long Call" in result

    @pytest.mark.asyncio
    async def test_empty_api_key_uses_fallback(self):
        with patch("app.services.claude_explainer.settings") as mock_settings:
            mock_settings.anthropic_api_key = ""
            result = await explain_strategy(MOCK_STRATEGY, MOCK_SIGNAL)
        assert "Long Call" in result


# ─── explain_strategy (mocked Anthropic client) ───────────────────────────────

class TestExplainStrategyWithMockedClient:
    @pytest.mark.asyncio
    async def test_calls_anthropic_and_returns_text(self):
        mock_content = MagicMock()
        mock_content.text = "Long Call is excellent in a bullish trending market."
        mock_message = MagicMock()
        mock_message.content = [mock_content]

        _cache.clear()

        with patch("app.services.claude_explainer.settings") as mock_settings, \
             patch("app.services.claude_explainer.anthropic.Anthropic") as mock_anthropic_cls:
            mock_settings.anthropic_api_key = "fake-key-abc"
            mock_client = MagicMock()
            mock_client.messages.create.return_value = mock_message
            mock_anthropic_cls.return_value = mock_client

            result = await explain_strategy(MOCK_STRATEGY, MOCK_SIGNAL)

        assert result == "Long Call is excellent in a bullish trending market."
        mock_client.messages.create.assert_called_once()

    @pytest.mark.asyncio
    async def test_prompt_contains_strategy_name(self):
        mock_content = MagicMock()
        mock_content.text = "Mocked explanation."
        mock_message = MagicMock()
        mock_message.content = [mock_content]

        _cache.clear()

        with patch("app.services.claude_explainer.settings") as mock_settings, \
             patch("app.services.claude_explainer.anthropic.Anthropic") as mock_anthropic_cls:
            mock_settings.anthropic_api_key = "fake-key"
            mock_client = MagicMock()
            mock_client.messages.create.return_value = mock_message
            mock_anthropic_cls.return_value = mock_client

            await explain_strategy(MOCK_STRATEGY, MOCK_SIGNAL)

        call_kwargs = mock_client.messages.create.call_args
        messages = call_kwargs.kwargs.get("messages") or call_kwargs.args[0] if call_kwargs.args else []
        # Extract prompt from messages kwarg
        all_args = str(call_kwargs)
        assert "Long Call" in all_args

    @pytest.mark.asyncio
    async def test_caches_result_on_second_call(self):
        mock_content = MagicMock()
        mock_content.text = "Cached explanation."
        mock_message = MagicMock()
        mock_message.content = [mock_content]

        _cache.clear()

        with patch("app.services.claude_explainer.settings") as mock_settings, \
             patch("app.services.claude_explainer.anthropic.Anthropic") as mock_anthropic_cls:
            mock_settings.anthropic_api_key = "fake-key"
            mock_client = MagicMock()
            mock_client.messages.create.return_value = mock_message
            mock_anthropic_cls.return_value = mock_client

            r1 = await explain_strategy(MOCK_STRATEGY, MOCK_SIGNAL)
            r2 = await explain_strategy(MOCK_STRATEGY, MOCK_SIGNAL)

        assert r1 == r2
        assert mock_client.messages.create.call_count == 1  # only called once due to cache

    @pytest.mark.asyncio
    async def test_anthropic_exception_falls_back(self):
        _cache.clear()

        with patch("app.services.claude_explainer.settings") as mock_settings, \
             patch("app.services.claude_explainer.anthropic.Anthropic") as mock_anthropic_cls:
            mock_settings.anthropic_api_key = "fake-key"
            mock_client = MagicMock()
            mock_client.messages.create.side_effect = Exception("API error")
            mock_anthropic_cls.return_value = mock_client

            result = await explain_strategy(MOCK_STRATEGY, MOCK_SIGNAL)

        assert isinstance(result, str)
        assert len(result) > 20

    @pytest.mark.asyncio
    async def test_portfolio_greeks_included_in_context(self):
        mock_content = MagicMock()
        mock_content.text = "With portfolio context."
        mock_message = MagicMock()
        mock_message.content = [mock_content]

        _cache.clear()

        portfolio_greeks = {"total_delta": -25.0, "total_theta": 380.0, "total_vega": -302.5}

        with patch("app.services.claude_explainer.settings") as mock_settings, \
             patch("app.services.claude_explainer.anthropic.Anthropic") as mock_anthropic_cls:
            mock_settings.anthropic_api_key = "fake-key"
            mock_client = MagicMock()
            mock_client.messages.create.return_value = mock_message
            mock_anthropic_cls.return_value = mock_client

            await explain_strategy(MOCK_STRATEGY, MOCK_SIGNAL, portfolio_greeks=portfolio_greeks)

        all_args = str(mock_client.messages.create.call_args)
        assert "Portfolio Greeks" in all_args or "delta" in all_args.lower()
