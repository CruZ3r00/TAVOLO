"""Pre-scarica i modelli PaddleOCR per evitare il download al primo /process.

Uso:
    python scripts/warmup.py

Legge ``OCR_LANG`` e ``PADDLE_USE_GPU`` da environment (default ``it`` / ``false``).
Istanziare ``PaddleOCR`` scarica automaticamente i modelli nella cache
``~/.paddleocr`` la prima volta.
"""

from __future__ import annotations

import os
import sys


def main() -> int:
    lang = os.environ.get("OCR_LANG", "it").strip() or "it"
    use_gpu = os.environ.get("PADDLE_USE_GPU", "false").strip().lower() in {"1", "true", "yes"}

    print(f"[warmup] lingua={lang} gpu={use_gpu}")
    print("[warmup] import PaddleOCR in corso... (puo' richiedere alcuni secondi)")

    try:
        from paddleocr import PaddleOCR
    except Exception as exc:
        print(f"[warmup] import fallito: {exc}", file=sys.stderr)
        return 2

    try:
        PaddleOCR(lang=lang, use_angle_cls=True, use_gpu=use_gpu, show_log=False)
    except Exception as exc:
        print(f"[warmup] inizializzazione fallita: {exc}", file=sys.stderr)
        return 3

    print("[warmup] modelli PaddleOCR pronti.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
