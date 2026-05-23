from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api.health import router as health_router
from .api.greeks import router as greeks_router
from .api.routes.options_chain import router as options_chain_router
from .api.routes.market import router as market_router
from .api.routes.portfolio import router as portfolio_router
from .api.routes.strategies import router as strategies_router
from .core.config import settings

app = FastAPI(title="OptraAssistant Engine", version="0.2.0", docs_url="/docs" if settings.debug else None)

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
