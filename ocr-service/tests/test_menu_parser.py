from __future__ import annotations

import unittest

from app.ocr.menu_parser import (
    build_menu_items,
    extract_price,
    group_ocr_lines,
    is_price_line,
    looks_like_ingredients,
    looks_like_name,
)
from app.ocr.paddle_runner import OcrToken


def _token(text: str, x: float, y: float, w: float = 20, h: float = 10) -> OcrToken:
    return OcrToken(
        text=text,
        bbox=[(x, y), (x + w, y), (x + w, y + h), (x, y + h)],
        confidence=0.9,
    )


class MenuParserTests(unittest.TestCase):
    def test_group_ocr_lines_with_bbox(self) -> None:
        tokens = [
            _token("MARGHERITA", 10, 10),
            _token("€", 140, 10),
            _token("4,50", 155, 11),
            _token("(pomodoro,", 10, 31),
            _token("mozzarella)", 100, 32),
        ]
        lines = group_ocr_lines(tokens, y_threshold=10)
        self.assertEqual(lines, ["MARGHERITA € 4,50", "(pomodoro, mozzarella)"])

    def test_extract_price_formats(self) -> None:
        self.assertEqual(extract_price("€ 4,50"), 4.5)
        self.assertEqual(extract_price("4,50 €"), 4.5)
        self.assertEqual(extract_price("4.50"), 4.5)
        self.assertEqual(extract_price("5"), 5.0)
        self.assertEqual(extract_price("€5.00"), 5.0)
        self.assertIsNone(extract_price("prezzo n.d."))
        self.assertIsNone(extract_price("0993"))
        self.assertIsNone(extract_price("NAPOLI pomodoro mozzarella 0993"))

    def test_detectors(self) -> None:
        self.assertTrue(is_price_line("MARGHERITA € 4,00"))
        self.assertTrue(looks_like_ingredients("(pomodoro, mozzarella)"))
        self.assertFalse(looks_like_name("(pomodoro, mozzarella)"))
        self.assertTrue(looks_like_name("MARGHERITA"))

    def test_build_menu_items_minimum_requested_case(self) -> None:
        lines = [
            "MARGHERITA € 4,00",
            "(pomodoro, mozzarella)",
            "PROSCIUTTO € 5,00",
            "(pomodoro, mozzarella, prosciutto)",
        ]
        items = build_menu_items(lines)
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]["name"], "MARGHERITA")
        self.assertEqual(items[0]["price"], 4.0)
        self.assertIn("pomodoro", items[0]["ingredients"])
        self.assertEqual(items[1]["name"], "PROSCIUTTO")
        self.assertEqual(items[1]["price"], 5.0)

    def test_split_multi_price_line_does_not_merge_items(self) -> None:
        lines = ["MARGHERITA €4,00 MARINARA €5,00", "(pomodoro, aglio)"]
        items = build_menu_items(lines)
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]["name"], "MARGHERITA")
        self.assertEqual(items[0]["price"], 4.0)
        self.assertEqual(items[1]["name"], "MARINARA")
        self.assertEqual(items[1]["price"], 5.0)

    def test_discard_ingredient_as_name(self) -> None:
        lines = ["pomodoro € 4,00", "DIAVOLA € 8,50"]
        items = build_menu_items(lines)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["name"], "DIAVOLA")

    def test_discard_currency_noise_line(self) -> None:
        lines = ["C6,60 5,50 C6,00 5,00 C5,50 C6,50 C4,50 C"]
        items = build_menu_items(lines)
        self.assertEqual(items, [])

    def test_price_before_name_is_supported(self) -> None:
        lines = ["€ 6,50 VIENNESE", "(pomodoro, mozzarella)"]
        items = build_menu_items(lines)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["name"], "VIENNESE")
        self.assertEqual(items[0]["price"], 6.5)

    def test_name_then_price_line_is_supported(self) -> None:
        lines = ["MANTOVANA", "€ 7,00", "(pomodoro, acciughe)"]
        items = build_menu_items(lines)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["name"], "MANTOVANA")
        self.assertEqual(items[0]["price"], 7.0)

    def test_inline_ingredients_on_same_price_line(self) -> None:
        lines = ["MARGHERITA (pomodoro, mozzarella) €4,00"]
        items = build_menu_items(lines)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["name"], "MARGHERITA")
        self.assertEqual(items[0]["price"], 4.0)
        self.assertIn("pomodoro", items[0]["ingredients"])
        self.assertIn("mozzarella", items[0]["ingredients"])

    def test_inline_ingredients_with_unclosed_parenthesis(self) -> None:
        lines = ["MANTOVANA (pomodoro mozzarella salsiccia cipolla €5,50"]
        items = build_menu_items(lines)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["name"], "MANTOVANA")
        self.assertEqual(items[0]["price"], 5.5)
        self.assertIn("pomodoro", items[0]["ingredients"])
        self.assertIn("mozzarella", items[0]["ingredients"])
        self.assertIn("salsiccia", items[0]["ingredients"])
        self.assertIn("cipolla", items[0]["ingredients"])

    def test_inline_ingredients_dot_separated(self) -> None:
        lines = ["CRUDO pomodoro.mozzarella.prosciutto crudo €6,50"]
        items = build_menu_items(lines)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["name"], "CRUDO")
        self.assertEqual(items[0]["price"], 6.5)
        self.assertIn("pomodoro", items[0]["ingredients"])
        self.assertIn("mozzarella", items[0]["ingredients"])


if __name__ == "__main__":
    unittest.main()
