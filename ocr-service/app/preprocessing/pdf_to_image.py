"""Rasterizzazione PDF → numpy arrays BGR via PyMuPDF."""

from __future__ import annotations

import logging

import fitz  # type: ignore[import-untyped]
import numpy as np

logger = logging.getLogger(__name__)


def extract_pdf_text_layout(pdf_path: str) -> list[dict]:
    """Estrae testo selezionabile da PDF con coordinate, senza OCR.

    Ritorna una pagina per elemento con ``blocks`` e ``lines`` gia' ordinati
    top-to-bottom / left-to-right. Se il PDF e' scansionato, le linee saranno
    vuote o quasi vuote e il chiamante potra' usare OCR.
    """

    pages: list[dict] = []
    doc = fitz.open(pdf_path)
    try:
        for page_idx, page in enumerate(doc):
            page_dict = page.get_text("dict")
            blocks: list[dict] = []
            lines: list[dict] = []

            for block in page_dict.get("blocks", []):
                if block.get("type") != 0:
                    continue
                block_lines: list[dict] = []
                for line in block.get("lines", []):
                    spans = line.get("spans", [])
                    text = " ".join(
                        str(span.get("text", "")).strip()
                        for span in spans
                        if str(span.get("text", "")).strip()
                    )
                    text = " ".join(text.split())
                    if not text:
                        continue
                    bbox = [float(v) for v in line.get("bbox", [0, 0, 0, 0])]
                    item = {
                        "text": text,
                        "bbox": bbox,
                        "confidence": 1.0,
                    }
                    block_lines.append(item)
                    lines.append(item)
                if block_lines:
                    blocks.append(
                        {
                            "bbox": [float(v) for v in block.get("bbox", [0, 0, 0, 0])],
                            "lines": block_lines,
                        }
                    )

            lines.sort(key=lambda ln: (ln["bbox"][1], ln["bbox"][0]))
            pages.append(
                {
                    "page": page_idx + 1,
                    "width": float(page.rect.width),
                    "height": float(page.rect.height),
                    "blocks": blocks,
                    "lines": lines,
                }
            )
    finally:
        doc.close()

    return pages


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
