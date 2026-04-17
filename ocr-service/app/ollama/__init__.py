"""Client + prompt builder verso Ollama."""

from app.ollama.client import (
    OllamaError,
    OllamaTimeoutError,
    OllamaUnavailableError,
    generate,
)
from app.ollama.prompt import EXTRACTION_PROMPT, build_prompt

__all__ = [
    "EXTRACTION_PROMPT",
    "OllamaError",
    "OllamaTimeoutError",
    "OllamaUnavailableError",
    "build_prompt",
    "generate",
]
