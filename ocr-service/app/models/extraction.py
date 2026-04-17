"""Modelli pydantic dell'output strutturato della pipeline."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ImageCoords(BaseModel):
    """Coordinate bounding box di un'immagine del piatto nel layout originale."""

    top_right: tuple[int, int]
    bottom_left: tuple[int, int]


class ExtractedElement(BaseModel):
    """Un singolo piatto estratto dal menu."""

    name: str = Field(min_length=1, max_length=200)
    price: float | None = Field(default=None, ge=0)
    category: str = Field(default="", max_length=100)
    ingredients: list[str] = Field(default_factory=list)
    allergens: list[str] = Field(default_factory=list)
    image_coords: ImageCoords | None = None


class ExtractionResult(BaseModel):
    """Output atteso dall'LLM: lista di elementi strutturati."""

    elements: list[ExtractedElement]
