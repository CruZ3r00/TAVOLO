"""Modelli pydantic della richiesta ``POST /process``."""

from __future__ import annotations

from pydantic import BaseModel, Field


class RestaurantContext(BaseModel):
    """Contesto del ristorante usato per arricchire il prompt LLM."""

    restaurant_name: str = ""
    cuisine_hint: str = "italiana"


class ProcessOptions(BaseModel):
    """Opzioni runtime della pipeline."""

    ocr_lang: str = "it"
    include_raw: bool = False


class ProcessRequest(BaseModel):
    """Payload di input di ``POST /process``."""

    file_path: str = Field(..., min_length=1)
    restaurant_context: RestaurantContext = Field(default_factory=RestaurantContext)
    options: ProcessOptions = Field(default_factory=ProcessOptions)
