# ocr-service

Microservizio Python proprietario che converte un file (PDF/immagine) di menu
ristorante in una lista strutturata di piatti. Viene invocato da Strapi
sull'endpoint `POST /api/menus/import/analyze`.

Stack:
- FastAPI + Uvicorn
- PyMuPDF (rasterizzazione PDF)
- OpenCV (preprocessing immagine)
- PaddleOCR (riconoscimento testo)
- Ollama (LLM locale per strutturazione)
- pydantic v2 (validazione contratti)

## Requisiti

- Python 3.10+
- Ollama installato localmente (https://ollama.com) con un modello compatibile
  scaricato, ad es. `ollama pull qwen2.5:7b`.
- Accesso in lettura alla cartella `MENU_UPLOAD_DIR` di Strapi.

## Setup

```bash
cd ocr-service
python -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

cp .env.example .env
# modifica .env con i path reali
```

### Warmup (opzionale ma consigliato)

Al primo avvio PaddleOCR scarica ~150MB di modelli. Esegui:

```bash
python scripts/warmup.py
```

per triggerare il download prima che arrivino richieste reali.

## Avvio

```bash
source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Oppure via env:

```bash
HOST=127.0.0.1 PORT=8001 uvicorn app.main:app --host $HOST --port $PORT
```

### Health checks

- `GET /health` → 200 sempre (liveness).
- `GET /ready` → 200 se Ollama e' raggiungibile, 503 altrimenti (readiness).

## Endpoint principale

`POST /process`

Body:
```json
{
  "file_path": "/abs/path/to/menu-upload/demo/1713200000000_a4f2.pdf",
  "restaurant_context": {
    "restaurant_name": "Ristorante Demo",
    "cuisine_hint": "italiana"
  },
  "options": {
    "ocr_lang": "it",
    "include_raw": false
  }
}
```

Response 200:
```json
{
  "elements": [
    {
      "name": "Margherita",
      "price": 7.5,
      "category": "Pizze classiche",
      "ingredients": ["pomodoro", "mozzarella"],
      "allergens": ["glutine", "lattosio"],
      "image_coords": { "top_right": [820, 120], "bottom_left": [710, 220] }
    }
  ],
  "ocr_confidence": 0.91,
  "warnings": [],
  "raw_ollama_response": null,
  "metrics": {
    "pdf_pages": 1,
    "ocr_ms": 4210,
    "ollama_ms": 8920,
    "total_ms": 14130
  }
}
```

Codici errore:
- 400 payload invalido (pydantic)
- 403 `file_path` fuori da `ALLOWED_INPUT_DIR` o token errato
- 404 file non esistente
- 415 estensione non supportata
- 422 OCR completato ma JSON LLM invalido dopo retry
- 503 Ollama down
- 504 Ollama timeout

## Variabili d'ambiente

Vedi `.env.example`. Le principali:

| Var | Default | Descrizione |
|-----|---------|-------------|
| `HOST` | `127.0.0.1` | bind host |
| `PORT` | `8001` | porta uvicorn |
| `OLLAMA_URL` | `http://localhost:11434` | URL Ollama |
| `OLLAMA_MODEL` | `qwen2.5:7b` | modello LLM |
| `OLLAMA_TIMEOUT_SECONDS` | `120` | timeout LLM |
| `OCR_LANG` | `it` | lingua PaddleOCR |
| `ALLOWED_INPUT_DIR` | `-` | whitelist file input (OBBLIGATORIO) |
| `INTERNAL_API_TOKEN` | (vuoto) | shared secret con Strapi |
| `LOG_LEVEL` | `INFO` | livello logging JSON |
| `PADDLE_USE_GPU` | `false` | abilita GPU |
| `PDF_RENDER_DPI` | `300` | DPI rasterizzazione |

## Troubleshooting

- **`503 LLM_UNAVAILABLE`**: Ollama non raggiungibile. Verifica `ollama serve`
  attivo e `OLLAMA_URL` corretto. Verifica di aver fatto `ollama pull <model>`.
- **`PaddleOCR` scarica modelli ogni avvio**: la cache default e' in
  `~/.paddleocr`. Conserva la home tra run. Usa `scripts/warmup.py` in fase di
  build CI/Docker.
- **Primo `/process` lentissimo**: cold-start del modello Ollama. Dopo la prima
  generazione il modello resta in RAM e le successive sono 5-10x piu' rapide.
- **`403 path not allowed`**: `file_path` non dentro `ALLOWED_INPUT_DIR`.
  Allinea il valore a `MENU_UPLOAD_DIR` di Strapi.
- **Import error di paddle**: su Linux la ruota `paddlepaddle==2.6.1` richiede
  `libgomp1`. Installa con `apt install libgomp1`.

## Struttura

Vedi `/tmp/ocr_pipeline_spec.md` per la spec architetturale. Layout:

```
app/
  main.py              FastAPI entrypoint + lifespan
  config.py            Settings pydantic-settings
  api/
    process.py         POST /process
    health.py          GET /health, /ready
  preprocessing/
    pdf_to_image.py    PyMuPDF
    cleanup.py         OpenCV (deskew/denoise/CLAHE)
  ocr/
    singleton.py       istanza PaddleOCR lazy
    paddle_runner.py   wrapper run_ocr(image)
  layout/
    reconstruct.py     clustering token in righe/blocchi
    noise_filter.py    header/footer/page numbers
    image_detector.py  detection regioni-immagine -> token IMMAGINEPIATTO
  ollama/
    client.py          httpx AsyncClient + retry
    prompt.py          template + build_prompt()
  models/
    requests.py        ProcessRequest / RestaurantContext
    extraction.py      ExtractedElement / ExtractionResult / ImageCoords
  utils/
    path_security.py   validate_input_path
    logging.py         structured JSON logger
```

## Sicurezza

- Il servizio **deve** restare bindato a `127.0.0.1` in MVP.
- `ALLOWED_INPUT_DIR` e' obbligatorio: previene attacchi di path traversal.
- `INTERNAL_API_TOKEN` va impostato in produzione; confrontato con
  `X-Internal-Token` inviato da Strapi.
- I file ricevuti NON vengono modificati e non escono mai dalla sandbox
  definita da `ALLOWED_INPUT_DIR`.
