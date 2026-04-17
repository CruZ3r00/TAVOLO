"""Istanza singleton di ``PaddleOCR``, inizializzata al boot dell'app."""

from __future__ import annotations

import logging
import threading
from typing import Any

from app.config import get_settings

logger = logging.getLogger(__name__)

_instance: Any = None
_lock = threading.Lock()


def init_paddle_singleton() -> Any:
    """Inizializza l'istanza PaddleOCR se non esiste. Thread-safe."""

    global _instance
    if _instance is not None:
        return _instance

    with _lock:
        if _instance is not None:
            return _instance

        settings = get_settings()
        logger.info(
            "PaddleOCR init",
            extra={"lang": settings.OCR_LANG, "use_gpu": settings.PADDLE_USE_GPU},
        )

        from paddleocr import PaddleOCR  # import tardivo: evita costo al parse

        _instance = PaddleOCR(
            lang=settings.OCR_LANG,
            use_angle_cls=True,
            use_gpu=settings.PADDLE_USE_GPU,
            show_log=False,
        )
        logger.info("PaddleOCR pronto")
        return _instance


def get_paddle() -> Any:
    """Ritorna l'istanza; la crea al volo se il warmup non e' stato fatto."""

    if _instance is None:
        return init_paddle_singleton()
    return _instance
