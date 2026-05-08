# OCR Service (`ocr-service/`)

Python 3.10+ FastAPI, loopback only on `127.0.0.1:8001`. PDF/image → JSON pipeline (PyMuPDF + OpenCV + PaddleOCR + local Ollama LLM). Called only by Strapi.

> Workflow / core principles vivono nel `CLAUDE.md` root del monorepo.

## Modules
- `app/api/` — `GET /health`, `POST /process`.
- `app/preprocessing/` — PDF→images, deskew/binarize.
- `app/layout/` — region detect + reconstruction.
- `app/ocr/` — PaddleOCR singleton + spatial parser.
- `app/ollama/` — LLM client + prompts.
- `app/utils/` — logging, path security.
- `tests/` — `test_menu_parser.py`, `test_pdf_text_extraction.py`.

## Workflow
multipart in (≤20 MB) → MIME+magic check → PDF→300dpi images (PyMuPDF) → deskew/denoise/CLAHE/binarize → PaddleOCR boxes → layout grouping → Ollama JSON + `_missing` flags → `{ elements, count, ocr_confidence, warnings, source_file }`.

## HTTP errors
- 200 — OK
- 400 — bad request
- 422 — schema validation
- 503 — LLM or OCR down
- 504 — timeout (def 60s)

## Env (`.env.example`)
- `ALLOWED_INPUT_DIR` — = Strapi `MENU_UPLOAD_DIR`.
- `OLLAMA_URL` — def `http://127.0.0.1:11434`.
- `OLLAMA_MODEL` — def `llama2-uncensored`.
- `PROCESSING_TIMEOUT_SECONDS` — 60.
- `LOG_LEVEL` — INFO.

## Startup
```bash
cd ocr-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python scripts/warmup.py   # optional, pre-downloads PaddleOCR weights
uvicorn app.main:app --host 127.0.0.1 --port 8001
```
Requires Ollama: `ollama serve` + `ollama pull <model>`.

## Cleanable artifacts
- `app/api/vecchio.py.txt` (old backup)
- `ocr-test.{err,out}.log`

## Tech debt
- **OCR warmup:** `scripts/warmup.py` is multi-GB; document as optional, skip in dev unless first-run is critical.
