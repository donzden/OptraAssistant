import random
from datetime import date
from typing import Optional

import httpx

from ..core.config import settings
from ..schemas.options import (
    GreeksData,
    MarketSentimentResponse,
    OptionData,
    OptionStrike,
    OptionsChainResponse,
    VixResponse,
)
from .greeks import calculate_greeks
from .iv_engine import (
    generate_mock_historical_iv,
    implied_volatility,
    iv_percentile,
    iv_rank,
)

UPSTOX_BASE = "https://api.upstox.com/v2"

INSTRUMENT_KEYS = {
    "NIFTY": "NSE_INDEX|Nifty 50",
    "BANKNIFTY": "NSE_INDEX|Nifty Bank",
    "FINNIFTY": "NSE_INDEX|Nifty Fin Service",
    "MIDCPNIFTY": "NSE_INDEX|Nifty MidCap Select",
    "VIX": "NSE_INDEX|India VIX",
}

_MOCK_SPOTS = {"NIFTY": 22080.0, "BANKNIFTY": 46340.0, "FINNIFTY": 21120.0, "MIDCPNIFTY": 12450.0}
_STRIKE_STEPS = {"NIFTY": 50, "BANKNIFTY": 100, "FINNIFTY": 50, "MIDCPNIFTY": 25}


class UpstoxClient:
    def __init__(self, access_token: Optional[str] = None):
        self._token = access_token or settings.upstox_api_key

    @property
    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self._token}", "Accept": "application/json"}

    @property
    def has_credentials(self) -> bool:
        return bool(self._token)

    # ------------------------------------------------------------------
    # Public methods
    # ------------------------------------------------------------------

    async def get_options_chain(self, symbol: str, expiry: str) -> OptionsChainResponse:
        if not self.has_credentials:
            return self._mock_options_chain(symbol, expiry)
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                resp = await client.get(
                    f"{UPSTOX_BASE}/option/chain",
                    params={
                        "instrument_key": INSTRUMENT_KEYS.get(symbol.upper(), f"NSE_INDEX|{symbol}"),
                        "expiry_date": expiry,
                    },
                    headers=self._headers,
                )
                resp.raise_for_status()
                return self._parse_options_chain(symbol, expiry, resp.json())
            except Exception:
                return self._mock_options_chain(symbol, expiry)

    async def get_vix(self) -> VixResponse:
        if not self.has_credentials:
            return self._mock_vix()
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                resp = await client.get(
                    f"{UPSTOX_BASE}/market-quote/quotes",
                    params={"instrument_key": INSTRUMENT_KEYS["VIX"]},
                    headers=self._headers,
                )
                resp.raise_for_status()
                return self._parse_vix(resp.json())
            except Exception:
                return self._mock_vix()

    async def get_spot_price(self, symbol: str) -> float:
        if not self.has_credentials:
            return _MOCK_SPOTS.get(symbol.upper(), 22080.0)
        instrument_key = INSTRUMENT_KEYS.get(symbol.upper(), f"NSE_INDEX|{symbol}")
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                resp = await client.get(
                    f"{UPSTOX_BASE}/market-quote/ltp",
                    params={"instrument_key": instrument_key},
                    headers=self._headers,
                )
                resp.raise_for_status()
                return resp.json()["data"][instrument_key]["last_price"]
            except Exception:
                return _MOCK_SPOTS.get(symbol.upper(), 22080.0)

    async def get_positions(self, user_access_token: str) -> list:
        """Fetch short-term positions using the user's OAuth access token."""
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{UPSTOX_BASE}/portfolio/short-term-positions",
                headers={"Authorization": f"Bearer {user_access_token}", "Accept": "application/json"},
            )
            resp.raise_for_status()
            return resp.json().get("data", [])

    async def get_market_sentiment(self) -> MarketSentimentResponse:
        vix = await self.get_vix()
        pcr = 0.92 + random.uniform(-0.15, 0.15)  # mock PCR; replace with real OI sum when live
        trend = "SIDEWAYS"
        if vix.value < 13:
            trend = "BULLISH"
        elif vix.value > 20:
            trend = "BEARISH"

        stances = {
            "LOW_VOL": "Consider selling options / premium capture strategies (Iron Condor, Straddle sell)",
            "MODERATE": "Balanced approach — directional spreads or delta-neutral positions",
            "HIGH_VOL": "Buy premium / defined-risk spreads; avoid naked sells",
            "EXTREME": "High caution — hedge existing positions; consider exiting near-expiry naked sells",
        }
        return MarketSentimentResponse(
            vix=vix,
            nifty_trend=trend,
            pcr=round(pcr, 2),
            recommended_stance=stances[vix.sentiment],
            is_mock=not self.has_credentials,
        )

    # ------------------------------------------------------------------
    # Parsers
    # ------------------------------------------------------------------

    def _parse_options_chain(self, symbol: str, expiry: str, raw: dict) -> OptionsChainResponse:
        data = raw.get("data", [])
        spot = data[0].get("underlying_spot_price", _MOCK_SPOTS.get(symbol.upper(), 22080.0)) if data else 22080.0
        step = _STRIKE_STEPS.get(symbol.upper(), 50)
        atm = round(spot / step) * step
        t = max((date.fromisoformat(expiry) - date.today()).days, 1) / 365
        r = 0.065

        strikes = []
        for item in sorted(data, key=lambda x: x["strike_price"]):
            strike = item["strike_price"]
            ce_md = item.get("call_options", {}).get("market_data", {})
            pe_md = item.get("put_options", {}).get("market_data", {})
            ce_ltp, pe_ltp = ce_md.get("ltp", 0), pe_md.get("ltp", 0)
            ce_iv = implied_volatility(ce_ltp, spot, strike, t, r, "CE") if ce_ltp else None
            pe_iv = implied_volatility(pe_ltp, spot, strike, t, r, "PE") if pe_ltp else None
            ce_g = calculate_greeks(spot, strike, t, (ce_iv or 16) / 100, r, "CE")
            pe_g = calculate_greeks(spot, strike, t, (pe_iv or 16) / 100, r, "PE")
            strikes.append(OptionStrike(
                strike_price=strike,
                is_atm=abs(strike - atm) < step / 2,
                ce=OptionData(ltp=ce_ltp, open_interest=ce_md.get("oi"), volume=ce_md.get("volume"),
                              iv=ce_iv, greeks=self._to_greeks(ce_g)),
                pe=OptionData(ltp=pe_ltp, open_interest=pe_md.get("oi"), volume=pe_md.get("volume"),
                              iv=pe_iv, greeks=self._to_greeks(pe_g)),
            ))

        atm_iv = self._atm_iv(strikes) or 16.0
        hist = generate_mock_historical_iv(atm_iv)
        return OptionsChainResponse(
            symbol=symbol, expiry=expiry, spot_price=round(spot, 2), atm_strike=atm,
            iv_rank=iv_rank(atm_iv, max(hist), min(hist)),
            iv_percentile=iv_percentile(atm_iv, hist),
            atm_iv=atm_iv, pcr=self._calc_pcr(strikes), strikes=strikes, is_mock=False,
        )

    def _parse_vix(self, raw: dict) -> VixResponse:
        key = INSTRUMENT_KEYS["VIX"]
        q = raw.get("data", {}).get(key, {})
        ltp = q.get("last_price", 14.5)
        prev = q.get("close_price", ltp) or ltp
        change = round(ltp - prev, 2)
        pct = round(change / prev * 100, 2) if prev else 0.0
        return VixResponse(value=ltp, change=change, change_pct=pct, sentiment=self._vix_sentiment(ltp))

    # ------------------------------------------------------------------
    # Mock data
    # ------------------------------------------------------------------

    def _mock_options_chain(self, symbol: str, expiry: str) -> OptionsChainResponse:
        spot = _MOCK_SPOTS.get(symbol.upper(), 22080.0)
        step = _STRIKE_STEPS.get(symbol.upper(), 50)
        atm = round(spot / step) * step
        t = max((date.fromisoformat(expiry) - date.today()).days, 1) / 365
        r, atm_iv_base = 0.065, 15.8

        rng = random.Random(42)
        strikes = []
        for i in range(-10, 11):
            strike = atm + i * step
            m = (strike - atm) / atm
            ce_iv = atm_iv_base + max(0, m) * 25 + abs(m) * 5
            pe_iv = atm_iv_base - min(0, m) * 30 + abs(m) * 8
            ce_g = calculate_greeks(spot, strike, t, ce_iv / 100, r, "CE")
            pe_g = calculate_greeks(spot, strike, t, pe_iv / 100, r, "PE")
            oi = max(50000, int(500000 * max(0.05, 1 - abs(m) * 12) + rng.randint(-30000, 30000)))
            strikes.append(OptionStrike(
                strike_price=strike,
                is_atm=(strike == atm),
                ce=OptionData(ltp=round(ce_g["price"], 2), open_interest=oi,
                              volume=int(oi * 0.15), iv=round(ce_iv, 2),
                              greeks=self._to_greeks(ce_g)),
                pe=OptionData(ltp=round(pe_g["price"], 2), open_interest=int(oi * 1.1),
                              volume=int(oi * 0.12), iv=round(pe_iv, 2),
                              greeks=self._to_greeks(pe_g)),
            ))

        hist = generate_mock_historical_iv(atm_iv_base)
        return OptionsChainResponse(
            symbol=symbol, expiry=expiry, spot_price=spot, atm_strike=atm,
            iv_rank=iv_rank(atm_iv_base, max(hist), min(hist)),
            iv_percentile=iv_percentile(atm_iv_base, hist),
            atm_iv=atm_iv_base, pcr=self._calc_pcr(strikes), strikes=strikes, is_mock=True,
        )

    def _mock_vix(self) -> VixResponse:
        return VixResponse(value=14.2, change=-0.35, change_pct=-2.41, sentiment="MODERATE")

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _to_greeks(self, g: dict) -> GreeksData:
        return GreeksData(delta=g["delta"], gamma=g["gamma"], theta=g["theta"], vega=g["vega"], rho=g["rho"])

    def _vix_sentiment(self, v: float) -> str:
        if v < 12:
            return "LOW_VOL"
        if v < 18:
            return "MODERATE"
        if v < 25:
            return "HIGH_VOL"
        return "EXTREME"

    def _atm_iv(self, strikes: list) -> Optional[float]:
        atm = next((s for s in strikes if s.is_atm), None)
        if atm and atm.ce and atm.ce.iv:
            return atm.ce.iv
        return None

    def _calc_pcr(self, strikes: list) -> float:
        ce_oi = sum((s.ce.open_interest or 0) for s in strikes if s.ce)
        pe_oi = sum((s.pe.open_interest or 0) for s in strikes if s.pe)
        return round(pe_oi / ce_oi, 2) if ce_oi else 1.0
