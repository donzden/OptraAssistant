from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query

from ...core.security import require_internal_key
from ...schemas.options import OptionsChainResponse
from ...services.kite_client import KiteClient as UpstoxClient

router = APIRouter(prefix="/options-chain", tags=["options-chain"])

VALID_SYMBOLS = {"NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY"}


def _nearest_thursday(from_date: date) -> str:
    """Return the nearest upcoming Thursday (NSE weekly expiry) as YYYY-MM-DD."""
    days_ahead = (3 - from_date.weekday()) % 7  # Thursday = 3
    if days_ahead == 0:
        days_ahead = 7
    return (from_date + timedelta(days=days_ahead)).strftime("%Y-%m-%d")


@router.get("", response_model=OptionsChainResponse, dependencies=[Depends(require_internal_key)])
async def get_options_chain(
    symbol: str = Query("NIFTY", description="Underlying symbol"),
    expiry: Optional[str] = Query(None, description="Expiry date YYYY-MM-DD; defaults to nearest Thursday"),
):
    symbol = symbol.upper()
    if symbol not in VALID_SYMBOLS:
        symbol = "NIFTY"
    if not expiry:
        expiry = _nearest_thursday(date.today())

    client = UpstoxClient()
    return await client.get_options_chain(symbol, expiry)


@router.get("/expiries", dependencies=[Depends(require_internal_key)])
async def get_expiries(symbol: str = Query("NIFTY")):
    """Return the next 4 weekly expiry dates for a given symbol."""
    today = date.today()
    expiries = []
    d = today
    while len(expiries) < 4:
        days_ahead = (3 - d.weekday()) % 7
        if days_ahead == 0:
            days_ahead = 7
        d = d + timedelta(days=days_ahead)
        expiries.append(d.strftime("%Y-%m-%d"))
    return {"symbol": symbol.upper(), "expiries": expiries}
