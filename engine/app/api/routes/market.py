from fastapi import APIRouter, Depends

from ...core.security import require_internal_key
from ...schemas.options import MarketSentimentResponse, VixResponse
from ...services.upstox_client import UpstoxClient

router = APIRouter(prefix="/market", tags=["market"])


@router.get("/vix", response_model=VixResponse, dependencies=[Depends(require_internal_key)])
async def get_vix():
    client = UpstoxClient()
    return await client.get_vix()


@router.get("/sentiment", response_model=MarketSentimentResponse, dependencies=[Depends(require_internal_key)])
async def get_market_sentiment():
    client = UpstoxClient()
    return await client.get_market_sentiment()
