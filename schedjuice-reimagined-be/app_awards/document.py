from rest_framework.exceptions import ValidationError

EMPTY_AWARD_DOCUMENT = {
    "version": 1,
    "kind": "award",
    "unit": "px",
    "width": 0,
    "height": 0,
    "pagePreset": "original",
    "background": {"url": None, "offsetX": 0, "offsetY": 0, "scale": 1},
    "layers": [],
}

AWARD_PAGE_PRESETS = frozenset({"original", "hd_16_9", "a4_landscape", "custom"})

AWARD_FIELD_KEYS = frozenset(
    {
        "student_name",
        "award_title",
        "period",
        "course_name",
        "pronoun",
        "current_date",
        "mt_name",
    }
)
LAYER_TYPES = frozenset({"text", "field", "photo", "signature", "named_person"})


def next_untitled_name(names: list[str]) -> str:
    used = {n.strip().lower() for n in names}
    if "untitled" not in used:
        return "Untitled"
    n = 2
    while f"untitled {n}" in used:
        n += 1
    return f"Untitled {n}"


def _has_output_data_url(value) -> bool:
    if isinstance(value, str) and value.startswith("data:image"):
        return True
    if isinstance(value, dict):
        return any(_has_output_data_url(v) for v in value.values())
    if isinstance(value, list):
        return any(_has_output_data_url(v) for v in value)
    return False


def validate_award_document(document):
    if not isinstance(document, dict):
        raise ValidationError({"document": "Must be an object."})
    if document.get("kind") != "award":
        raise ValidationError({"kind": "Must be 'award'."})
    preset = document.get("pagePreset", "original")
    if preset not in AWARD_PAGE_PRESETS:
        raise ValidationError({"pagePreset": "Invalid page preset."})
    background = document.get("background", {})
    if not isinstance(background, dict):
        raise ValidationError({"background": "Must be an object."})
    scale = background.get("scale", 1)
    try:
        scale_num = float(scale)
    except (TypeError, ValueError) as exc:
        raise ValidationError({"background": {"scale": "Must be a number."}}) from exc
    if not (scale_num > 0) or scale_num != scale_num:
        raise ValidationError({"background": {"scale": "Must be greater than 0."}})
    for key in ("offsetX", "offsetY"):
        if key in background:
            try:
                val = float(background[key])
            except (TypeError, ValueError) as exc:
                raise ValidationError({"background": {key: "Must be a number."}}) from exc
            if val != val:
                raise ValidationError({"background": {key: "Must be finite."}})
    layers = document.get("layers")
    if not isinstance(layers, list):
        raise ValidationError({"layers": "Must be a list."})
    for index, layer in enumerate(layers):
        if not isinstance(layer, dict):
            raise ValidationError({"layers": {index: "Each layer must be an object."}})
        if layer.get("type") not in LAYER_TYPES:
            raise ValidationError(
                {"layers": {index: f"Invalid type: {layer.get('type')!r}."}}
            )
        if layer.get("type") == "field" and layer.get("field") not in AWARD_FIELD_KEYS:
            raise ValidationError(
                {"layers": {index: f"Invalid field: {layer.get('field')!r}."}}
            )
        if _has_output_data_url(layer):
            raise ValidationError(
                {"layers": {index: "Output images cannot be stored on layers."}}
            )
