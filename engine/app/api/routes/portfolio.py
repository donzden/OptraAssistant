from datetime import date

from fastapi import APIRouter, Depends

from ...core.security import require_internal_key
from ...schemas.options import GreeksData, PortfolioGreeksRequest, PortfolioGreeksResponse, PositionGreeks
from ...services.greeks import calculate_greeks
from ...services.kite_client import KiteClient as UpstoxClient

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


@router.post("/greeks", response_model=PortfolioGreeksResponse, dependencies=[Depends(require_internal_key)])
async def calculate_portfolio_greeks(body: PortfolioGreeksRequest):
    """
    Calculate Greeks for each position and aggregate across the portfolio.
    Accepts current spot prices from the API layer (avoids multiple Upstox calls).
    """
    upstox = UpstoxClient()
    r = 0.065

    position_results: list[PositionGreeks] = []
    agg = {"delta": 0.0, "gamma": 0.0, "theta": 0.0, "vega": 0.0, "rho": 0.0}
    total_pnl = 0.0

    for pos in body.positions:
        symbol = pos.get("symbol", "NIFTY").upper()
        strike = float(pos.get("strike", 0))
        expiry = pos.get("expiry", date.today().isoformat())
        option_type = pos.get("option_type", "CE").upper()
        lots = int(pos.get("lots", 1))
        lot_size = int(pos.get("lot_size", 50))
        avg_price = float(pos.get("avg_price", 0))
        position_type = pos.get("position_type", "LONG").upper()
        position_id = pos.get("id", "")

        t = max((date.fromisoformat(expiry) - date.today()).days, 1) / 365
        spot = body.spot_prices.get(symbol) or await upstox.get_spot_price(symbol)

        # Fetch current LTP from Upstox or use IV=16% as fallback
        current_option_chain = await upstox.get_options_chain(symbol, expiry)
        strike_data = next((s for s in current_option_chain.strikes if s.strike_price == strike), None)
        if strike_data:
            od = strike_data.ce if option_type == "CE" else strike_data.pe
            current_price = od.ltp if od and od.ltp else 0.0
            iv = (od.iv or 16.0) / 100 if od else 0.16
        else:
            iv = 0.16
            current_price = 0.0

        g = calculate_greeks(spot, strike, t, iv, r, option_type)
        direction = 1 if position_type == "LONG" else -1
        qty = lots * lot_size * direction

        pnl = (current_price - avg_price) * abs(qty) * direction
        total_pnl += pnl

        for key in agg:
            agg[key] += g[key] * qty

        position_results.append(PositionGreeks(
            position_id=position_id,
            delta=round(g["delta"] * qty, 4),
            gamma=round(g["gamma"] * qty, 6),
            theta=round(g["theta"] * qty, 4),
            vega=round(g["vega"] * qty, 4),
            rho=round(g["rho"] * qty, 4),
            current_price=round(current_price, 2),
            pnl=round(pnl, 2),
        ))

    return PortfolioGreeksResponse(
        positions=position_results,
        aggregate=GreeksData(
            delta=round(agg["delta"], 4),
            gamma=round(agg["gamma"], 6),
            theta=round(agg["theta"], 4),
            vega=round(agg["vega"], 4),
            rho=round(agg["rho"], 4),
        ),
        total_pnl=round(total_pnl, 2),
    )
