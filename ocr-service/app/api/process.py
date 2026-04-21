"""Endpoint principale ``POST /process``: orchestrazione della pipeline OCR â†’ LLM."""

from __future__ import annotations

import asyncio
import logging
import os
import re
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
from app.models.extraction import ExtractedElement, ExtractionResult
from app.models.requests import ProcessRequest
from app.ocr.menu_parser import (
    build_menu_items,
    group_ocr_lines,
    is_price_line,
)
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


def _normalize_ocr_text(text: str) -> str:
    """Piccola pulizia sul testo OCR senza alterarne troppo il contenuto."""
    lines = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            lines.append("")
            continue

        line = re.sub(r"\s+", " ", line)
        line = line.replace(" ,", ",").replace(" .", ".")
        line = line.replace("€ ", "€")
        lines.append(line)

    return "\n".join(lines).strip()


def _normalize_name(name: str) -> str:
    text = re.sub(r"\s+", " ", name).strip(" .:-")
    text = re.sub(r"(?i)\befunghi\b", " e funghi", text)
    text = re.sub(r"(?i)efunghi\b", " e funghi", text)
    text = re.sub(r"(?i)^(\d)([A-Za-z])", r"\1 \2", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"(?i)^4\s*stagioni$", "4 Stagioni", text)
    if text.isupper() and len(text) > 3:
        return text.title()
    return text


def _to_rule_extraction(items: list[dict[str, Any]]) -> ExtractionResult:
    elements: list[ExtractedElement] = []
    for item in items:
        name = _normalize_name(str(item.get("name", "")))
        if not name:
            continue
        price = item.get("price")
        parsed_price = float(price) if isinstance(price, (int, float)) else None
        ingredients = item.get("ingredients")
        if not isinstance(ingredients, list):
            ingredients = []
        elements.append(
            ExtractedElement(
                name=name,
                price=parsed_price,
                category="Altro",
                ingredients=[str(x) for x in ingredients],
                allergens=[],
                image_coords=None,
            )
        )
    return ExtractionResult(elements=elements)


def _render_preparsed_items(items: list[dict[str, Any]]) -> str:
    if not items:
        return ""
    lines = ["=== VOCI_PREPARSE (NOME/PREZZO AFFIDABILI) ==="]
    for idx, item in enumerate(items, start=1):
        price_val = item.get("price")
        price = "null" if not isinstance(price_val, (int, float)) else f"{float(price_val):.2f}"
        details = item.get("ingredients", [])
        details_str = ", ".join(str(x) for x in details if str(x).strip())
        row = f"{idx}. name={item.get('name', '')} | price={price}"
        if details_str:
            row = f"{row} | details={details_str}"
        lines.append(row)
    return "\n".join(lines)


def _missing_ingredients_ratio(extraction: ExtractionResult) -> float:
    if not extraction.elements:
        return 1.0
    missing = sum(1 for el in extraction.elements if not el.ingredients)
    return missing / len(extraction.elements)


def _build_fast_enrichment_prompt(
    base: ExtractionResult,
    ocr_text: str,
) -> str:
    items_lines: list[str] = []
    for idx, el in enumerate(base.elements, start=1):
        price = "null" if el.price is None else f"{el.price:.2f}"
        items_lines.append(f"{idx}. name={el.name} | price={price}")

    compact_ocr = (ocr_text or "").strip()
    if len(compact_ocr) > 4000:
        compact_ocr = compact_ocr[:4000]

    return (
        "Sei un assistente di arricchimento menu.\n"
        "NON aggiungere o rimuovere voci. NON cambiare name e price.\n"
        "Compila SOLO category, ingredients, allergens dalle evidenze OCR.\n"
        "Se non sicuro lascia [] o 'Altro'.\n"
        "Rispondi SOLO con JSON valido nello schema:\n"
        '{"elements":[{"name":"string","price":number|null,"category":"string","ingredients":["string"],"allergens":["string"],"image_coords":null}]}\n\n'
        "VOCI DA ARRICCHIRE:\n"
        + "\n".join(items_lines)
        + "\n\nOCR (estratto):\n"
        + compact_ocr
    )


def _extract_rule_items_from_cleaned_lines(cleaned_lines: list[str]) -> list[dict[str, Any]]:
    """Secondo pass deterministico su testo OCR ricostruito (non su token bbox)."""

    candidate_lines: list[str] = []
    for raw in cleaned_lines:
        line = (raw or "").strip()
        if not line:
            continue
        if line.startswith("=====") or line.startswith("==="):
            continue
        if line.startswith("[IMMAGINEPIATTO"):
            continue
        candidate_lines.append(line)

    items = build_menu_items(candidate_lines)
    logger.debug(
        "rule parser from cleaned lines",
        extra={"lines_count": len(candidate_lines), "items_count": len(items)},
    )
    return items


def _merge_llm_details(
    base: ExtractionResult,
    llm: ExtractionResult | None,
) -> ExtractionResult:
    """Usa LLM solo per arricchimento leggero, senza toccare name/price.

    Matching robusto per ``name+price`` (non dipende dall'ordine o dalla cardinalita').
    """

    if llm is None:
        return base

    def _name_key(value: str) -> str:
        return re.sub(r"[^a-z0-9]", "", (value or "").lower())

    def _price_key(value: float | None) -> int | None:
        if value is None:
            return None
        return int(round(float(value) * 100))

    def _normalize_ingredients(items: list[str]) -> list[str]:
        typo_map = {
            "cipola": "cipolla",
            "mozarea": "mozzarella",
            "moarella": "mozzarella",
            "aociughe": "acciughe",
            "prezemolo": "prezzemolo",
        }
        cleaned: list[str] = []
        seen: set[str] = set()
        for raw in items:
            txt = (raw or "").strip().lower()
            if not txt:
                continue
            txt = re.sub(r"\s+", " ", txt)
            txt = typo_map.get(txt, txt)
            txt = txt.strip(" .,:;|-")
            # scarta frammenti chiaramente rumorosi
            if len(txt) <= 2:
                continue
            if txt.count(".") >= 1 and " " not in txt:
                continue
            if re.fullmatch(r"[a-z]{1,2}\d*", txt):
                continue
            if txt not in seen:
                seen.add(txt)
                cleaned.append(txt)
        return cleaned

    def _looks_plausible_dish(name: str) -> bool:
        n = (name or "").strip()
        if not n:
            return False
        words = re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ0-9]+", n)
        return len(words) >= 1 and len(n) >= 4

    by_name_price: dict[tuple[str, int | None], ExtractedElement] = {}
    by_name: dict[str, ExtractedElement] = {}
    for el in llm.elements:
        key_name = _name_key(el.name)
        key_price = _price_key(el.price)
        by_name_price[(key_name, key_price)] = el
        by_name[key_name] = el

    def _ingredients_low_quality(items: list[str]) -> bool:
        if not items:
            return True
        if len(items) <= 1:
            return True
        noisy = 0
        for it in items:
            text = (it or "").strip()
            if not text:
                noisy += 1
                continue
            if "." in text or len(text) > 28:
                noisy += 1
        return noisy >= max(1, len(items) // 2)

    merged: list[ExtractedElement] = []
    matched_keys: set[tuple[str, int | None]] = set()
    for base_el in base.elements:
        key_name = _name_key(base_el.name)
        key_price = _price_key(base_el.price)
        llm_el = by_name_price.get((key_name, key_price)) or by_name.get(key_name)
        if llm_el is not None:
            matched_keys.add((_name_key(llm_el.name), _price_key(llm_el.price)))

        merged_ingredients = _normalize_ingredients(base_el.ingredients)
        merged_allergens = base_el.allergens
        merged_category = base_el.category or "Altro"
        merged_image = base_el.image_coords
        if llm_el is not None:
            merged_category = (llm_el.category or "Altro").strip() or "Altro"
            llm_norm_ingredients = _normalize_ingredients(llm_el.ingredients)
            if _ingredients_low_quality(merged_ingredients) and llm_norm_ingredients:
                merged_ingredients = llm_norm_ingredients
            merged_allergens = llm_el.allergens or merged_allergens
            merged_image = llm_el.image_coords or merged_image

        merged.append(
            ExtractedElement(
                name=base_el.name,
                price=base_el.price,
                category=merged_category,
                ingredients=merged_ingredients,
                allergens=merged_allergens,
                image_coords=merged_image,
            )
        )

    # Recupera possibili voci mancanti dal LLM solo se chiaramente plausibili
    # e se il nome compare inglobato come ingrediente in una voce esistente.
    merged_name_price = {
        (_name_key(el.name), _price_key(el.price))
        for el in merged
    }
    for llm_el in llm.elements:
        llm_key = (_name_key(llm_el.name), _price_key(llm_el.price))
        if llm_key in matched_keys or llm_key in merged_name_price:
            continue
        if not _looks_plausible_dish(llm_el.name):
            continue

        llm_name_key = _name_key(llm_el.name)
        host_idx = None
        for idx, el in enumerate(merged):
            for ing in el.ingredients:
                if llm_name_key and _name_key(ing).startswith(llm_name_key):
                    host_idx = idx
                    break
            if host_idx is not None:
                break

        if host_idx is None:
            continue

        # rimuovi contaminazione dal host e aggiungi la voce mancante
        host = merged[host_idx]
        filtered_host_ingredients = [
            ing for ing in host.ingredients if not _name_key(ing).startswith(llm_name_key)
        ]
        host_llm = by_name.get(_name_key(host.name))
        host_llm_ingredients = _normalize_ingredients(host_llm.ingredients) if host_llm else []
        if _ingredients_low_quality(filtered_host_ingredients) and host_llm_ingredients:
            filtered_host_ingredients = host_llm_ingredients
        merged[host_idx] = ExtractedElement(
            name=host.name,
            price=host.price,
            category=host.category,
            ingredients=filtered_host_ingredients,
            allergens=host.allergens,
            image_coords=host.image_coords,
        )

        merged.append(
            ExtractedElement(
                name=_normalize_name(llm_el.name),
                price=llm_el.price,
                category=(llm_el.category or "Altro").strip() or "Altro",
                ingredients=_normalize_ingredients(llm_el.ingredients),
                allergens=llm_el.allergens or [],
                image_coords=llm_el.image_coords,
            )
        )
    return ExtractionResult(elements=merged)


def _split_page_into_columns(page: np.ndarray, expected_columns: int = 3) -> list[np.ndarray]:
    """
    Divide la pagina in colonne verticali usando un approccio semplice ma robusto.
    Se la segmentazione fallisce, torna l'immagine intera.
    """
    if page is None or page.size == 0:
        return [page]

    h, w = page.shape[:2]
    if w < 300:
        return [page]

    gray = cv2.cvtColor(page, cv2.COLOR_BGR2GRAY)

    # Binarizzazione "testo scuro su sfondo chiaro".
    _, thresh = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)

    # DensitÃ  verticale di inchiostro.
    ink_per_col = np.sum(thresh > 0, axis=0).astype(np.float32)

    # Smussamento per evitare micro-buchi.
    kernel_size = max(15, w // 80)
    kernel = np.ones(kernel_size, dtype=np.float32) / kernel_size
    smooth = np.convolve(ink_per_col, kernel, mode="same")

    # Colonne "vuote" = possibili separatori.
    low_threshold = max(2.0, float(np.percentile(smooth, 20)) * 0.55)
    blank_mask = smooth <= low_threshold

    separators: list[tuple[int, int]] = []
    start = None
    for i, is_blank in enumerate(blank_mask):
        if is_blank and start is None:
            start = i
        elif not is_blank and start is not None:
            if i - start >= max(10, w // 80):
                separators.append((start, i))
            start = None
    if start is not None and (w - start) >= max(10, w // 80):
        separators.append((start, w))

    # Centro dei separatori lontani dai bordi.
    sep_centers = []
    margin = int(w * 0.08)
    for s, e in separators:
        center = (s + e) // 2
        if margin < center < (w - margin):
            sep_centers.append(center)

    if not sep_centers:
        # Fallback: split uniforme
        step = w // expected_columns
        crops = []
        for i in range(expected_columns):
            x1 = i * step
            x2 = w if i == expected_columns - 1 else (i + 1) * step
            crop = page[:, x1:x2]
            if crop.size > 0:
                crops.append(crop)
        return crops if crops else [page]

    # Se ci sono troppi separatori, prendiamo quelli piÃ¹ plausibili per 3 colonne.
    # Cerchiamo fino a expected_columns-1 separatori.
    sep_centers = sorted(sep_centers)

    if len(sep_centers) > expected_columns - 1:
        target_positions = [
            int(w * (i + 1) / expected_columns) for i in range(expected_columns - 1)
        ]
        picked: list[int] = []
        for target in target_positions:
            best = min(sep_centers, key=lambda x: abs(x - target))
            if best not in picked:
                picked.append(best)
        sep_centers = sorted(picked)

    bounds = [0] + sep_centers + [w]
    crops: list[np.ndarray] = []

    for i in range(len(bounds) - 1):
        x1 = max(0, bounds[i])
        x2 = min(w, bounds[i + 1])

        # Piccolo margine interno per evitare di prendere il separatore.
        if i > 0:
            x1 += 4
        if i < len(bounds) - 2:
            x2 -= 4

        if x2 - x1 < 40:
            continue

        crop = page[:, x1:x2]
        if crop.size > 0:
            crops.append(crop)

    return crops if crops else [page]


def _extract_structured_text_from_page(
    page: np.ndarray,
    page_idx: int,
    warnings: list[str],
) -> tuple[list[OcrToken], str, list[str], list[dict[str, Any]]]:
    """
    Esegue OCR pagina per pagina ma separando per colonne.
    Restituisce:
    - tutti i token OCR della pagina
    - testo ricostruito, segmentato per colonne
    - eventuali marker immagine
    """
    all_page_tokens: list[OcrToken] = []
    column_texts: list[str] = []
    image_markers: list[str] = []
    parsed_items: list[dict[str, Any]] = []

    columns = _split_page_into_columns(page, expected_columns=3)

    for col_idx, crop in enumerate(columns):
        cleaned = crop
        try:
            cleaned = clean_image(crop)
        except Exception as exc:
            warnings.append(
                f"pagina {page_idx + 1}, colonna {col_idx + 1}: preprocessing fallito ({exc})"
            )
            logger.warning(
                "preprocessing fallito",
                extra={"page": page_idx, "column": col_idx, "err": str(exc)},
            )
            cleaned = crop

        candidates: list[tuple[str, np.ndarray]] = [("cleaned", cleaned)]
        if cleaned is not crop:
            candidates.append(("raw", crop))

        best_tokens: list[OcrToken] = []
        best_lines: list[str] = []
        best_items: list[dict[str, Any]] = []
        best_source = "cleaned"
        best_score = (-1, -1, -1)

        for source_name, source_img in candidates:
            tokens = run_ocr(source_img)
            if not tokens:
                continue
            lines = group_ocr_lines(tokens, y_threshold=10)
            items = build_menu_items(lines)
            price_lines = sum(1 for ln in lines if is_price_line(ln))
            # score: più item, poi più linee con prezzo, poi più linee totali
            score = (len(items), price_lines, len(lines))
            if score > best_score:
                best_tokens = tokens
                best_lines = lines
                best_items = items
                best_source = source_name
                best_score = score

        if not best_tokens:
            continue

        all_page_tokens.extend(best_tokens)
        parsed_items.extend(best_items)
        logger.debug(
            "ocr column parsed",
            extra={
                "page": page_idx + 1,
                "column": col_idx + 1,
                "ocr_source": best_source,
                "ocr_lines": best_lines,
                "menu_items_count": len(best_items),
            },
        )

        reconstructed = reconstruct_blocks(best_tokens)
        reconstructed = _normalize_ocr_text(reconstructed)

        if reconstructed:
            column_texts.append(f"=== COLONNA {col_idx + 1} ===\n{reconstructed}")

        best_img_for_regions = cleaned if best_source == "cleaned" else crop
        regions = detect_dish_images(best_img_for_regions, best_tokens)
        markers = format_image_markers(regions)
        if markers:
            image_markers.append(markers)

    return all_page_tokens, "\n\n".join(column_texts).strip(), image_markers, parsed_items


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

    # 5. OCR + image detection per pagina, segmentando per colonne.
    ocr_start = time.perf_counter()
    all_tokens: list[OcrToken] = []
    page_texts: list[str] = []
    image_markers: list[str] = []
    parsed_items: list[dict[str, Any]] = []

    for page_idx, page in enumerate(pages):
        page_tokens, page_text, page_markers, page_items = _extract_structured_text_from_page(
            page=page,
            page_idx=page_idx,
            warnings=warnings,
        )

        if not page_tokens:
            warnings.append(f"pagina {page_idx + 1}: nessun testo riconosciuto")
            continue

        all_tokens.extend(page_tokens)

        page_confidence = _avg_confidence(page_tokens)
        if page_confidence < 0.6:
            warnings.append(
                f"pagina {page_idx + 1}: bassa qualita' OCR (confidence {page_confidence})"
            )

        if page_text:
            page_texts.append(f"===== PAGINA {page_idx + 1} =====\n{page_text}")

        if page_markers:
            image_markers.extend(page_markers)
        if page_items:
            parsed_items.extend(page_items)

    ocr_ms = int((time.perf_counter() - ocr_start) * 1000)

    # 6. Noise filter + merge pagine, preservando la struttura per pagina/colonna.
    merged_lines: list[str] = []
    for idx, page_text in enumerate(page_texts):
        if idx > 0:
            merged_lines.append("")
        merged_lines.extend(page_text.split("\n"))

    cleaned_lines = filter_noise(merged_lines)
    final_text = "\n".join(cleaned_lines).strip()

    if image_markers:
        final_text = final_text + "\n\n" + "\n".join(image_markers)

    if not final_text and not parsed_items:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Nessun testo OCR utile estratto dal documento.",
        )

    if not parsed_items:
        parsed_items = _extract_rule_items_from_cleaned_lines(cleaned_lines)
        if parsed_items:
            warnings.append(
                "Parser bbox senza item: usato fallback deterministico su testo OCR ricostruito."
            )

    base_extraction = _to_rule_extraction(parsed_items)
    extraction: ExtractionResult | None = None
    raw_response: str | None = None

    # 7. LLM come supporto: fallback completo se parser vuoto, arricchimento se parser presente.
    ollama_start = time.perf_counter()
    if base_extraction.elements:
        extraction = base_extraction
        prep_text = _render_preparsed_items(parsed_items)
        llm_input = final_text
        if prep_text:
            llm_input = f"{final_text}\n\n{prep_text}".strip()
        try:
            enrich_timeout = max(1, int(settings.LLM_ENRICH_TIMEOUT_SECONDS))
            missing_ratio = _missing_ingredients_ratio(base_extraction)
            if missing_ratio >= 0.30:
                prompt = _build_fast_enrichment_prompt(base_extraction, llm_input)
            else:
                prompt = build_prompt(llm_input, payload.restaurant_context, reinforced=False)
            raw_response = await asyncio.wait_for(
                _run_llm(prompt, settings.OLLAMA_MODEL, reinforced=False),
                timeout=float(enrich_timeout),
            )
            extraction = _merge_llm_details(base_extraction, _parse_extraction(raw_response))
            warnings.append("LLM usato solo per arricchimento leggero su output rules-based.")
        except asyncio.TimeoutError:
            extraction = base_extraction
            warnings.append(
                f"LLM arricchimento timeout ({settings.LLM_ENRICH_TIMEOUT_SECONDS}s): "
                "tentativo rapido ingredienti."
            )
            try:
                fast_prompt = _build_fast_enrichment_prompt(base_extraction, llm_input)
                fast_timeout = min(20.0, float(enrich_timeout))
                raw_response = await asyncio.wait_for(
                    _run_llm(fast_prompt, settings.OLLAMA_MODEL, reinforced=False),
                    timeout=fast_timeout,
                )
                extraction = _merge_llm_details(base_extraction, _parse_extraction(raw_response))
                warnings.append("LLM rapido usato per completare ingredienti mancanti.")
            except Exception:
                warnings.append("LLM rapido non riuscito: usato output deterministico.")
        except HTTPException as exc:
            warnings.append(f"LLM non disponibile per arricchimento: {exc.detail}")
            extraction = base_extraction
    else:
        logger.warning("Nessun item deterministico estratto: blocco fallback segmentazione LLM")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Nessun item menu deterministico estratto dall'OCR. "
                "Segmentazione LLM disabilitata per evitare fusioni errate."
            ),
        )

    ollama_ms = int((time.perf_counter() - ollama_start) * 1000)

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
