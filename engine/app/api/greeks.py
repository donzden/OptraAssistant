from fastapi import APIRouter, Depends
from pydantic import BaseModel
from ..core.security import require_internal_key
from ..services.greeks import calculate_greeks

router = APIRouter(prefix="/greeks", tags=["greeks"])


class GreeksRequest(BaseModel):
    spot: float
    strike: float
    expiry_days: int
    volatility: float
    risk_free_rate: float = 0.065
    option_type: str = "CE"


@router.post("/calculate", dependencies=[Depends(require_internal_key)])
async def greeks_endpoint(body: GreeksRequest):
    result = calculate_greeks(
        spot=body.spot,
        strike=body.strike,
        t=body.expiry_days / 365,
        sigma=body.volatility,
        r=body.risk_free_rate,
        option_type=body.option_type,
    )
    return result
