from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.health import router as health_router
from .api.greeks import router as greeks_router
from .api.routes.options_chain import router as options_chain_router
from .api.routes.market import router as market_router
from .api.routes.portfolio import router as portfolio_router
from .api.routes.strategies import router as strategies_router
from .core.config import settings
from .services.market_analyser import analyse_market
from .services.market_cache import set_cached_signal

_TRACKED = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY"]


async def _refresh_all_signals() -> None:
    for symbol in _TRACKED:
        try:
            signal = await analyse_market(symbol)
            await set_cached_signal(symbol, signal)
        except Exception:
            pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = AsyncIOScheduler(timezone="Asia/Kolkata")
    # Warm cache at market open (09:15 IST Mon–Fri)
    scheduler.add_job(
        _refresh_all_signals,
        CronTrigger(hour=9, minute=15, day_of_week="mon-fri", timezone="Asia/Kolkata"),
    )
    # Keep cache fresh every 30 min
    scheduler.add_job(_refresh_all_signals, IntervalTrigger(minutes=30))
    scheduler.start()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(
    title="OptraAssistant Engine",
    version="0.2.0",
    docs_url="/docs" if settings.debug else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(greeks_router, prefix="/api/v1")
app.include_router(options_chain_router, prefix="/api/v1")
app.include_router(market_router, prefix="/api/v1")
app.include_router(portfolio_router, prefix="/api/v1")
app.include_router(strategies_router, prefix="/api/v1")
