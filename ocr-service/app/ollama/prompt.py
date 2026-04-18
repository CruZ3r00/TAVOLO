"""Template del prompt Ollama per l'estrazione strutturata del menu."""

from __future__ import annotations

from app.models.requests import RestaurantContext

EXTRACTION_PROMPT: str = """Sei un assistente che riceve il testo OCR estratto da un menu di ristorante (italiano).
Il testo e' grezzo, puo' contenere errori OCR e marker speciali.

MARKER SPECIALI:
- "[IMMAGINEPIATTO coords=top_right:(X,Y) bottom_left:(X,Y)]" indica la posizione di una foto del piatto.
  Associa l'immagine al piatto descritto vicino.

ISTRUZIONI:
1. Identifica OGNI piatto/bevanda presente nel testo. Estrai TUTTI gli elementi, non fermarti al primo.
   Un menu tipico contiene 10-50 voci: se ne estrai solo 1-2 hai sbagliato.
2. Per ciascuno restituisci: name, price, category, ingredients, allergens, image_coords (se disponibile).
3. Categorie suggerite: Antipasti, Primi, Secondi, Pizze classiche, Pizze bianche, Pizze rosse,
   Primi di pesce, Secondi di pesce, Contorni, Dessert, Bevande. Usa il titolo della sezione del menu se diverso.
4. price: numero in euro (es. 7.50). null se non presente. Non inventare.
5. ingredients: array di stringhe con gli ingredienti elencati esplicitamente. [] se non presenti.
6. allergens: array con allergeni (glutine, lattosio, uova, frutta a guscio, pesce, crostacei, soia, sesamo,
   solfiti, sedano, senape, arachidi, molluschi, lupino). Deducili dagli ingredienti se ovvi, altrimenti [].
7. Rispondi SOLO con JSON valido conforme allo schema indicato. Nessun testo aggiuntivo.

ESEMPIO (input → output atteso):

Input OCR:
---
ANTIPASTI
Bruschetta al pomodoro 5.00
pomodoro, aglio, basilico, pane

Tartare di manzo 14.50
manzo crudo, capperi, senape

PRIMI
Spaghetti alle vongole 13.00
spaghetti, vongole, aglio, prezzemolo

Risotto ai funghi porcini 12.50
riso, funghi porcini, burro, parmigiano

SECONDI
Tagliata di manzo 18.00
manzo, rucola, scaglie di grana

DOLCI
Tiramisu 6.00
---

Output atteso:
{
  "elements": [
    {"name": "Bruschetta al pomodoro", "price": 5.00, "category": "Antipasti", "ingredients": ["pomodoro","aglio","basilico","pane"], "allergens": ["glutine"], "image_coords": null},
    {"name": "Tartare di manzo", "price": 14.50, "category": "Antipasti", "ingredients": ["manzo crudo","capperi","senape"], "allergens": ["senape"], "image_coords": null},
    {"name": "Spaghetti alle vongole", "price": 13.00, "category": "Primi", "ingredients": ["spaghetti","vongole","aglio","prezzemolo"], "allergens": ["glutine","molluschi"], "image_coords": null},
    {"name": "Risotto ai funghi porcini", "price": 12.50, "category": "Primi", "ingredients": ["riso","funghi porcini","burro","parmigiano"], "allergens": ["lattosio"], "image_coords": null},
    {"name": "Tagliata di manzo", "price": 18.00, "category": "Secondi", "ingredients": ["manzo","rucola","scaglie di grana"], "allergens": ["lattosio"], "image_coords": null},
    {"name": "Tiramisu", "price": 6.00, "category": "Dolci", "ingredients": [], "allergens": [], "image_coords": null}
  ]
}

Nota dall'esempio: 6 elementi nel testo → 6 elementi nel JSON. Mai meno.

---

CONTESTO RISTORANTE: __RESTAURANT_NAME__ (__CUISINE_HINT__)

TESTO OCR DA ANALIZZARE:
---
__OCR_TEXT__
---

SCHEMA OUTPUT:
{
  "elements": [
    {
      "name": "string",
      "price": number | null,
      "category": "string",
      "ingredients": ["string"],
      "allergens": ["string"],
      "image_coords": { "top_right": [x, y], "bottom_left": [x, y] } | null
    }
  ]
}

Rispondi ora con il JSON contenente TUTTI gli elementi del TESTO OCR DA ANALIZZARE sopra (non dell'esempio).
"""

_REINFORCEMENT_SUFFIX: str = (
    "\n\nATTENZIONE: RISPONDI SOLO CON JSON VALIDO conforme allo schema. "
    "Nessun testo extra, nessun commento, nessun blocco markdown. "
    "Solo l'oggetto JSON che inizia con { e finisce con }. "
    "Estrai TUTTI i piatti del testo OCR, non solo il primo."
)


def build_prompt(
    ocr_text: str,
    restaurant_context: RestaurantContext,
    reinforced: bool = False,
) -> str:
    """Renderizza ``EXTRACTION_PROMPT`` con il contesto fornito.

    Usa ``str.replace`` (non ``.format``) per evitare l'escaping delle graffe
    dell'esempio JSON nel template.

    Se ``reinforced`` aggiunge in coda un richiamo esplicito al formato JSON,
    usato nel retry dopo un parse fallito.
    """

    restaurant_name = (restaurant_context.restaurant_name or "").strip() or "sconosciuto"
    cuisine_hint = (restaurant_context.cuisine_hint or "").strip() or "italiana"

    prompt = (
        EXTRACTION_PROMPT.replace("__RESTAURANT_NAME__", restaurant_name)
        .replace("__CUISINE_HINT__", cuisine_hint)
        .replace("__OCR_TEXT__", ocr_text)
    )

    if reinforced:
        prompt = prompt + _REINFORCEMENT_SUFFIX

    return prompt
