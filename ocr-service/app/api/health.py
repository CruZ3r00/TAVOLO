"""Endpoint di health/readiness del microservizio."""

from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, Response, status

from app.config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health")
async def health() -> dict[str, str]:
    """Liveness: ritorna 200 OK finche' il processo risponde."""

    return {"status": "ok"}


@router.get("/ready")
async def ready(response: Response) -> dict[str, str]:
    """Readiness: verifica che Ollama sia raggiungibile (GET /api/tags)."""

    settings = get_settings()
    url = settings.OLLAMA_URL.rstrip("/") + "/api/tags"
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(url)
            if r.status_code < 500:
                return {"ollama": "reachable"}
            response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
            return {"ollama": "unreachable"}
    except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPError) as exc:
        logger.info("readiness: Ollama unreachable", extra={"err": str(exc)})
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"ollama": "unreachable"}
