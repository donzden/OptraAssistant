"""Redis-backed cache for market signals (30-min TTL)."""
import json
import os
from typing import Optional

import redis.asyncio as aioredis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
_CACHE_TTL = 30 * 60  # seconds

_redis: Optional[aioredis.Redis] = None


def _client() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(REDIS_URL, decode_responses=True)
    return _redis


async def get_cached_signal(symbol: str) -> Optional[dict]:
    try:
        raw = await _client().get(f"market_signal:{symbol.upper()}")
        return json.loads(raw) if raw else None
    except Exception:
        return None


async def set_cached_signal(symbol: str, signal: dict) -> None:
    try:
        await _client().setex(
            f"market_signal:{symbol.upper()}", _CACHE_TTL, json.dumps(signal)
        )
    except Exception:
        pass
