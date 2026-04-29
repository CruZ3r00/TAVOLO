"""Template del prompt Ollama per l'estrazione strutturata del menu."""

from __future__ import annotations

from app.models.requests import RestaurantContext

EXTRACTION_PROMPT: str = """Sei un sistema di estrazione strutturata per menu di ristorante.

Ricevi testo OCR rumoroso proveniente da un menu (spesso disposto su più colonne).
Il testo può contenere errori OCR, righe spezzate e elementi vicini ma NON correlati.

OBIETTIVO:
Estrarre ogni voce del menu come elemento separato, senza errori di fusione.

REGOLE CRITICHE (OBBLIGATORIE):

1. UNA VOCE = UN ELEMENTO
- Ogni piatto deve essere un elemento separato.
- NON unire mai due nomi consecutivi.
- Esempio SBAGLIATO: "CRUDO MANTOVANA VIENNESE"
- Esempio CORRETTO: 3 elementi separati

2. ASSOCIAZIONE PREZZO
- Il prezzo appartiene SOLO alla voce sulla stessa riga o immediatamente accanto.
- Se non sei sicuro → usa null.
- NON indovinare mai il prezzo.
- Usa solo prezzi presenti nel testo OCR o nella sezione VOCI_PREPARSE.

3. INGREDIENTI
- Usa SOLO ingredienti presenti esplicitamente nel testo.
- NON inventare ingredienti.
- Se non presenti → []
- NON spostare ingredienti o descrizioni nel nome del piatto.

4. ALLERGENI
- Derivali SOLO da ingredienti certi.
- Se non sicuro → []
- NON inventare.

5. CATEGORIA
- Usa categoria solo se chiaramente deducibile (es. titolo sezione).
- Se non chiara → "Altro"

6. STRUTTURA MENU (IMPORTANTISSIMO)
- Il testo può essere su più colonne.
- Rispetta marcatori "PAGINA" e "COLONNA": non mischiare colonne diverse.
- NON collegare righe verticalmente se appartengono a colonne diverse.
- Ogni riga è indipendente.
- NON combinare elementi di colonne diverse.

7. ERRORI OCR
- Correggi errori evidenti (es. "CPOLLA" → "cipolla")
- NON modificare il significato

8. OUTPUT
- SOLO JSON valido
- NESSUN testo extra
- NESSUN markdown
- DEVE iniziare con { e finire con }

9. RICONOSCIMENTO STRUTTURA (FONDAMENTALE)

Ogni voce del menu segue questo pattern:

- Riga 1: NOME + PREZZO (es. "MARGHERITA € 4,00")
- Riga 2 (opzionale): ingredienti tra parentesi

REGOLE:

- Una nuova voce INIZIA SOLO quando trovi un prezzo (€ o numero con virgola)
- Le righe SENZA prezzo appartengono alla voce precedente (ingredienti)
- NON creare voci da righe senza prezzo
- NON usare ingredienti come nomi

ESEMPIO:

Input:
MARGHERITA € 4,00
(pomodoro, mozzarella)

Output:
→ UNA voce

10. VALIDAZIONE NOMI

- Il nome di un piatto NON può essere:
  "pomodoro", "mozzarella", "cipolla", ecc.

Se una riga contiene solo ingredienti → NON è un piatto.
---

11. SEZIONE PRE-PARSATA (SE PRESENTE)

- Se trovi il blocco "VOCI_PREPARSE", considera `name` e `price` come affidabili.
- In quel caso NON cambiare l'associazione nome/prezzo.
- Puoi solo normalizzare typo evidenti (senza cambiare significato)
  e completare category/ingredients/allergens se possibile.

CONTESTO:
Ristorante: __RESTAURANT_NAME__
Tipo cucina: __CUISINE_HINT__

---

TESTO OCR:
---
__OCR_TEXT__
---

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
      "image_coords": null
    }
  ]
}

---

ESEMPIO IMPORTANTE:

Input:
MARGHERITA 4.00
pomodoro mozzarella

MARINARA 4.50
pomodoro aglio

Output:
{
  "elements": [
    {"name": "Margherita", "price": 4.00, "category": "Altro", "ingredients": ["pomodoro","mozzarella"], "allergens": ["lattosio"], "image_coords": null},
    {"name": "Marinara", "price": 4.50, "category": "Altro", "ingredients": ["pomodoro","aglio"], "allergens": [], "image_coords": null}
  ]
}

---

IMPORTANTE:
- Non perdere elementi
- Non unirli
- Se incerto → lascia campi vuoti, NON inventare
- Se una voce è ambigua mantieni solo name/prezzo certi e usa category "Altro",
  ingredients [], allergens [].

Rispondi ora SOLO con JSON valido.
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
