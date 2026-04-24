"""Pipeline deterministica per parsing menu da OCR rumoroso."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any

from app.ocr.paddle_runner import OcrToken

logger = logging.getLogger(__name__)

_WORD_RE = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿ']+")
_PRICE_FIND_RE = re.compile(r"(?:€\s*)?(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:€)?")
_PRICE_SANITY_MIN = 0.5
_PRICE_SANITY_MAX = 150.0

_INGREDIENT_TERMS = {
    "pomodoro",
    "mozzarella",
    "cipolla",
    "aglio",
    "basilico",
    "olio",
    "origano",
    "peperoncino",
    "prosciutto",
    "funghi",
    "tonno",
    "olive",
    "acciughe",
    "salsiccia",
    "wurstel",
    "gorgonzola",
    "parmigiano",
    "grana",
    "rucola",
    "speck",
    "patate",
    "zucchine",
    "melanzane",
    "carciofi",
    "capperi",
    "uovo",
    "uova",
}

_CONNECTORS = {"e", "con", "di", "da", "del", "della", "dei", "ai", "al", "alla"}
_NON_DISH_INGREDIENT_NAMES = {
    "pomodoro",
    "mozzarella",
    "cipolla",
    "aglio",
    "basilico",
    "olio",
    "origano",
    "peperoncino",
}

_INGREDIENT_PATTERN_MAP: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"pomo|pomod"), "pomodoro"),
    (re.compile(r"mozz|moza|mozar|mzar"), "mozzarella"),
    (re.compile(r"pros|prosc"), "prosciutto"),
    (re.compile(r"sals|salic"), "salsiccia"),
    (re.compile(r"cipol|cpol|cipo"), "cipolla"),
    (re.compile(r"acciu|accug|aoci"), "acciughe"),
    (re.compile(r"capper"), "capperi"),
    (re.compile(r"wurst|wrstel|wurstel"), "wurstel"),
    (re.compile(r"caci"), "cacio"),
    (re.compile(r"piccant"), "piccante"),
    (re.compile(r"fungh"), "funghi"),
    (re.compile(r"agli"), "aglio"),
    (re.compile(r"prezz|preze|prezem"), "prezzemolo"),
]


@dataclass
class ParsedMenuItem:
    """Compat layer interno per integrazione con pipeline esistente."""

    name: str
    price: float | None
    description_lines: list[str] = field(default_factory=list)


@dataclass
class _PriceMatch:
    value: float | None
    raw_value: str
    start: int
    end: int
    has_currency: bool


def _bbox_center_y(token: OcrToken) -> float:
    ys = [p[1] for p in token.bbox]
    return sum(ys) / len(ys)


def _bbox_center_x(token: OcrToken) -> float:
    xs = [p[0] for p in token.bbox]
    return sum(xs) / len(xs)


def _coerce_tokens_from_ocr_output(ocr_output: Any) -> list[OcrToken]:
    """Accetta OcrToken gia' pronti o output raw PaddleOCR."""

    if not ocr_output:
        return []

    if isinstance(ocr_output, list) and ocr_output and isinstance(ocr_output[0], OcrToken):
        return ocr_output

    # Raw PaddleOCR atteso: [[ [bbox, (text, conf)], ... ]]
    page = ocr_output
    if isinstance(ocr_output, list) and len(ocr_output) == 1 and isinstance(ocr_output[0], list):
        page = ocr_output[0]

    tokens: list[OcrToken] = []
    if not isinstance(page, list):
        return tokens

    for item in page:
        try:
            bbox_raw, text_conf = item[0], item[1]
            text = str(text_conf[0]).strip() if isinstance(text_conf, (list, tuple)) else str(text_conf).strip()
            if not text:
                continue
            bbox = [(float(p[0]), float(p[1])) for p in bbox_raw]
            if len(bbox) != 4:
                continue
            conf = float(text_conf[1]) if isinstance(text_conf, (list, tuple)) and len(text_conf) > 1 else 0.0
            tokens.append(OcrToken(text=text, bbox=bbox, confidence=conf))
        except Exception:
            continue
    return tokens


def group_ocr_lines(ocr_output: Any, y_threshold: float = 10) -> list[str]:
    """Grouping OCR -> righe.

    - usa bounding box
    - raggruppa parole con Y simile
    - ordina per X
    - restituisce righe testuali pulite
    """

    tokens = _coerce_tokens_from_ocr_output(ocr_output)
    if not tokens:
        return []

    sorted_tokens = sorted(tokens, key=_bbox_center_y)
    rows: list[list[OcrToken]] = []
    current_row: list[OcrToken] = []
    current_y: float | None = None

    for tok in sorted_tokens:
        y = _bbox_center_y(tok)
        if current_y is None or abs(y - current_y) <= y_threshold:
            current_row.append(tok)
            current_y = sum(_bbox_center_y(t) for t in current_row) / len(current_row)
            continue
        rows.append(current_row)
        current_row = [tok]
        current_y = y

    if current_row:
        rows.append(current_row)

    lines: list[str] = []
    for row in rows:
        ordered = sorted(row, key=_bbox_center_x)
        line = " ".join(t.text.strip() for t in ordered if t.text and t.text.strip())
        line = re.sub(r"\s+", " ", line).strip()
        line = line.replace("â‚¬", "€")
        if line:
            lines.append(line)

    logger.debug("menu_parser.group_ocr_lines", extra={"lines": lines})
    return lines


def _to_price(raw: str, has_currency: bool) -> float | None:
    normalized = raw.replace(",", ".")
    # Senza simbolo valuta, valori a 3+ cifre intere sono spesso rumore OCR (es. 0993).
    if not has_currency and "." not in normalized and len(normalized) >= 3:
        return None
    try:
        value = float(normalized)
    except ValueError:
        return None
    upper_bound = _PRICE_SANITY_MAX if has_currency else 40.0
    if value < _PRICE_SANITY_MIN or value > upper_bound:
        return None
    return round(value, 2)


def _find_prices(text: str) -> list[_PriceMatch]:
    found: list[_PriceMatch] = []
    normalized = text.replace("â‚¬", "€")
    for match in _PRICE_FIND_RE.finditer(normalized):
        if match.start() > 0 and normalized[match.start() - 1].isdigit():
            continue
        if match.end() < len(normalized) and normalized[match.end()].isdigit():
            continue
        raw_value = match.group(1)
        span_text = normalized[match.start() : match.end()]
        has_currency = "€" in span_text
        found.append(
            _PriceMatch(
                value=_to_price(raw_value, has_currency=has_currency),
                raw_value=raw_value,
                start=match.start(),
                end=match.end(),
                has_currency=has_currency,
            )
        )
    return found


def extract_price(text: str) -> float | None:
    """Riconosce € 4,50 / 4,50 € / 4.50 / 5 / €5.00."""

    stripped = text.strip()
    if re.fullmatch(r"\d{3,}", stripped):
        return None

    prices = [p.value for p in _find_prices(text) if p.value is not None]
    if not prices:
        return None
    return prices[-1]


def is_price_line(text: str) -> bool:
    return extract_price(text) is not None


def looks_like_ingredients(text: str) -> bool:
    raw = text.strip().lower()
    if not raw:
        return False

    clean = raw.strip("()[] ")
    if clean.startswith("ingredienti"):
        return True

    words = [w for w in _WORD_RE.findall(clean) if w not in _CONNECTORS]
    if not words:
        return False

    # Pattern tipico ingredienti: parentesi/comma e molte parole food.
    food_hits = sum(1 for w in words if w in _INGREDIENT_TERMS)
    if "," in raw and food_hits >= max(1, len(words) // 2):
        return True
    if raw.startswith("(") and raw.endswith(")") and food_hits >= 1:
        return True
    if len(words) == 1 and words[0] in _INGREDIENT_TERMS:
        return True
    return food_hits >= 2 and food_hits == len(words)


def looks_like_name(text: str) -> bool:
    clean = re.sub(r"\s+", " ", text).strip(" .,:;|-")
    if not clean:
        return False
    if looks_like_ingredients(clean):
        return False
    if is_price_line(clean):
        return False
    words = _WORD_RE.findall(clean)
    if not words:
        return False
    if len(words) > 8:
        return False
    digit_count = sum(1 for c in clean if c.isdigit())
    alpha_count = sum(1 for c in clean if c.isalpha())
    if alpha_count == 0:
        return False
    return digit_count <= alpha_count


def _clean_name(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", text).strip(" .,:;|-")
    if "(" in cleaned:
        cleaned = cleaned.split("(", maxsplit=1)[0].strip(" .,:;|-")

    words = cleaned.split()
    if not words:
        return ""

    def _is_upperish(word: str) -> bool:
        letters = [c for c in word if c.isalpha()]
        return bool(letters) and word.upper() == word

    if _is_upperish(words[0]):
        prefix: list[str] = []
        for w in words:
            if _is_upperish(w):
                prefix.append(w)
            else:
                break
        if prefix and len(prefix) < len(words):
            cleaned = " ".join(prefix)

    return cleaned


def _split_line_on_multiple_prices(line: str) -> list[str]:
    """FIX CRITICO: splitta riga con multipli prezzi in candidati separati."""

    prices = [p for p in _find_prices(line) if p.value is not None]
    if len(prices) <= 1:
        return [line]

    segments: list[str] = []
    prev_end = 0
    for match in prices:
        name_part = line[prev_end:match.start].strip()
        segment = f"{name_part} {match.raw_value}".strip()
        if segment:
            segments.append(segment)
        prev_end = match.end

    tail = line[prev_end:].strip()
    if tail and segments:
        # Coda non prezzo: probabile descrizione dell'ultimo item.
        segments[-1] = f"{segments[-1]} ||TAIL|| {tail}"

    logger.debug(
        "menu_parser.split_multi_price_line",
        extra={"line": line, "segments": segments},
    )
    return segments if segments else [line]


def _extract_name_and_price(line: str) -> tuple[str, float | None]:
    prices = [p for p in _find_prices(line) if p.value is not None]
    if not prices:
        return _clean_name(line), None

    # Dopo split multi-prezzo normalmente c'e' un solo prezzo.
    target = prices[0]
    before = line[: target.start].strip()
    after = line[target.end :].strip()
    # Regola primaria: nome prima del prezzo.
    name = _clean_name(before)
    # Fallback robusto: alcuni OCR mettono prima il prezzo e poi il nome.
    if not name:
        candidate_after = _clean_name(after)
        if looks_like_name(candidate_after):
            name = candidate_after
    return name, target.value


def _extract_inline_ingredient_hints(line: str) -> list[str]:
    """Estrae ingredienti inline dalla stessa riga (tipico: '(pomodoro, mozzarella)')."""

    hints: list[str] = []
    for content in re.findall(r"\(([^)]+)\)", line):
        text = re.sub(r"\s+", " ", content).strip(" .,:;|-")
        if text:
            hints.append(text)
    # OCR rumoroso: parentesi aperta ma non chiusa.
    if "(" in line and ")" not in line:
        trailing = line.split("(", maxsplit=1)[1]
        trailing = _PRICE_FIND_RE.sub(" ", trailing)
        trailing = re.sub(r"\s+", " ", trailing).strip(" .,:;|-")
        if trailing:
            hints.append(trailing)
    return hints


def _extract_inline_ingredient_hints_from_price_line(line: str, name: str) -> list[str]:
    """Fallback: ingredienti inline prima del prezzo anche senza parentesi corrette."""

    working = line
    prices = [p for p in _find_prices(working) if p.value is not None]
    if prices:
        # Considera solo la porzione prima del primo prezzo.
        working = working[: prices[0].start]

    name_clean = (name or "").strip()
    if name_clean and working.lower().startswith(name_clean.lower()):
        working = working[len(name_clean) :]

    working = re.sub(r"[()]", " ", working)
    working = re.sub(r"\s+", " ", working).strip(" .,:;|-")
    if not working:
        return []
    return [working]


def _is_price_only_line(line: str) -> bool:
    """Riga con prezzo ma senza nome plausibile (es. '€ 6,50')."""

    if not is_price_line(line):
        return False
    name, _ = _extract_name_and_price(line)
    return not _valid_name(name)


def _name_has_multiple_prices(name: str) -> bool:
    return len([p for p in _find_prices(name) if p.value is not None]) > 1


def _name_is_numeric_noise(name: str) -> bool:
    stripped = name.strip()
    if not stripped:
        return True
    alnum = sum(1 for ch in stripped if ch.isalnum())
    alpha = sum(1 for ch in stripped if ch.isalpha())
    return alnum == 0 or alpha == 0


def _valid_name(name: str) -> bool:
    if _name_has_multiple_prices(name):
        return False
    if _name_is_numeric_noise(name):
        return False
    # Nomi troppo corti (es. "C" da OCR del simbolo euro) sono rumore.
    alpha_count = sum(1 for c in name if c.isalpha())
    if alpha_count < 2:
        return False
    # Se il "nome" contiene tanti gruppi numerici e' quasi certamente junk OCR.
    numeric_groups = re.findall(r"\d+(?:[.,]\d+)?", name)
    if len(numeric_groups) >= 2:
        return False
    if looks_like_ingredients(name):
        words = [w.lower() for w in _WORD_RE.findall(name) if w.lower() not in _CONNECTORS]
        if not words:
            return False
        if len(words) >= 2:
            return False
        if words[0] in _NON_DISH_INGREDIENT_NAMES:
            return False
    return True


def _infer_ingredients_from_lines(lines: list[str]) -> list[str]:
    ingredients: list[str] = []
    seen: set[str] = set()

    def _expand_ingredient_token(token: str) -> list[str]:
        expanded: list[str] = []
        for pattern, normalized in _INGREDIENT_PATTERN_MAP:
            if pattern.search(token):
                expanded.append(normalized)
        if expanded:
            # dedupe mantenendo ordine
            uniq: list[str] = []
            local_seen: set[str] = set()
            for x in expanded:
                if x not in local_seen:
                    local_seen.add(x)
                    uniq.append(x)
            return uniq
        return [token]

    for line in lines:
        lowered = line.lower().replace("â‚¬", "€")
        lowered = re.sub(r"[()]", " ", lowered)
        if "," not in lowered and " o " in lowered:
            lowered = lowered.replace(" o ", ", ")
        parts = re.split(r"[,;/.]", lowered)
        for part in parts:
            token = re.sub(r"\s+", " ", part).strip(" .:-")
            if (
                not token
                or any(ch.isdigit() for ch in token)
                or token in _CONNECTORS
                or len(token) < 3
            ):
                continue
            if token.startswith("ingredienti"):
                token = token.replace("ingredienti", "").strip(" :-")
                if not token:
                    continue
            for expanded in _expand_ingredient_token(token):
                if expanded not in seen:
                    seen.add(expanded)
                    ingredients.append(expanded)
    return ingredients


def build_menu_items(lines: list[str]) -> list[dict[str, Any]]:
    """Segmentazione blocchi menu:
    - riga con prezzo => nuovo item
    - righe successive senza prezzo => ingredienti del corrente
    """

    normalized_lines = [re.sub(r"\s+", " ", ln).strip() for ln in lines if ln and ln.strip()]
    logger.debug("menu_parser.input_lines", extra={"lines": normalized_lines})

    items: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    pending_name_line: str | None = None

    for raw_line in normalized_lines:
        for line in _split_line_on_multiple_prices(raw_line):
            tail_split = line.split("||TAIL||", maxsplit=1)
            main_line = tail_split[0].strip()
            tail_line = tail_split[1].strip() if len(tail_split) > 1 else ""

            if not is_price_line(main_line) and looks_like_name(main_line):
                pending_name_line = main_line

            if is_price_line(main_line):
                if _is_price_only_line(main_line) and pending_name_line:
                    recovered_price = extract_price(main_line)
                    if recovered_price is not None and _valid_name(pending_name_line):
                        if current is not None:
                            current["ingredients"] = _infer_ingredients_from_lines(
                                current["_desc_lines"]
                            )
                            items.append(current)
                        current = {
                            "name": _clean_name(pending_name_line),
                            "price": recovered_price,
                            "ingredients": [],
                            "_desc_lines": [],
                        }
                        pending_name_line = None
                        if tail_line:
                            current["_desc_lines"].append(tail_line)
                    continue

                name, price = _extract_name_and_price(main_line)
                name = _clean_name(name)
                candidate = {
                    "name": name,
                    "price": price,
                    "ingredients": [],
                    "_desc_lines": [],
                }

                if _valid_name(name):
                    if current is not None:
                        current["ingredients"] = _infer_ingredients_from_lines(current["_desc_lines"])
                        items.append(current)
                    current = candidate
                    pending_name_line = None
                    inline_hints = _extract_inline_ingredient_hints(main_line)
                    inline_hints.extend(
                        _extract_inline_ingredient_hints_from_price_line(main_line, name)
                    )
                    if inline_hints:
                        current["_desc_lines"].extend(inline_hints)
                    if tail_line:
                        current["_desc_lines"].append(tail_line)
                else:
                    logger.debug(
                        "menu_parser.discard_invalid_name",
                        extra={"line": main_line, "name": name},
                    )
                continue

            if current is not None:
                current["_desc_lines"].append(main_line)

    if current is not None:
        current["ingredients"] = _infer_ingredients_from_lines(current["_desc_lines"])
        items.append(current)

    # Validazione forte finale.
    valid: list[dict[str, Any]] = []
    for item in items:
        name = str(item.get("name", "")).strip()
        if not _valid_name(name):
            continue
        valid.append(
            {
                "name": name,
                "price": item.get("price"),
                "ingredients": list(item.get("ingredients", [])),
            }
        )

    logger.debug("menu_parser.final_items", extra={"items": valid})
    return valid


# ---- Compat wrappers usati dal resto del servizio ----
def group_tokens_into_lines(tokens: list[OcrToken]) -> list[str]:
    return group_ocr_lines(tokens, y_threshold=10)


def parse_menu_items_from_lines(lines: list[str]) -> list[ParsedMenuItem]:
    items = build_menu_items(lines)
    return [
        ParsedMenuItem(
            name=str(item["name"]),
            price=item["price"] if isinstance(item.get("price"), (int, float)) else None,
            description_lines=[],
        )
        for item in items
    ]


def infer_ingredients(description_lines: list[str]) -> list[str]:
    return _infer_ingredients_from_lines(description_lines)
