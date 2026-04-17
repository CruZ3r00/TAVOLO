"""Preprocessing immagine per migliorare la qualita' OCR.

Pipeline:
1. grayscale
2. fastNlMeans denoising
3. CLAHE (contrast-limited adaptive histogram equalization)
4. deskew (via minAreaRect sulle pixel di testo)
"""

from __future__ import annotations

import logging

import cv2
import numpy as np

logger = logging.getLogger(__name__)

_DESKEW_THRESHOLD_DEG = 0.5


def _estimate_skew_angle(binary_inv: np.ndarray) -> float:
    """Stima l'angolo di rotazione del testo in gradi.

    Ritorna 0.0 se non riesce a stimarlo (pochi pixel, errore OpenCV).
    """

    coords = np.column_stack(np.where(binary_inv > 0))
    if coords.size == 0 or len(coords) < 10:
        return 0.0

    try:
        rect_angle = cv2.minAreaRect(coords)[-1]
    except cv2.error:
        return 0.0

    # cv2.minAreaRect ritorna angoli in (-90, 0]. Normalizziamo a (-45, 45].
    if rect_angle < -45:
        angle = -(90 + rect_angle)
    else:
        angle = -rect_angle
    return float(angle)


def clean_image(img: np.ndarray) -> np.ndarray:
    """Applica deskew + denoise + CLAHE. Input/output BGR uint8."""

    if img is None or img.size == 0:
        raise ValueError("clean_image: immagine vuota.")

    if img.ndim == 2:
        gray = img
    elif img.ndim == 3 and img.shape[2] >= 3:
        gray = cv2.cvtColor(img[:, :, :3], cv2.COLOR_BGR2GRAY)
    else:
        raise ValueError(f"clean_image: shape immagine non supportata {img.shape}")

    denoised = cv2.fastNlMeansDenoising(gray, h=10)

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(denoised)

    # Threshold inverso: testo → bianco, sfondo → nero, utile per stimare skew.
    _, binary_inv = cv2.threshold(
        enhanced, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
    )

    angle = _estimate_skew_angle(binary_inv)
    if abs(angle) > _DESKEW_THRESHOLD_DEG:
        h, w = enhanced.shape[:2]
        center = (w // 2, h // 2)
        matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
        enhanced = cv2.warpAffine(
            enhanced,
            matrix,
            (w, h),
            flags=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_REPLICATE,
        )
        logger.debug("clean_image: deskew applicato", extra={"angle_deg": angle})

    return cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)
