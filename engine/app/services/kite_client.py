"""
Zerodha Kite Connect client.

Options chain assembly:
  1. Instruments CSV (cached per calendar day) → filter strikes for symbol + expiry
  2. Batch quote fetch for those instrument tokens → build chain with live prices

Auth note: Kite access tokens reset at 6 AM IST every day.
           The engine uses the access token stored in the DB (set by the Node API after OAuth).
"""

import asyncio
import csv
import io
import random
from datetime import date, datetime, timedelta
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

KITE_BASE = "https://api.kite.trade"
KITE_VERSION = "3"

_MOCK_SPOTS = {"NIFTY": 22080.0, "BANKNIFTY": 46340.0, "FINNIFTY": 21120.0, "MIDCPNIFTY": 12450.0}
_STRIKE_STEPS = {"NIFTY": 50, "BANKNIFTY": 100, "FINNIFTY": 50, "MIDCPNIFTY": 25}
_LOT_SIZES = {"NIFTY": 25, "BANKNIFTY": 15, "FINNIFTY": 40, "MIDCPNIFTY": 50}

# Instrument cache: refreshed once per calendar day
_instruments_cache: dict = {"date": None, "data": []}


class KiteClient:
    def __init__(self, access_token: Optional[str] = None):
        self._token = access_token or settings.kite_api_key

    @property
    def _headers(self) -> dict:
        return {
            "X-Kite-Version": KITE_VERSION,
            "Authorization": f"token {settings.kite_api_key}:{self._token}",
        }

    @property
    def has_credentials(self) -> bool:
        return bool(self._token) and bool(settings.kite_api_key)

    # ------------------------------------------------------------------
    # Public interface (same contract as the old UpstoxClient)
    # ------------------------------------------------------------------

    async def get_options_chain(self, symbol: str, expiry: str) -> OptionsChainResponse:
        if not self.has_credentials:
            return self._mock_options_chain(symbol, expiry)
        try:
            return await self._live_options_chain(symbol, expiry)
        except Exception:
            return self._mock_options_chain(symbol, expiry)

    async def get_vix(self) -> VixResponse:
        if not self.has_credentials:
            return self._mock_vix()
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{KITE_BASE}/quote/ltp",
                    params={"i": "NSE:INDIA VIX"},
                    headers=self._headers,
                )
                resp.raise_for_status()
                data = resp.json().get("data", {}).get("NSE:INDIA VIX", {})
                ltp = data.get("last_price", 14.5)
                return VixResponse(
                    value=ltp, change=0.0, change_pct=0.0,
                    sentiment=self._vix_sentiment(ltp),
                )
        except Exception:
            return self._mock_vix()

    async def get_spot_price(self, symbol: str) -> float:
        if not self.has_credentials:
            return _MOCK_SPOTS.get(symbol.upper(), 22080.0)
        nse_key = {"NIFTY": "NSE:NIFTY 50", "BANKNIFTY": "NSE:NIFTY BANK"}.get(
            symbol.upper(), f"NSE:{symbol}"
        )
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{KITE_BASE}/quote/ltp",
                    params={"i": nse_key},
                    headers=self._headers,
                )
                resp.raise_for_status()
                return resp.json()["data"][nse_key]["last_price"]
        except Exception:
            return _MOCK_SPOTS.get(symbol.upper(), 22080.0)

    async def get_positions(self, user_access_token: str) -> list:
        """Fetch net positions using the user's daily access token."""
        headers = {
            "X-Kite-Version": KITE_VERSION,
            "Authorization": f"token {settings.kite_api_key}:{user_access_token}",
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{KITE_BASE}/portfolio/positions", headers=headers)
            resp.raise_for_status()
            return resp.json().get("data", {}).get("net", [])

    async def get_market_sentiment(self) -> MarketSentimentResponse:
        vix = await self.get_vix()
        pcr = 0.92 + random.uniform(-0.15, 0.15)
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
    # Live chain assembly
    # ------------------------------------------------------------------

    async def _live_options_chain(self, symbol: str, expiry: str) -> OptionsChainResponse:
        instruments = await self._get_nfo_instruments(symbol, expiry)
        if not instruments:
            return self._mock_options_chain(symbol, expiry)

        step = _STRIKE_STEPS.get(symbol.upper(), 50)
        spot = await self.get_spot_price(symbol)
        atm = round(spot / step) * step
        t = max((date.fromisoformat(expiry) - date.today()).days, 1) / 365
        r = 0.065

        # Build {strike: {CE: token, PE: token}} map
        strike_map: dict[float, dict[str, dict]] = {}
        for inst in instruments:
            strike = float(inst["strike"])
            opt_type = inst["instrument_type"]  # CE or PE
            if strike not in strike_map:
                strike_map[strike] = {}
            strike_map[strike][opt_type] = inst

        # Batch quote fetch (max 500 instruments per call)
        tokens = [
            f"NFO:{inst['tradingsymbol']}"
            for inst in instruments
        ]
        quotes: dict = {}
        for batch_start in range(0, len(tokens), 500):
            batch = tokens[batch_start: batch_start + 500]
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"{KITE_BASE}/quote",
                    params={"i": batch},
                    headers=self._headers,
                )
                if resp.status_code == 200:
                    quotes.update(resp.json().get("data", {}))

        # Assemble strikes
        strikes_out: list[OptionStrike] = []
        for strike in sorted(strike_map.keys()):
            ce_inst = strike_map[strike].get("CE")
            pe_inst = strike_map[strike].get("PE")

            ce_od = self._build_option_data(ce_inst, quotes, spot, strike, t, r, "CE") if ce_inst else None
            pe_od = self._build_option_data(pe_inst, quotes, spot, strike, t, r, "PE") if pe_inst else None

            strikes_out.append(OptionStrike(
                strike_price=strike,
                is_atm=abs(strike - atm) < step / 2,
                ce=ce_od,
                pe=pe_od,
            ))

        atm_iv = self._atm_iv(strikes_out) or 16.0
        hist = generate_mock_historical_iv(atm_iv)
        return OptionsChainResponse(
            symbol=symbol, expiry=expiry, spot_price=round(spot, 2), atm_strike=atm,
            iv_rank=iv_rank(atm_iv, max(hist), min(hist)),
            iv_percentile=iv_percentile(atm_iv, hist),
            atm_iv=atm_iv, pcr=self._calc_pcr(strikes_out),
            strikes=strikes_out, is_mock=False,
        )

    def _build_option_data(
        self, inst: dict, quotes: dict, spot: float, strike: float, t: float, r: float, opt_type: str
    ) -> OptionData:
        key = f"NFO:{inst['tradingsymbol']}"
        q = quotes.get(key, {})
        ltp = q.get("last_price") or 0.0
        oi = q.get("oi") or 0
        volume = q.get("volume") or 0
        iv_val = implied_volatility(ltp, spot, strike, t, r, opt_type) if ltp > 0 else None
        g = calculate_greeks(spot, strike, t, (iv_val or 16) / 100, r, opt_type)
        return OptionData(
            ltp=round(ltp, 2),
            open_interest=oi,
            volume=volume,
            iv=iv_val,
            greeks=GreeksData(
                delta=g["delta"], gamma=g["gamma"],
                theta=g["theta"], vega=g["vega"], rho=g["rho"],
            ),
        )

    # ------------------------------------------------------------------
    # Instruments cache
    # ------------------------------------------------------------------

    async def _get_nfo_instruments(self, symbol: str, expiry: str) -> list[dict]:
        global _instruments_cache
        today = date.today().isoformat()
        if _instruments_cache["date"] != today:
            _instruments_cache = {"date": today, "data": await self._download_nfo_instruments()}

        all_insts = _instruments_cache["data"]
        sym_upper = symbol.upper()
        return [
            i for i in all_insts
            if i.get("name") == sym_upper
            and i.get("expiry") == expiry
            and i.get("instrument_type") in ("CE", "PE")
        ]

    async def _download_nfo_instruments(self) -> list[dict]:
        """Download the NFO instruments CSV from Kite and parse it."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(
                    f"{KITE_BASE}/instruments/NFO",
                    headers=self._headers,
                )
                resp.raise_for_status()
                reader = csv.DictReader(io.StringIO(resp.text))
                return list(reader)
        except Exception:
            return []

    # ------------------------------------------------------------------
    # Mock data (identical logic to what UpstoxClient used)
    # ------------------------------------------------------------------

    def _mock_options_chain(self, symbol: str, expiry: str) -> OptionsChainResponse:
        spot = _MOCK_SPOTS.get(symbol.upper(), 22080.0)
        step = _STRIKE_STEPS.get(symbol.upper(), 50)
        atm = round(spot / step) * step
        t = max((date.fromisoformat(expiry) - date.today()).days, 1) / 365
        r, atm_iv_base = 0.065, 15.8

        rng = random.Random(42)
        strikes: list[OptionStrike] = []
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
                ce=OptionData(
                    ltp=round(ce_g["price"], 2), open_interest=oi,
                    volume=int(oi * 0.15), iv=round(ce_iv, 2),
                    greeks=GreeksData(
                        delta=ce_g["delta"], gamma=ce_g["gamma"],
                        theta=ce_g["theta"], vega=ce_g["vega"], rho=ce_g["rho"],
                    ),
                ),
                pe=OptionData(
                    ltp=round(pe_g["price"], 2), open_interest=int(oi * 1.1),
                    volume=int(oi * 0.12), iv=round(pe_iv, 2),
                    greeks=GreeksData(
                        delta=pe_g["delta"], gamma=pe_g["gamma"],
                        theta=pe_g["theta"], vega=pe_g["vega"], rho=pe_g["rho"],
                    ),
                ),
            ))

        hist = generate_mock_historical_iv(atm_iv_base)
        return OptionsChainResponse(
            symbol=symbol, expiry=expiry, spot_price=spot, atm_strike=atm,
            iv_rank=iv_rank(atm_iv_base, max(hist), min(hist)),
            iv_percentile=iv_percentile(atm_iv_base, hist),
            atm_iv=atm_iv_base, pcr=self._calc_pcr(strikes),
            strikes=strikes, is_mock=True,
        )

    def _mock_vix(self) -> VixResponse:
        return VixResponse(value=14.2, change=-0.35, change_pct=-2.41, sentiment="MODERATE")

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _vix_sentiment(self, v: float) -> str:
        if v < 12:
            return "LOW_VOL"
        if v < 18:
            return "MODERATE"
        if v < 25:
            return "HIGH_VOL"
        return "EXTREME"

    def _atm_iv(self, strikes: list[OptionStrike]) -> Optional[float]:
        atm = next((s for s in strikes if s.is_atm), None)
        if atm and atm.ce and atm.ce.iv:
            return atm.ce.iv
        return None

    def _calc_pcr(self, strikes: list[OptionStrike]) -> float:
        ce_oi = sum((s.ce.open_interest or 0) for s in strikes if s.ce)
        pe_oi = sum((s.pe.open_interest or 0) for s in strikes if s.pe)
        return round(pe_oi / ce_oi, 2) if ce_oi else 1.0
