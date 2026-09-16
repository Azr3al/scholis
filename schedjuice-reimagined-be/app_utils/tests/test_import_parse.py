import io

from django.test import SimpleTestCase
from openpyxl import Workbook

from app_utils.import_parse import CSV_SHEET_NAME, parse_csv, parse_import_file, parse_workbook

def _wb_bytes(sheets: dict[str, list[list]]) -> bytes:
    wb = Workbook()
    wb.remove(wb.active)
    for name, rows in sheets.items():
        ws = wb.create_sheet(title=name)
        for row in rows:
            ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()

class ParseWorkbookTest(SimpleTestCase):

    def test_selects_named_sheet(self):
        data = _wb_bytes({"A": [["h"], ["1"]], "B": [["x"], ["2"]]})
        out = parse_workbook(io.BytesIO(data), sheet="B", max_rows=100)
        self.assertEqual(out["active_sheet"], "B")
        self.assertEqual(out["headers"], ["x"])

    def test_row_cap_raises(self):
        data = _wb_bytes({"Sheet1": [["h"], ["1"], ["2"], ["3"]]})
        with self.assertRaises(ValueError):
            parse_workbook(io.BytesIO(data), sheet=None, max_rows=2)

class ParseCsvTest(SimpleTestCase):

    def test_handles_quoted_fields_with_commas(self):
        data = b'email,courses\na@x.edu,"Year 4 R1, Year 5 R2"\n'
        out = parse_csv(io.BytesIO(data), max_rows=100)
        self.assertEqual(out["headers"], ["email", "courses"])
        self.assertEqual(out["rows"], [["a@x.edu", "Year 4 R1, Year 5 R2"]])

    def test_row_cap_raises(self):
        data = b"h\n1\n2\n3\n"
        with self.assertRaises(ValueError):
            parse_csv(io.BytesIO(data), max_rows=2)

