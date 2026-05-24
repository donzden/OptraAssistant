from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query

from ...core.security import require_internal_key
from ...schemas.options import OptionsChainResponse
from ...services.kite_client import KiteClient as UpstoxClient

router = APIRouter(prefix="/options-chain", tags=["options-chain"])

# NSE: Nifty weekly on Tuesday; BankNifty weekly discontinued (monthly only)
NSE_WEEKLY_SYMBOLS = {"NIFTY"}
NSE_MONTHLY_SYMBOLS = {"NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "NIFTYNXT50"}

# BSE: Sensex weekly on Thursday; Bankex monthly only
BSE_WEEKLY_SYMBOLS = {"SENSEX"}
BSE_MONTHLY_SYMBOLS = {"SENSEX", "BANKEX"}

VALID_SYMBOLS = NSE_MONTHLY_SYMBOLS | BSE_MONTHLY_SYMBOLS

# NSE/BSE market holidays in YYYY-MM-DD. Populate from the exchange calendar as needed.
NSE_HOLIDAYS: set[str] = set()


def _adjust_for_holiday(d: date) -> date:
    """Shift d back to the previous trading day if it falls on a weekend or holiday."""
    while d.weekday() >= 5 or d.strftime("%Y-%m-%d") in NSE_HOLIDAYS:
        d -= timedelta(days=1)
    return d


# ── NSE helpers (Tuesday = weekday 1) ─────────────────────────────────────────

def _next_tuesday(from_date: date) -> date:
    days_ahead = (1 - from_date.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7
    return _adjust_for_holiday(from_date + timedelta(days=days_ahead))


def _last_tuesday_of_month(year: int, month: int) -> date:
    last_day = date(year + (month // 12), month % 12 + 1, 1) - timedelta(days=1)
    days_back = (last_day.weekday() - 1) % 7
    return _adjust_for_holiday(last_day - timedelta(days=days_back))


def _nearest_nse_monthly(from_date: date) -> date:
    candidate = _last_tuesday_of_month(from_date.year, from_date.month)
    if candidate <= from_date:
        next_month = from_date.month % 12 + 1
        next_year = from_date.year + (1 if from_date.month == 12 else 0)
        candidate = _last_tuesday_of_month(next_year, next_month)
    return candidate


# ── BSE helpers (Thursday = weekday 3) ────────────────────────────────────────

def _next_thursday(from_date: date) -> date:
    days_ahead = (3 - from_date.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7
    return _adjust_for_holiday(from_date + timedelta(days=days_ahead))


def _last_thursday_of_month(year: int, month: int) -> date:
    last_day = date(year + (month // 12), month % 12 + 1, 1) - timedelta(days=1)
    days_back = (last_day.weekday() - 3) % 7
    return _adjust_for_holiday(last_day - timedelta(days=days_back))


def _nearest_bse_monthly(from_date: date) -> date:
    candidate = _last_thursday_of_month(from_date.year, from_date.month)
    if candidate <= from_date:
        next_month = from_date.month % 12 + 1
        next_year = from_date.year + (1 if from_date.month == 12 else 0)
        candidate = _last_thursday_of_month(next_year, next_month)
    return candidate


# ── Default expiry per symbol ──────────────────────────────────────────────────

def _default_expiry(symbol: str) -> str:
    today = date.today()
    if symbol in BSE_WEEKLY_SYMBOLS:
        return _next_thursday(today).strftime("%Y-%m-%d")
    if symbol in BSE_MONTHLY_SYMBOLS:
        return _nearest_bse_monthly(today).strftime("%Y-%m-%d")
    if symbol in NSE_WEEKLY_SYMBOLS:
        return _next_tuesday(today).strftime("%Y-%m-%d")
    # NSE monthly-only (BANKNIFTY, FINNIFTY, MIDCPNIFTY, NIFTYNXT50)
    return _nearest_nse_monthly(today).strftime("%Y-%m-%d")


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("", response_model=OptionsChainResponse, dependencies=[Depends(require_internal_key)])
async def get_options_chain(
    symbol: str = Query("NIFTY", description="Underlying symbol"),
    expiry: Optional[str] = Query(None, description="Expiry date YYYY-MM-DD; defaults to nearest expiry for the symbol"),
):
    symbol = symbol.upper()
    if symbol not in VALID_SYMBOLS:
        symbol = "NIFTY"
    if not expiry:
        expiry = _default_expiry(symbol)

    client = UpstoxClient()
    return await client.get_options_chain(symbol, expiry)


@router.get("/expiries", dependencies=[Depends(require_internal_key)])
async def get_expiries(symbol: str = Query("NIFTY")):
    """Return the next 4 expiry dates for a given symbol."""
    symbol = symbol.upper()
    today = date.today()
    expiries = []

    if symbol in BSE_WEEKLY_SYMBOLS:
        # BSE Sensex: weekly Thursdays
        d = today
        while len(expiries) < 4:
            d = _next_thursday(d)
            expiries.append(d.strftime("%Y-%m-%d"))
    elif symbol in BSE_MONTHLY_SYMBOLS:
        # BSE Bankex: monthly last Thursdays
        year, month = today.year, today.month
        while len(expiries) < 4:
            candidate = _last_thursday_of_month(year, month)
            if candidate > today:
                expiries.append(candidate.strftime("%Y-%m-%d"))
            month += 1
            if month > 12:
                month = 1
                year += 1
    elif symbol in NSE_WEEKLY_SYMBOLS:
        # NSE Nifty: weekly Tuesdays
        d = today
        while len(expiries) < 4:
            d = _next_tuesday(d)
            expiries.append(d.strftime("%Y-%m-%d"))
    else:
        # NSE monthly-only symbols (BANKNIFTY, FINNIFTY, MIDCPNIFTY, NIFTYNXT50)
        year, month = today.year, today.month
        while len(expiries) < 4:
            candidate = _last_tuesday_of_month(year, month)
            if candidate > today:
                expiries.append(candidate.strftime("%Y-%m-%d"))
            month += 1
            if month > 12:
                month = 1
                year += 1

    return {"symbol": symbol, "expiries": expiries}
