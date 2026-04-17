"""Endpoint principale ``POST /process``: orchestrazione della pipeline OCR → LLM."""

from __future__ import annotations

import logging
import os
import time
from typing import Any

import cv2
import numpy as np
from fastapi import APIRouter, Header, HTTPException, status
from pydantic import ValidationError

from app.config import get_settings
from app.layout.image_detector import detect_dish_images, format_image_markers
from app.layout.noise_filter import filter_noise
from app.layout.reconstruct import reconstruct_blocks
from app.models.extraction import ExtractionResult
from app.models.requests import ProcessRequest
from app.ocr.paddle_runner import OcrToken, run_ocr
from app.ollama.client import (
    OllamaError,
    OllamaTimeoutError,
    OllamaUnavailableError,
    generate,
)
from app.ollama.prompt import build_prompt
from app.preprocessing.cleanup import clean_image
from app.preprocessing.pdf_to_image import pdf_to_images
from app.utils.path_security import validate_input_path

logger = logging.getLogger(__name__)

router = APIRouter()

_SUPPORTED_EXT: frozenset[str] = frozenset({".pdf", ".png", ".jpg", ".jpeg", ".webp"})


def _verify_internal_token(header_token: str | None) -> None:
    settings = get_settings()
    expected = (settings.INTERNAL_API_TOKEN or "").strip()
    if not expected:
        return
    received = (header_token or "").strip()
    if received != expected:
        logger.warning("rifiutato: X-Internal-Token invalido")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="X-Internal-Token mancante o invalido.",
        )


def _load_pages(file_path: str, ext: str, dpi: int) -> list[np.ndarray]:
    """Carica il file in una lista di np.ndarray BGR."""

    if ext == ".pdf":
        pages = pdf_to_images(file_path, dpi=dpi)
        if not pages:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="PDF senza pagine leggibili.",
            )
        return pages

    img = cv2.imread(file_path, cv2.IMREAD_COLOR)
    if img is None or img.size == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Impossibile decodificare l'immagine.",
        )
    return [img]


def _avg_confidence(tokens: list[OcrToken]) -> float:
    if not tokens:
        return 0.0
    total = sum(t.confidence for t in tokens)
    return round(total / len(tokens), 4)


def _parse_extraction(raw: str) -> ExtractionResult | None:
    """Tenta di parsare e validare la risposta LLM come ``ExtractionResult``."""

    if not raw or not raw.strip():
        return None
    try:
        return ExtractionResult.model_validate_json(raw)
    except ValidationError:
        logger.warning("LLM response: validazione pydantic fallita")
        return None
    except ValueError:
        logger.warning("LLM response: JSON parse fallito")
        return None


async def _run_llm(prompt: str, model: str, reinforced: bool) -> str:
    """Wrapper sull'LLM che traduce le eccezioni in ``HTTPException``."""

    try:
        return await generate(prompt=prompt, model=model, reinforced=reinforced)
    except OllamaUnavailableError as exc:
        logger.error("Ollama unavailable", extra={"err": str(exc)})
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "LLM_UNAVAILABLE", "message": str(exc)},
        ) from exc
    except OllamaTimeoutError as exc:
        logger.error("Ollama timeout", extra={"err": str(exc)})
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail={"code": "LLM_TIMEOUT", "message": str(exc)},
        ) from exc
    except OllamaError as exc:
        logger.error("Ollama error", extra={"err": str(exc)})
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "LLM_UNAVAILABLE", "message": str(exc)},
        ) from exc


@router.post("/process")
async def process_file(
    payload: ProcessRequest,
    x_internal_token: str | None = Header(default=None, alias="X-Internal-Token"),
) -> dict[str, Any]:
    """Esegue la pipeline completa su un file e restituisce gli elementi strutturati."""

    _verify_internal_token(x_internal_token)

    settings = get_settings()

    # 1. Validazione path (whitelist).
    try:
        real_path = validate_input_path(payload.file_path, settings.ALLOWED_INPUT_DIR)
    except PermissionError as exc:
        logger.warning("path traversal rifiutato", extra={"file_path": payload.file_path})
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc

    # 2. Esistenza file.
    if not os.path.isfile(real_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File non trovato: {payload.file_path}",
        )

    # 3. Estensione supportata.
    ext = os.path.splitext(real_path)[1].lower()
    if ext not in _SUPPORTED_EXT:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Estensione non supportata: {ext}",
        )

    warnings: list[str] = []
    total_start = time.perf_counter()

    # 4. Carica pagine.
    try:
        pages = _load_pages(real_path, ext, settings.PDF_RENDER_DPI)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("errore caricamento pagine")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"File non leggibile: {exc}",
        ) from exc

    # 5. OCR + image detection su ogni pagina.
    ocr_start = time.perf_counter()
    all_tokens: list[OcrToken] = []
    page_texts: list[str] = []
    image_markers: list[str] = []

    for page_idx, page in enumerate(pages):
        try:
            cleaned = clean_image(page)
        except Exception as exc:
            warnings.append(f"pagina {page_idx + 1}: preprocessing fallito ({exc})")
            logger.warning(
                "preprocessing fallito",
                extra={"page": page_idx, "err": str(exc)},
            )
            cleaned = page

        tokens = run_ocr(cleaned)
        if not tokens:
            warnings.append(f"pagina {page_idx + 1}: nessun testo riconosciuto")
            continue

        all_tokens.extend(tokens)

        page_confidence = _avg_confidence(tokens)
        if page_confidence < 0.6:
            warnings.append(
                f"pagina {page_idx + 1}: bassa qualita' OCR (confidence {page_confidence})"
            )

        reconstructed = reconstruct_blocks(tokens)
        if reconstructed:
            page_texts.append(reconstructed)

        regions = detect_dish_images(cleaned, tokens)
        markers = format_image_markers(regions)
        if markers:
            image_markers.append(markers)

    ocr_ms = int((time.perf_counter() - ocr_start) * 1000)

    # 6. Noise filter + merge pagine.
    merged_lines: list[str] = []
    for idx, page_text in enumerate(page_texts):
        if idx > 0:
            merged_lines.append("")
        merged_lines.extend(page_text.split("\n"))
    cleaned_lines = filter_noise(merged_lines)
    final_text = "\n".join(cleaned_lines).strip()

    if image_markers:
        final_text = final_text + "\n\n" + "\n".join(image_markers)

    if not final_text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Nessun testo OCR utile estratto dal documento.",
        )

    # 7. Prompt + Ollama (con 1 retry rinforzato in caso di JSON invalido).
    ollama_start = time.perf_counter()
    prompt = build_prompt(final_text, payload.restaurant_context, reinforced=False)
    raw_response = await _run_llm(prompt, settings.OLLAMA_MODEL, reinforced=False)
    extraction = _parse_extraction(raw_response)

    if extraction is None:
        logger.info("Ollama: primo output invalido, retry rinforzato")
        warnings.append("LLM: output iniziale non valido, retry eseguito.")
        reinforced_prompt = build_prompt(
            final_text, payload.restaurant_context, reinforced=True
        )
        raw_response = await _run_llm(
            reinforced_prompt, settings.OLLAMA_MODEL, reinforced=True
        )
        extraction = _parse_extraction(raw_response)

    ollama_ms = int((time.perf_counter() - ollama_start) * 1000)

    if extraction is None:
        logger.error("Ollama: JSON invalido anche dopo retry")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Impossibile interpretare il documento (LLM output non conforme).",
        )

    total_ms = int((time.perf_counter() - total_start) * 1000)
    confidence = _avg_confidence(all_tokens)

    elements_payload = [el.model_dump() for el in extraction.elements]

    logger.info(
        "process completato",
        extra={
            "elements": len(elements_payload),
            "ocr_ms": ocr_ms,
            "ollama_ms": ollama_ms,
            "total_ms": total_ms,
            "confidence": confidence,
            "pages": len(pages),
        },
    )

    return {
        "elements": elements_payload,
        "ocr_confidence": confidence,
        "warnings": warnings,
        "raw_ollama_response": raw_response if payload.options.include_raw else None,
        "metrics": {
            "pdf_pages": len(pages) if ext == ".pdf" else 1,
            "ocr_ms": ocr_ms,
            "ollama_ms": ollama_ms,
            "total_ms": total_ms,
        },
    }
