"""Configurazione del microservizio caricata da environment/.env.

Esponi tramite ``get_settings()`` (cached) per evitare riletture del filesystem
ad ogni richiesta.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Variabili d'ambiente del microservizio.

    ``ALLOWED_INPUT_DIR`` e' obbligatoria: nessun default sicuro puo' essere
    dedotto senza conoscere il path di upload di Strapi.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    PORT: int = 8001
    HOST: str = "127.0.0.1"

    OLLAMA_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "qwen2.5:7b"
    OLLAMA_TIMEOUT_SECONDS: int = 120
    LLM_ENRICH_TIMEOUT_SECONDS: int = 45

    OCR_LANG: str = "it"
    PADDLE_USE_GPU: bool = False
    PDF_RENDER_DPI: int = 300

    ALLOWED_INPUT_DIR: str = Field(..., min_length=1)
    INTERNAL_API_TOKEN: str = ""
    REQUIRE_INTERNAL_API_TOKEN: bool = False

    LOG_LEVEL: str = "INFO"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Ritorna l'istanza singleton di ``Settings``."""

    return Settings()  # type: ignore[call-arg]
