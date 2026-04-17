"""Wrapper PaddleOCR: numpy image → lista di token (text, bbox, confidence)."""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np

from app.ocr.singleton import get_paddle

logger = logging.getLogger(__name__)


@dataclass
class OcrToken:
    """Un token OCR con bounding box a 4 vertici e confidence [0,1]."""

    text: str
    bbox: list[tuple[float, float]]
    confidence: float


def _coerce_point(point: object) -> tuple[float, float]:
    """Converti un singolo punto della bbox in ``(x, y)`` floats."""

    if isinstance(point, (list, tuple)) and len(point) >= 2:
        return (float(point[0]), float(point[1]))
    raise ValueError(f"Punto bbox malformato: {point!r}")


def run_ocr(img: np.ndarray) -> list[OcrToken]:
    """Esegue OCR su un'immagine numpy BGR. Ritorna lista di ``OcrToken``.

    Il formato di output di PaddleOCR v2 e' ``[[ [bbox, (text, conf)], ... ]]``
    (una pagina). Gestiamo anche il caso ``None`` (immagine senza testo).
    """

    if img is None or img.size == 0:
        return []

    paddle = get_paddle()
    try:
        raw = paddle.ocr(img, cls=True)
    except Exception:
        logger.exception("paddle.ocr ha sollevato eccezione")
        return []

    if not raw:
        return []

    # PaddleOCR restituisce una lista per pagina; noi passiamo una sola immagine.
    page = raw[0] if isinstance(raw, list) else raw
    if page is None:
        return []

    tokens: list[OcrToken] = []
    for item in page:
        try:
            bbox_raw, text_conf = item[0], item[1]
            if isinstance(text_conf, (list, tuple)) and len(text_conf) >= 2:
                text = str(text_conf[0])
                confidence = float(text_conf[1])
            else:
                text = str(text_conf)
                confidence = 0.0

            text = text.strip()
            if not text:
                continue

            bbox = [_coerce_point(pt) for pt in bbox_raw]
            if len(bbox) != 4:
                continue

            tokens.append(OcrToken(text=text, bbox=bbox, confidence=confidence))
        except (ValueError, IndexError, TypeError):
            logger.debug("token OCR malformato scartato", extra={"item": repr(item)[:200]})
            continue

    return tokens
