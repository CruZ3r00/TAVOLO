"""Client async verso Ollama (``POST /api/generate``)."""

from __future__ import annotations

import logging

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


class OllamaError(Exception):
    """Base per errori dal client Ollama."""


class OllamaUnavailableError(OllamaError):
    """Ollama irraggiungibile (connection refused, DNS, ecc.)."""


class OllamaTimeoutError(OllamaError):
    """Ollama ha superato il timeout configurato."""


async def generate(prompt: str, model: str, reinforced: bool = False) -> str:
    """Chiama Ollama ``POST /api/generate`` con ``format=json``.

    Ritorna la stringa ``response`` grezza. Retry automatico 1x su 5xx/timeout.
    Solleva ``OllamaUnavailableError`` o ``OllamaTimeoutError`` in caso di fallimento
    definitivo.
    """

    settings = get_settings()
    url = settings.OLLAMA_URL.rstrip("/") + "/api/generate"
    timeout_s = float(settings.OLLAMA_TIMEOUT_SECONDS)

    payload = {
        "model": model,
        "prompt": prompt,
        "format": "json",
        "stream": False,
        "options": {
            "temperature": 0.1,
            "num_ctx": 8192,
            "num_predict": 8192,
        },
    }

    last_exc: Exception | None = None
    async with httpx.AsyncClient(timeout=timeout_s) as client:
        for attempt in (1, 2):
            try:
                resp = await client.post(url, json=payload)
                if resp.status_code >= 500:
                    last_exc = OllamaError(
                        f"Ollama HTTP {resp.status_code}: {resp.text[:200]}"
                    )
                    logger.warning(
                        "Ollama 5xx, retry se disponibile",
                        extra={"attempt": attempt, "status": resp.status_code},
                    )
                    if attempt == 1:
                        continue
                    raise last_exc
                resp.raise_for_status()
                body = resp.json()
                response_text = body.get("response")
                if not isinstance(response_text, str):
                    raise OllamaError("Ollama: campo 'response' mancante o non stringa.")
                logger.debug(
                    "Ollama OK",
                    extra={
                        "model": model,
                        "reinforced": reinforced,
                        "resp_chars": len(response_text),
                    },
                )
                return response_text

            except httpx.ConnectError as exc:
                last_exc = exc
                logger.warning(
                    "Ollama ConnectError",
                    extra={"attempt": attempt, "err": str(exc)},
                )
                if attempt == 1:
                    continue
                raise OllamaUnavailableError(f"Ollama non raggiungibile: {exc}") from exc

            except httpx.TimeoutException as exc:
                last_exc = exc
                logger.warning(
                    "Ollama timeout",
                    extra={"attempt": attempt, "timeout_s": timeout_s},
                )
                if attempt == 1:
                    continue
                raise OllamaTimeoutError(
                    f"Ollama timeout dopo {timeout_s}s"
                ) from exc

            except httpx.HTTPStatusError as exc:
                # errori 4xx non sono retry-abili
                raise OllamaError(
                    f"Ollama HTTP {exc.response.status_code}: {exc.response.text[:200]}"
                ) from exc

    # Non dovrebbe essere raggiunto, ma manteniamo una fallback esplicita.
    if last_exc:
        raise OllamaError(f"Ollama fallito: {last_exc}")
    raise OllamaError("Ollama: errore sconosciuto.")
