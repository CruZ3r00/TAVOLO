"""Istanza singleton di ``PaddleOCR``, inizializzata al boot dell'app."""

from __future__ import annotations

import logging
import threading
from typing import Any

from app.config import get_settings

logger = logging.getLogger(__name__)

_instance: Any = None
_lock = threading.Lock()


def _cuda_available() -> tuple[bool, str]:
    """Verifica disponibilita' CUDA lato Paddle (se importabile)."""

    try:
        import paddle  # type: ignore
    except Exception as exc:  # pragma: no cover - dipende dall'ambiente runtime
        return False, f"paddle import error: {exc}"

    try:
        available = bool(paddle.device.is_compiled_with_cuda())
    except Exception as exc:  # pragma: no cover - difensivo
        return False, f"cuda probe error: {exc}"

    if available:
        return True, "compiled_with_cuda=true"
    return False, "compiled_with_cuda=false"


def init_paddle_singleton() -> Any:
    """Inizializza l'istanza PaddleOCR se non esiste. Thread-safe."""

    global _instance
    if _instance is not None:
        return _instance

    with _lock:
        if _instance is not None:
            return _instance

        settings = get_settings()
        requested_gpu = bool(settings.PADDLE_USE_GPU)
        use_gpu = requested_gpu
        effective_device = "cpu"
        fallback_reason = ""

        from paddleocr import PaddleOCR  # import tardivo: evita costo al parse

        if requested_gpu:
            cuda_ok, reason = _cuda_available()
            if not cuda_ok:
                use_gpu = False
                fallback_reason = reason
                logger.warning(
                    "PaddleOCR GPU richiesto ma non disponibile: fallback CPU",
                    extra={"fallback_reason": reason},
                )

        if use_gpu:
            try:
                _instance = PaddleOCR(
                    lang=settings.OCR_LANG,
                    use_angle_cls=True,
                    use_gpu=True,
                    show_log=False,
                )
                effective_device = "gpu"
            except Exception as exc:
                fallback_reason = f"gpu init error: {exc}"
                logger.warning(
                    "PaddleOCR init GPU fallita: fallback CPU",
                    extra={"fallback_reason": fallback_reason},
                )

        if _instance is None:
            _instance = PaddleOCR(
                lang=settings.OCR_LANG,
                use_angle_cls=True,
                use_gpu=False,
                show_log=False,
            )
            effective_device = "cpu"

        logger.info(
            "PaddleOCR pronto",
            extra={
                "lang": settings.OCR_LANG,
                "requested_gpu": requested_gpu,
                "effective_device": effective_device,
                "fallback_reason": fallback_reason or None,
            },
        )
        return _instance


def get_paddle() -> Any:
    """Ritorna l'istanza; la crea al volo se il warmup non e' stato fatto."""

    if _instance is None:
        return init_paddle_singleton()
    return _instance
