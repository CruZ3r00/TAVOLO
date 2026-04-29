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
_MAX_DESKEW_DEG = 12.0


def estimate_noise_score(img: np.ndarray) -> float:
    """Ritorna uno score 0..1 circa: alto = immagine piu' rumorosa/scura."""

    if img is None or img.size == 0:
        return 1.0
    if img.ndim == 3:
        gray = cv2.cvtColor(img[:, :, :3], cv2.COLOR_BGR2GRAY)
    else:
        gray = img

    contrast = float(np.std(gray)) / 128.0
    darkness = 1.0 - (float(np.mean(gray)) / 255.0)
    edges = cv2.Laplacian(gray, cv2.CV_64F).var()
    blur = 1.0 if edges < 80 else 0.0
    score = (darkness * 0.35) + (max(0.0, 1.0 - contrast) * 0.35) + (blur * 0.30)
    return float(max(0.0, min(1.0, score)))


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


def _crop_document_if_obvious(gray: np.ndarray) -> np.ndarray:
    """Crop conservativo del documento quando il contorno e' chiaro."""

    h, w = gray.shape[:2]
    if h < 120 or w < 120:
        return gray

    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return gray

    largest = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(largest)
    page_area = float(h * w)
    if area < page_area * 0.35:
        return gray

    x, y, cw, ch = cv2.boundingRect(largest)
    if cw < w * 0.45 or ch < h * 0.45:
        return gray

    pad = max(6, int(min(w, h) * 0.01))
    x1 = max(0, x - pad)
    y1 = max(0, y - pad)
    x2 = min(w, x + cw + pad)
    y2 = min(h, y + ch + pad)
    cropped = gray[y1:y2, x1:x2]
    return cropped if cropped.size else gray


def clean_image(
    img: np.ndarray,
    *,
    adaptive_threshold: bool = False,
    document_crop: bool = False,
    noisy_image_threshold: float = 0.42,
) -> np.ndarray:
    """Applica deskew + denoise + CLAHE. Input/output BGR uint8."""

    if img is None or img.size == 0:
        raise ValueError("clean_image: immagine vuota.")

    if img.ndim == 2:
        gray = img
    elif img.ndim == 3 and img.shape[2] >= 3:
        gray = cv2.cvtColor(img[:, :, :3], cv2.COLOR_BGR2GRAY)
    else:
        raise ValueError(f"clean_image: shape immagine non supportata {img.shape}")

    if document_crop:
        gray = _crop_document_if_obvious(gray)

    noise_score = estimate_noise_score(gray)
    denoise_h = 10 if noise_score >= noisy_image_threshold else 4
    denoised = cv2.fastNlMeansDenoising(gray, h=denoise_h)

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(denoised)

    # Threshold inverso: testo → bianco, sfondo → nero, utile per stimare skew.
    _, binary_inv = cv2.threshold(
        enhanced, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
    )

    angle = _estimate_skew_angle(binary_inv)
    if _DESKEW_THRESHOLD_DEG < abs(angle) <= _MAX_DESKEW_DEG:
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

    if adaptive_threshold and noise_score >= noisy_image_threshold:
        enhanced = cv2.adaptiveThreshold(
            enhanced,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            31,
            9,
        )

    # Sharpen leggero, abbastanza blando da non rovinare PDF gia' puliti.
    blurred = cv2.GaussianBlur(enhanced, (0, 0), 1.0)
    enhanced = cv2.addWeighted(enhanced, 1.35, blurred, -0.35, 0)

    return cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)
