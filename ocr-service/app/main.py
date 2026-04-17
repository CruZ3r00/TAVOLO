"""FastAPI entrypoint: monta i router e avvia il warmup PaddleOCR al boot."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI

from app.api.health import router as health_router
from app.api.process import router as process_router
from app.config import get_settings
from app.ocr.singleton import init_paddle_singleton
from app.utils.logging import configure_logging

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Init logging e PaddleOCR al boot; nessun teardown esplicito."""

    settings = get_settings()
    configure_logging(settings.LOG_LEVEL)
    logger.info(
        "ocr-service boot",
        extra={
            "host": settings.HOST,
            "port": settings.PORT,
            "ollama_url": settings.OLLAMA_URL,
            "ollama_model": settings.OLLAMA_MODEL,
            "ocr_lang": settings.OCR_LANG,
            "allowed_input_dir": settings.ALLOWED_INPUT_DIR,
        },
    )
    try:
        init_paddle_singleton()
    except Exception as exc:
        logger.exception("PaddleOCR init fallita, le richieste lo inizializzeranno lazy")
        logger.error("paddle_init_error", extra={"err": str(exc)})
    yield
    logger.info("ocr-service shutdown")


app = FastAPI(
    title="ocr-service",
    version="0.1.0",
    description="Pipeline OCR + strutturazione menu (PaddleOCR + Ollama).",
    lifespan=lifespan,
)

app.include_router(health_router, tags=["health"])
app.include_router(process_router, tags=["process"])


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        log_config=None,
    )
