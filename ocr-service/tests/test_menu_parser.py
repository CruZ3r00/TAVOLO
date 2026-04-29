from __future__ import annotations

import unittest

from app.ocr.menu_parser import (
    build_menu_items,
    extract_price,
    group_tokens_by_visual_layout,
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
        self.assertEqual(extract_price("EUR 4,50"), 4.5)
        self.assertEqual(extract_price("€ 7, 00"), 7.0)
        self.assertEqual(extract_price("4.50"), 4.5)
        self.assertEqual(extract_price("5"), 5.0)
        self.assertEqual(extract_price("€5.00"), 5.0)
        self.assertIsNone(extract_price("prezzo n.d."))
        self.assertIsNone(extract_price("0993"))
        self.assertIsNone(extract_price("NAPOLI pomodoro mozzarella 0993"))
        self.assertIsNone(extract_price("allergeni [1,7]"))
        self.assertIsNone(extract_price("1 pizza o 1 pasta"))
        self.assertIsNone(extract_price("Nastro Azzurro 20cl"))

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

    def test_price_on_right_with_description_below(self) -> None:
        lines = ["MARGHERITA € 6,50", "pomodoro, mozzarella, basilico"]
        items = build_menu_items(lines)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["name"], "MARGHERITA")
        self.assertEqual(items[0]["price"], 6.5)
        self.assertIn("basilico", items[0]["ingredients"])

    def test_visual_layout_keeps_columns_separate(self) -> None:
        tokens = [
            _token("MARGHERITA", 10, 10, 80),
            _token("€", 125, 10),
            _token("6,50", 145, 10),
            _token("pomodoro,", 10, 30, 70),
            _token("mozzarella", 90, 30, 80),
            _token("DIAVOLA", 360, 10, 70),
            _token("€", 475, 10),
            _token("8,00", 495, 10),
            _token("salame,", 360, 30, 60),
            _token("peperoncino", 430, 30, 90),
        ]
        _blocks, lines, warnings = group_tokens_by_visual_layout(
            tokens,
            page_width=620,
            detect_columns=True,
        )
        self.assertEqual(warnings, [])
        self.assertEqual([ln["column"] for ln in lines], [1, 1, 2, 2])
        items = build_menu_items([ln["text"] for ln in lines])
        self.assertEqual([item["name"] for item in items], ["MARGHERITA", "DIAVOLA"])

    def test_visual_layout_warns_multiple_prices_same_line(self) -> None:
        tokens = [
            _token("MARGHERITA", 10, 10, 80),
            _token("6,50", 110, 10),
            _token("MARINARA", 180, 10, 75),
            _token("5,50", 270, 10),
        ]
        _blocks, _lines, warnings = group_tokens_by_visual_layout(tokens, page_width=330)
        self.assertTrue(any("piu' prezzi" in warning for warning in warnings))

    def test_visual_layout_normalizes_menu_board_prices(self) -> None:
        tokens = [
            _token("SCONES", 10, 10, 70),
            _token("490", 120, 10, 35),
            _token("POPCORN", 10, 30, 80),
            _token("6", 120, 30, 10),
            _token("50", 140, 30, 20),
            _token("PIZZA", 10, 50, 55),
            _token("15", 120, 50, 20),
            _token("90", 150, 50, 20),
        ]
        _blocks, lines, _warnings = group_tokens_by_visual_layout(
            tokens,
            page_width=220,
            detect_columns=False,
        )
        texts = [ln["text"] for ln in lines]
        self.assertIn("SCONES 4.90", texts)
        self.assertIn("POPCORN 6.50", texts)
        self.assertIn("PIZZA 15.90", texts)

    def test_spaced_ocr_letters_in_name_are_collapsed(self) -> None:
        items = build_menu_items(["P l Z Z A 15.90"])
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["name"], "PIZZA")
        self.assertEqual(items[0]["price"], 15.9)

    def test_ocr_ingredient_fragments_are_filtered(self) -> None:
        lines = [
            "DIAV0LA EUR8.00",
            "pomodoro, mozzarella, salame, peperon",
            "ino",
        ]
        items = build_menu_items(lines)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["name"], "DIAVOLA")
        self.assertIn("peperoncino", items[0]["ingredients"])
        self.assertNotIn("ino", items[0]["ingredients"])

    def test_common_ocr_name_typos_are_normalized(self) -> None:
        items = build_menu_items(["DlAVOLA € 8,00"])
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["name"], "DIAVOLA")

    def test_price_line_name_typo_not_added_as_ingredient(self) -> None:
        items = build_menu_items([
            "DlAVOLA 8,00 ?",
            "pomodoro, mozzarella, salamo, basitico",
        ])
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["name"], "DIAVOLA")
        self.assertNotIn("dlavola", items[0]["ingredients"])
        self.assertIn("salame", items[0]["ingredients"])
        self.assertIn("basilico", items[0]["ingredients"])

    def test_pdf_section_markers_are_not_ingredients(self) -> None:
        items = build_menu_items([
            "__ Quattro Formaggi (pomodoro, mozzarella, formaggi assortiti) € 7,00",
            "__ Capro (scamorza, barbozza, spinaci) € 7,00",
            "Pizze Speciali",
        ])
        self.assertEqual(len(items), 2)
        self.assertNotIn("__ capro scamorza", items[0]["ingredients"])
        self.assertNotIn("pizze speciali", items[1]["ingredients"])


if __name__ == "__main__":
    unittest.main()
