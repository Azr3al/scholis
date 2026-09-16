import math
import re
import uuid

from rest_framework.exceptions import ValidationError

TOKEN_RE = re.compile(r"\{\{\s*([^}]+?)\s*\}\}")

INLINE_VARIABLE_KEYS = frozenset(
    {
        "school_name",
        "student_name",
        "registration",
        "course_name",
        "period",
        "academic_year",
        "current_date",
        "mt_name",
        "pronoun",
    }
)
TABLE_COLUMN_KEYS = frozenset({"subject_name", "mark", "letter_grade", "comment"})
BLOCK_TYPES = frozenset({"text", "image", "columns", "grades_table"})
COLUMN_CHILD_TYPES = frozenset({"text", "image"})
PAGE_PRESETS = {
    "a4_portrait": (210.0, 297.0),
    "a4_landscape": (297.0, 210.0),
    "letter_portrait": (215.9, 279.4),
}

EMPTY_DOCUMENT = {
    "version": 1,
    "page": {"preset": "a4_portrait", "width": 210, "height": 297, "unit": "mm"},
    "blocks": [],
}


def starter_text_block() -> dict:
    return {
        "id": str(uuid.uuid4()),
        "type": "text",
        "text": "",
        "align": "left",
        "fontFamily": "Noto Sans",
        "fontSize": 12,
        "color": "#111111",
        "bold": False,
        "italic": False,
    }


def new_empty_document() -> dict:
    return {
        "version": 1,
        "page": {"preset": "a4_portrait", "width": 210, "height": 297, "unit": "mm"},
        "blocks": [starter_text_block()],
    }


def next_untitled_name(names: list[str]) -> str:
    used = {n.strip().lower() for n in names}
    if "untitled" not in used:
        return "Untitled"
    n = 2
    while f"untitled {n}" in used:
        n += 1
    return f"Untitled {n}"


def _err(path, message):
    parts = path.split(".")
    tree = message
    for part in reversed(parts):
        tree = {part: tree}
    raise ValidationError(tree)


def _is_finite_number(value) -> bool:
    try:
        num = float(value)
    except (TypeError, ValueError):
        return False
    return math.isfinite(num)


def _has_output_data_url(value) -> bool:
    if isinstance(value, str) and (
        value.startswith("data:image") or value.startswith("data:application/pdf")
    ):
        return True
    if isinstance(value, dict):
        return any(_has_output_data_url(v) for v in value.values())
    if isinstance(value, list):
        return any(_has_output_data_url(v) for v in value)
    return False


def _validate_text(block, path, for_publish: bool):
    text = block.get("text", "")
    if not isinstance(text, str):
        _err(f"{path}.text", "Must be a string.")
    for raw in TOKEN_RE.findall(text):
        key = raw.strip()
        if key not in INLINE_VARIABLE_KEYS:
            _err(path, f"Unknown token: {key!r}.")


def _validate_image(block, path, for_publish: bool):
    url = block.get("url")
    if url is not None and not isinstance(url, str):
        _err(f"{path}.url", "Must be a string or null.")
    if isinstance(url, str) and (
        url.startswith("data:image") or url.startswith("data:application/pdf")
    ):
        _err(path, "Output images cannot be stored on blocks.")
    if for_publish and not (isinstance(url, str) and url.strip()):
        _err(f"{path}.url", "Image URL is required to publish.")
    width = block.get("width", 1)
    if not _is_finite_number(width) or float(width) <= 0:
        _err(f"{path}.width", "Must be a positive number.")


def _validate_grades_table(block, path, for_publish: bool):
    columns = block.get("columns")
    if not isinstance(columns, list):
        _err(f"{path}.columns", "Must be a list.")
    if for_publish and len(columns) < 1:
        _err(f"{path}.columns", "At least one column is required to publish.")
    for i, col in enumerate(columns):
        if not isinstance(col, dict):
            _err(f"{path}.columns.{i}", "Each column must be an object.")
        key = col.get("key")
        if key not in TABLE_COLUMN_KEYS:
            _err(f"{path}.columns.{i}", f"Invalid column: {key!r}.")


def _validate_block(block, path, *, in_column: bool, for_publish: bool):
    if not isinstance(block, dict):
        _err(path, "Each block must be an object.")
    btype = block.get("type")
    if btype not in BLOCK_TYPES:
        _err(path, f"Invalid type: {btype!r}.")
    if in_column and btype not in COLUMN_CHILD_TYPES:
        _err(path, f"Cannot nest {btype} inside a column.")
    if _has_output_data_url(block):
        _err(path, "Output images cannot be stored on blocks.")
    if btype == "text":
        _validate_text(block, path, for_publish)
    elif btype == "image":
        _validate_image(block, path, for_publish)
    elif btype == "grades_table":
        _validate_grades_table(block, path, for_publish)
    elif btype == "columns":
        cols = block.get("columns")
        if not isinstance(cols, list) or len(cols) != 2:
            _err(f"{path}.columns", "Must be two column lists.")
        for ci, children in enumerate(cols):
            if not isinstance(children, list):
                _err(f"{path}.columns.{ci}", "Must be a list.")
            for bi, child in enumerate(children):
                _validate_block(
                    child,
                    f"{path}.columns.{ci}.{bi}",
                    in_column=True,
                    for_publish=for_publish,
                )


def validate_document(document, *, for_publish: bool = False) -> None:
    if not isinstance(document, dict):
        raise ValidationError({"document": "Must be an object."})
    if document.get("version") != 1:
        raise ValidationError({"version": "Must be 1."})
    page = document.get("page")
    if not isinstance(page, dict):
        raise ValidationError({"page": "Must be an object."})
    if page.get("unit") != "mm":
        raise ValidationError({"page": {"unit": "Must be 'mm'."}})
    preset = page.get("preset")
    if preset not in PAGE_PRESETS and preset != "custom":
        raise ValidationError({"page": {"preset": "Invalid page preset."}})
    width = page.get("width")
    height = page.get("height")
    if not _is_finite_number(width) or not _is_finite_number(height):
        raise ValidationError({"page": "Width and height must be finite numbers."})
    w, h = float(width), float(height)
    if w < 1 or h < 1 or w > 1000 or h > 1000:
        raise ValidationError({"page": "Each side must be between 1 and 1000 mm."})
    if preset in PAGE_PRESETS:
        pw, ph = PAGE_PRESETS[preset]
        if abs(w - pw) > 0.05 or abs(h - ph) > 0.05:
            raise ValidationError({"page": "Size does not match the named preset."})
    blocks = document.get("blocks")
    if not isinstance(blocks, list):
        raise ValidationError({"blocks": "Must be a list."})
    for index, block in enumerate(blocks):
        _validate_block(
            block, f"blocks.{index}", in_column=False, for_publish=for_publish
        )
