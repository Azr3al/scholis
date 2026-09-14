from __future__ import annotations

import re

from django.conf import settings
from rapidfuzz import fuzz

from app_auth.import_resolve import USER_REF_FIELDS

MIN_FUZZY_NAME_LEN = 8


def none_match() -> dict:
    return {
        "kind": "none",
        "user": None,
        "field": None,
        "score": None,
        "candidates": [],
    }


def _norm_name(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def find_roster_name_substring_in_text(
    notes_text: str,
    roster_refs: list[dict],
) -> dict | None:
    nnotes = _norm_name(notes_text)
    if not nnotes:
        return None
    best = None
    best_len = 0
    for ref in roster_refs:
        for field in ("name", "alternative_name"):
            candidate = _norm_name(ref.get(field) or "")
            if len(candidate) < 3:
                continue
            if candidate in nnotes and len(candidate) > best_len:
                best_len = len(candidate)
                best = {
                    "kind": "exact",
                    "user": {k: ref[k] for k in USER_REF_FIELDS if k in ref},
                    "field": field,
                    "score": 100.0,
                    "candidates": [],
                }
    return best


def match_names_against_roster(
    roster_refs: list[dict],
    values: list[str],
    *,
    field: str = "name",
    fuzzy: bool = True,
) -> dict[str, dict]:
    out = {value: none_match() for value in values}
    if not roster_refs:
        return out

    for value in values:
        nvalue = _norm_name(value)
        if not nvalue:
            continue
        exact_ref = None
        matched_field = field
        for ref in roster_refs:
            for compare_field in ("name", "alternative_name"):
                candidate = _norm_name(ref.get(compare_field) or "")
                if candidate and candidate == nvalue:
                    exact_ref = ref
                    matched_field = compare_field
                    break
            if exact_ref:
                break
        if exact_ref:
            out[value] = {
                "kind": "exact",
                "user": {k: exact_ref[k] for k in USER_REF_FIELDS if k in exact_ref},
                "field": matched_field,
                "score": 100.0,
                "candidates": [],
            }
            continue
        if not fuzzy:
            continue
        if len(nvalue.replace(" ", "")) < MIN_FUZZY_NAME_LEN:
            continue
        floor = settings.IMPORT_USER_MATCH_FUZZY_MIN
        limit = settings.IMPORT_USER_MATCH_CANDIDATE_LIMIT
        scored: list[dict] = []
        for ref in roster_refs:
            for compare_field in (field, "name", "alternative_name"):
                candidate = _norm_name(ref.get(compare_field) or "")
                if not candidate:
                    continue
                score = float(fuzz.WRatio(nvalue, candidate))
                if score >= floor:
                    scored.append(
                        {
                            "user": {k: ref[k] for k in USER_REF_FIELDS if k in ref},
                            "score": round(score, 1),
                            "field": compare_field,
                        }
                    )
        if not scored:
            continue
        scored.sort(key=lambda item: item["score"], reverse=True)
        top = scored[0]
        if top["score"] >= 95:
            out[value] = {
                "kind": "exact",
                "user": top["user"],
                "field": top["field"],
                "score": top["score"],
                "candidates": [],
            }
        else:
            out[value] = {
                "kind": "fuzzy",
                "user": None,
                "field": None,
                "score": top["score"],
                "candidates": scored[:limit],
            }
    return out
