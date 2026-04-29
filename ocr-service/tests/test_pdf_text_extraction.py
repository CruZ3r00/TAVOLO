from __future__ import annotations

import os
import tempfile
import unittest

import fitz  # type: ignore[import-untyped]

from app.preprocessing.pdf_to_image import extract_pdf_text_layout


class PdfTextExtractionTests(unittest.TestCase):
    def test_extract_selectable_text_layout(self) -> None:
        fd, pdf_path = tempfile.mkstemp(suffix=".pdf")
        os.close(fd)
        try:
            doc = fitz.open()
            page = doc.new_page()
            page.insert_text((72, 72), "MARGHERITA EUR 6,50")
            page.insert_text((72, 92), "pomodoro, mozzarella")
            doc.save(pdf_path)
            doc.close()

            pages = extract_pdf_text_layout(pdf_path)
            self.assertEqual(len(pages), 1)
            lines = [line["text"] for line in pages[0]["lines"]]
            self.assertIn("MARGHERITA EUR 6,50", lines)
            self.assertIn("pomodoro, mozzarella", lines)
            self.assertGreater(pages[0]["width"], 0)
            self.assertGreater(pages[0]["height"], 0)
        finally:
            if os.path.exists(pdf_path):
                os.remove(pdf_path)


if __name__ == "__main__":
    unittest.main()
