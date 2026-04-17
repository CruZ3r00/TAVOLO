"""Template del prompt Ollama per l'estrazione strutturata del menu."""

from __future__ import annotations

from app.models.requests import RestaurantContext

EXTRACTION_PROMPT: str = """Sei un assistente che riceve il testo OCR estratto da un menu di ristorante (italiano).
Il testo e' grezzo, puo' contenere errori OCR e marker speciali.

MARKER SPECIALI:
- "[IMMAGINEPIATTO coords=top_right:(X,Y) bottom_left:(X,Y)]" indica la posizione di una foto del piatto.
  Associa l'immagine al piatto descritto vicino.

ISTRUZIONI:
1. Identifica ogni piatto/bevanda presente.
2. Per ciascuno restituisci: name, price, category, ingredients, allergens, image_coords (se disponibile).
3. Categorie suggerite: Antipasti, Primi, Secondi, Pizze classiche, Pizze bianche, Pizze rosse,
   Primi di pesce, Secondi di pesce, Contorni, Dessert, Bevande. Usa il titolo della sezione del menu se diverso.
4. price: numero in euro (es. 7.50). null se non presente. Non inventare.
5. ingredients: array di stringhe con gli ingredienti elencati esplicitamente. [] se non presenti.
6. allergens: array con allergeni (glutine, lattosio, uova, frutta a guscio, pesce, crostacei, soia, sesamo,
   solfiti, sedano, senape, arachidi, molluschi, lupino). Deducili dagli ingredienti se ovvi, altrimenti [].
7. Rispondi SOLO con JSON valido conforme allo schema indicato. Nessun testo aggiuntivo.

CONTESTO RISTORANTE: {restaurant_name} ({cuisine_hint})

TESTO OCR:
---
{ocr_text_with_markers}
---

SCHEMA OUTPUT:
{{
  "elements": [
    {{
      "name": "string",
      "price": number | null,
      "category": "string",
      "ingredients": ["string"],
      "allergens": ["string"],
      "image_coords": {{ "top_right": [x, y], "bottom_left": [x, y] }} | null
    }}
  ]
}}
"""

_REINFORCEMENT_SUFFIX: str = (
    "\n\nATTENZIONE: RISPONDI SOLO CON JSON VALIDO conforme allo schema. "
    "Nessun testo extra, nessun commento, nessun blocco markdown. "
    "Solo l'oggetto JSON che inizia con { e finisce con }."
)


def build_prompt(
    ocr_text: str,
    restaurant_context: RestaurantContext,
    reinforced: bool = False,
) -> str:
    """Renderizza ``EXTRACTION_PROMPT`` con il contesto fornito.

    Se ``reinforced`` aggiunge in coda un richiamo esplicito al formato JSON,
    usato nel retry dopo un parse fallito.
    """

    restaurant_name = (restaurant_context.restaurant_name or "").strip() or "sconosciuto"
    cuisine_hint = (restaurant_context.cuisine_hint or "").strip() or "italiana"

    prompt = EXTRACTION_PROMPT.format(
        restaurant_name=restaurant_name,
        cuisine_hint=cuisine_hint,
        ocr_text_with_markers=ocr_text,
    )

    if reinforced:
        prompt = prompt + _REINFORCEMENT_SUFFIX

    return prompt
