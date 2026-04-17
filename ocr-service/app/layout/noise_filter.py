"""Filtri euristici di rumore: header, footer, numeri di pagina, whitespace."""

from __future__ import annotations

import re
from collections import Counter

_PAGE_NUMBER_RE = re.compile(r"^\s*(pag(?:ina)?\.?\s*)?(\d+)\s*(/\s*\d+)?\s*$", re.IGNORECASE)


def _is_page_number(line: str) -> bool:
    """True se la riga e' verosimilmente un numero di pagina isolato."""

    stripped = line.strip()
    if not stripped or len(stripped) > 16:
        return False
    return bool(_PAGE_NUMBER_RE.match(stripped))


def filter_noise(lines: list[str]) -> list[str]:
    """Rimuove header/footer ripetuti, numeri pagina e normalizza whitespace."""

    if not lines:
        return []

    stripped_lines = [ln.strip() for ln in lines]
    non_empty = [ln for ln in stripped_lines if ln]

    # Conta ripetizioni di righe "brevi" per identificare header/footer ricorrenti.
    short_counter: Counter[str] = Counter(ln for ln in non_empty if len(ln) < 30)
    repeated_short = {ln for ln, count in short_counter.items() if count > 2}

    filtered: list[str] = []
    for ln in stripped_lines:
        if not ln:
            filtered.append(ln)
            continue
        if ln in repeated_short:
            continue
        if _is_page_number(ln):
            continue
        filtered.append(ln)

    return filtered
