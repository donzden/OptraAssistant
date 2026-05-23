from pydantic import BaseModel
from typing import Optional, List


class GreeksData(BaseModel):
    delta: float
    gamma: float
    theta: float
    vega: float
    rho: float


class OptionData(BaseModel):
    ltp: Optional[float] = None
    open_interest: Optional[int] = None
    volume: Optional[int] = None
    iv: Optional[float] = None
    bid: Optional[float] = None
    ask: Optional[float] = None
    greeks: Optional[GreeksData] = None


class OptionStrike(BaseModel):
    strike_price: float
    is_atm: bool = False
    ce: Optional[OptionData] = None
    pe: Optional[OptionData] = None


class OptionsChainResponse(BaseModel):
    symbol: str
    expiry: str
    spot_price: float
    atm_strike: float
    iv_rank: Optional[float] = None
    iv_percentile: Optional[float] = None
    atm_iv: Optional[float] = None
    pcr: Optional[float] = None
    strikes: List[OptionStrike]
    is_mock: bool = False


class VixResponse(BaseModel):
    value: float
    change: float
    change_pct: float
    sentiment: str  # LOW_VOL | MODERATE | HIGH_VOL | EXTREME


class MarketSentimentResponse(BaseModel):
    vix: VixResponse
    nifty_trend: str  # BULLISH | BEARISH | SIDEWAYS
    pcr: float
    recommended_stance: str
    is_mock: bool = False


class PortfolioGreeksRequest(BaseModel):
    positions: List[dict]  # [{symbol, strike, expiry, option_type, lots, lot_size, avg_price}]
    spot_prices: dict  # {symbol: spot_price}


class PositionGreeks(BaseModel):
    position_id: str
    delta: float
    gamma: float
    theta: float
    vega: float
    rho: float
    current_price: float
    pnl: float


class PortfolioGreeksResponse(BaseModel):
    positions: List[PositionGreeks]
    aggregate: GreeksData
    total_pnl: float
