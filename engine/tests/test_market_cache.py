"""
Unit tests for market_cache.py — Redis-backed market signal cache,
fails open (returns None / swallows errors) when Redis is unreachable.
"""
from unittest.mock import AsyncMock, patch

import pytest

from app.services import market_cache


@pytest.fixture(autouse=True)
def reset_redis_singleton():
    market_cache._redis = None
    yield
    market_cache._redis = None


@pytest.mark.asyncio
async def test_get_cached_signal_returns_none_when_not_cached():
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=None)
    with patch("app.services.market_cache._client", return_value=mock_client):
        result = await market_cache.get_cached_signal("NIFTY")
    assert result is None


@pytest.mark.asyncio
async def test_get_cached_signal_returns_parsed_json():
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value='{"trend": "BULLISH", "vix": 13.2}')
    with patch("app.services.market_cache._client", return_value=mock_client):
        result = await market_cache.get_cached_signal("nifty")
    assert result == {"trend": "BULLISH", "vix": 13.2}
    mock_client.get.assert_called_once_with("market_signal:NIFTY")


@pytest.mark.asyncio
async def test_get_cached_signal_fails_open_on_redis_error():
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(side_effect=ConnectionError("redis down"))
    with patch("app.services.market_cache._client", return_value=mock_client):
        result = await market_cache.get_cached_signal("NIFTY")
    assert result is None


@pytest.mark.asyncio
async def test_set_cached_signal_stores_with_ttl():
    mock_client = AsyncMock()
    with patch("app.services.market_cache._client", return_value=mock_client):
        await market_cache.set_cached_signal("BANKNIFTY", {"trend": "BEARISH"})
    mock_client.setex.assert_called_once_with(
        "market_signal:BANKNIFTY", 30 * 60, '{"trend": "BEARISH"}',
    )


@pytest.mark.asyncio
async def test_set_cached_signal_swallows_redis_errors():
    mock_client = AsyncMock()
    mock_client.setex = AsyncMock(side_effect=ConnectionError("redis down"))
    with patch("app.services.market_cache._client", return_value=mock_client):
        await market_cache.set_cached_signal("NIFTY", {"trend": "BULLISH"})  # must not raise
