from fastapi import HTTPException, Security
from fastapi.security import APIKeyHeader
from .config import settings

api_key_header = APIKeyHeader(name="X-Internal-Key", auto_error=False)


def require_internal_key(key: str = Security(api_key_header)) -> str:
    if key != settings.internal_api_key:
        raise HTTPException(status_code=401, detail="Invalid internal API key")
    return key
