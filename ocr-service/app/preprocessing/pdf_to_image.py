"""Rasterizzazione PDF → numpy arrays BGR via PyMuPDF."""

from __future__ import annotations

import logging

import fitz  # type: ignore[import-untyped]
import numpy as np

logger = logging.getLogger(__name__)


def pdf_to_images(pdf_path: str, dpi: int = 300) -> list[np.ndarray]:
    """Apre ``pdf_path`` e ritorna una lista di immagini BGR uint8, una per pagina.

    Usa PyMuPDF con una trasformazione ``dpi/72`` (72 dpi e' il default PDF).
    Chiude sempre il documento anche in caso di errore.
    """

    if dpi <= 0:
        raise ValueError(f"dpi deve essere positivo, ricevuto {dpi}")

    zoom = dpi / 72.0
    matrix = fitz.Matrix(zoom, zoom)
    images: list[np.ndarray] = []

    doc = fitz.open(pdf_path)
    try:
        for page_idx, page in enumerate(doc):
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            # pix.samples: bytes RGB (n=3) o RGBA (n=4) se alpha=True.
            channels = pix.n
            buffer = np.frombuffer(pix.samples, dtype=np.uint8)
            img_rgb = buffer.reshape(pix.height, pix.width, channels)

            if channels == 4:
                img_rgb = img_rgb[:, :, :3]
            elif channels == 1:
                # grayscale → replica su 3 canali per coerenza BGR.
                img_rgb = np.stack([img_rgb[:, :, 0]] * 3, axis=-1)

            # Converti RGB → BGR per coerenza con OpenCV.
            img_bgr = img_rgb[:, :, ::-1].copy()
            images.append(img_bgr)
            logger.debug(
                "pdf_to_images: pagina rasterizzata",
                extra={"page": page_idx, "width": pix.width, "height": pix.height},
            )
    finally:
        doc.close()

    return images
