from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api.health import router as health_router
from .api.greeks import router as greeks_router
from .core.config import settings

app = FastAPI(title="OptraAssistant Engine", version="0.1.0", docs_url="/docs" if settings.debug else None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(greeks_router, prefix="/api/v1")
