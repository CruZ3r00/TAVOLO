"""Ricostruzione layout: token → righe → blocchi → testo."""

from __future__ import annotations

from app.ocr.paddle_runner import OcrToken


def _bbox_center_y(token: OcrToken) -> float:
    ys = [p[1] for p in token.bbox]
    return sum(ys) / len(ys)


def _bbox_center_x(token: OcrToken) -> float:
    xs = [p[0] for p in token.bbox]
    return sum(xs) / len(xs)


def _bbox_height(token: OcrToken) -> float:
    ys = [p[1] for p in token.bbox]
    return max(ys) - min(ys)


def _group_into_lines(tokens: list[OcrToken]) -> list[list[OcrToken]]:
    """Raggruppa token nella stessa riga usando una soglia basata sull'altezza media."""

    if not tokens:
        return []

    sorted_tokens = sorted(tokens, key=_bbox_center_y)
    heights = [_bbox_height(t) for t in sorted_tokens if _bbox_height(t) > 0]
    avg_h = (sum(heights) / len(heights)) if heights else 10.0
    threshold = max(avg_h * 0.6, 4.0)

    lines: list[list[OcrToken]] = []
    current: list[OcrToken] = []
    current_y: float | None = None

    for tok in sorted_tokens:
        y = _bbox_center_y(tok)
        if current_y is None or abs(y - current_y) <= threshold:
            current.append(tok)
            # Aggiorna la y di riferimento alla media corrente (robusto a drift).
            current_y = sum(_bbox_center_y(t) for t in current) / len(current)
        else:
            lines.append(current)
            current = [tok]
            current_y = y

    if current:
        lines.append(current)

    # Ordina i token di ogni riga per x crescente.
    return [sorted(line, key=_bbox_center_x) for line in lines]


def _group_into_blocks(lines: list[list[OcrToken]]) -> list[list[list[OcrToken]]]:
    """Raggruppa righe in blocchi per prossimita' verticale."""

    if not lines:
        return []

    line_heights: list[float] = []
    for line in lines:
        for tok in line:
            h = _bbox_height(tok)
            if h > 0:
                line_heights.append(h)
    avg_h = (sum(line_heights) / len(line_heights)) if line_heights else 10.0
    block_threshold = max(avg_h * 2.0, 12.0)

    blocks: list[list[list[OcrToken]]] = []
    current_block: list[list[OcrToken]] = []
    last_y: float | None = None

    for line in lines:
        y = sum(_bbox_center_y(t) for t in line) / len(line)
        if last_y is None or abs(y - last_y) <= block_threshold:
            current_block.append(line)
        else:
            blocks.append(current_block)
            current_block = [line]
        last_y = y

    if current_block:
        blocks.append(current_block)
    return blocks


def reconstruct_blocks(tokens: list[OcrToken]) -> str:
    """Raggruppa token in righe e blocchi; ritorna testo con separatori coerenti.

    ``\\n`` separa righe nello stesso blocco; ``\\n\\n`` separa blocchi distinti.
    """

    if not tokens:
        return ""

    lines = _group_into_lines(tokens)
    blocks = _group_into_blocks(lines)

    rendered_blocks: list[str] = []
    for block in blocks:
        rendered_lines = [" ".join(t.text for t in line).strip() for line in block]
        rendered_lines = [ln for ln in rendered_lines if ln]
        if rendered_lines:
            rendered_blocks.append("\n".join(rendered_lines))

    return "\n\n".join(rendered_blocks)
