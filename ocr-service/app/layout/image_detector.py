"""Detection regioni-immagine nel layout del menu.

Heuristica:
1. maschera le bbox OCR (espanse di 10px) → "zone-testo"
2. nega la maschera → "zone candidate immagine"
3. Canny edge detection sull'originale
4. per ogni componente connessa della maschera candidata, misura la densita'
   di edge (edge_pixels / area). Se >0.05 e area > 2% dell'immagine → immagine.
"""

from __future__ import annotations

import logging

import cv2
import numpy as np

from app.ocr.paddle_runner import OcrToken

logger = logging.getLogger(__name__)

_TEXT_BBOX_DILATATION_PX = 10
_EDGE_DENSITY_THRESHOLD = 0.05
_MIN_AREA_FRACTION = 0.02


def _mask_text_regions(shape: tuple[int, int], tokens: list[OcrToken]) -> np.ndarray:
    """Crea una maschera uint8 (255 = testo, 0 = non testo), bbox espanse."""

    mask = np.zeros(shape, dtype=np.uint8)
    for tok in tokens:
        xs = [p[0] for p in tok.bbox]
        ys = [p[1] for p in tok.bbox]
        x0 = max(int(min(xs)) - _TEXT_BBOX_DILATATION_PX, 0)
        y0 = max(int(min(ys)) - _TEXT_BBOX_DILATATION_PX, 0)
        x1 = min(int(max(xs)) + _TEXT_BBOX_DILATATION_PX, shape[1] - 1)
        y1 = min(int(max(ys)) + _TEXT_BBOX_DILATATION_PX, shape[0] - 1)
        if x1 > x0 and y1 > y0:
            mask[y0:y1, x0:x1] = 255
    return mask


def detect_dish_images(img: np.ndarray, tokens: list[OcrToken]) -> list[dict]:
    """Identifica regioni che sembrano immagini di piatti.

    Ritorna una lista di dict con chiavi ``top_right`` e ``bottom_left``,
    ciascuna ``(x, y)`` in coordinate pixel dell'immagine di input.
    """

    if img is None or img.size == 0 or img.ndim < 2:
        return []

    h, w = img.shape[:2]
    total_area = float(h * w)
    if total_area <= 0:
        return []

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img

    text_mask = _mask_text_regions((h, w), tokens)
    candidate_mask = cv2.bitwise_not(text_mask)

    edges = cv2.Canny(gray, 80, 200)
    edges_in_candidate = cv2.bitwise_and(edges, edges, mask=candidate_mask)

    # Connected components sul candidate_mask per isolare regioni.
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(
        candidate_mask, connectivity=8
    )

    regions: list[dict] = []
    min_area = total_area * _MIN_AREA_FRACTION

    for label_id in range(1, num_labels):
        x, y, width, height, area = stats[label_id]
        if area < min_area:
            continue

        component_mask = (labels == label_id).astype(np.uint8) * 255
        edge_pixels = int(cv2.countNonZero(cv2.bitwise_and(edges_in_candidate, component_mask)))
        density = edge_pixels / float(area) if area > 0 else 0.0
        if density < _EDGE_DENSITY_THRESHOLD:
            continue

        x1 = int(x + width - 1)
        y0 = int(y)
        x0 = int(x)
        y1 = int(y + height - 1)

        regions.append(
            {
                "top_right": (x1, y0),
                "bottom_left": (x0, y1),
            }
        )
        logger.debug(
            "image region rilevata",
            extra={
                "x": x0,
                "y": y0,
                "w": int(width),
                "h": int(height),
                "edge_density": round(density, 4),
            },
        )

    return regions


def format_image_markers(regions: list[dict]) -> str:
    """Converte una lista di regioni in marker testuali da iniettare nell'OCR text."""

    if not regions:
        return ""

    parts: list[str] = []
    for region in regions:
        tr = region.get("top_right")
        bl = region.get("bottom_left")
        if not tr or not bl:
            continue
        tr_x, tr_y = int(tr[0]), int(tr[1])
        bl_x, bl_y = int(bl[0]), int(bl[1])
        parts.append(
            f"[IMMAGINEPIATTO coords=top_right:({tr_x},{tr_y}) bottom_left:({bl_x},{bl_y})]"
        )
    return "\n".join(parts)
