from __future__ import annotations

import re

AUTO_THRESHOLD = 92.0
CANDIDATE_MIN = 75.0

COURSE_SPLIT = re.compile(
    r"\s*[-]?\s*\b(?:ket|pet|flyers|fce|fees|fee|schoolfees)\d*\b",
    re.IGNORECASE,
)

_COURSE_WORD = re.compile(
    r"^(?:ket|pet|flyers|fce|fees|fee|schoolfees|reading|writing|and|for|"
    r"sat|sun|mon|tue|wed|thu|fri|"
    r"jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|"
    r"january|february|march|april|june|july|august|september|october|"
    r"november|december|\d+)$",
    re.IGNORECASE,
)

_SKIP_PARSED_LINE = re.compile(
    r"(beneficiary|transfer to|from account|transaction|reference|accepted|"
    r"amount|mmk|\bks\b|ငွေလွှဲ|^daw\s|^u\s|^to:|^from:|\*{4,}|\d{20}|ft[a-z0-9]{8})",
    re.IGNORECASE,
)


def _is_bank_party_name(line: str) -> bool:
    stripped = (line or "").strip()
    if re.match(r"^(DAW|U|KO)\s+[A-Z][A-Z .]+$", stripped):
        return True
    letters = re.sub(r"[^A-Za-z]", "", stripped)
    words = stripped.split()
    return bool(letters and letters == letters.upper() and len(words) >= 2)


def empty_ocr_student_match(notes_text: str | None = None) -> dict:
    return {
        "notes_text": notes_text,
        "suggested_student_id": None,
        "student_match_kind": "none",
        "student_match_score": None,
        "student_match_candidates": [],
    }


def looks_like_course_title(text: str) -> bool:
    tokens = re.findall(r"[A-Za-z0-9]+", text or "")
    if not tokens:
        return True
    leftover = [token for token in tokens if not _COURSE_WORD.fullmatch(token)]
    return len(leftover) == 0


def note_name_candidates(notes_text: str) -> list[str]:
    text = (notes_text or "").strip()
    if not text:
        return []
    out: list[str] = []

    def add(value: str) -> None:
        cleaned = value.strip(" -")
        if cleaned and cleaned not in out:
            out.append(cleaned)

    add(text)
    ko_parts = re.split(r"\s+ko\s+", text, maxsplit=1, flags=re.IGNORECASE)
    if len(ko_parts) == 2:
        add(ko_parts[0])
    add(text.split("(", 1)[0])
    hyphen_parts = re.split(
        r"\s*-\s*(?=KET|PET|FLYERS)",
        text,
        maxsplit=1,
        flags=re.IGNORECASE,
    )
    if len(hyphen_parts) == 2:
        add(hyphen_parts[0])
    split_parts = COURSE_SPLIT.split(text, maxsplit=1)
    if split_parts:
        add(split_parts[0])
    return out


def map_roster_match_to_ocr_fields(raw: dict, *, notes_text: str | None) -> dict:
    kind = raw.get("kind")
    score = float(raw.get("score") or 0)
    user = raw.get("user")
    candidates = raw.get("candidates") or []

    if kind == "exact" or score >= AUTO_THRESHOLD:
        uid = user["id"] if user else None
        return {
            "notes_text": notes_text,
            "suggested_student_id": uid,
            "student_match_kind": "auto" if uid else "none",
            "student_match_score": score if score else None,
            "student_match_candidates": [],
        }

    filtered = [
        c
        for c in candidates
        if CANDIDATE_MIN <= float(c.get("score") or 0) < AUTO_THRESHOLD
    ]
    if filtered:
        return {
            "notes_text": notes_text,
            "suggested_student_id": None,
            "student_match_kind": "candidates",
            "student_match_score": float(filtered[0]["score"]),
            "student_match_candidates": [
                {
                    "id": c["user"]["id"],
                    "name": c["user"]["name"],
                    "score": float(c["score"]),
                }
                for c in filtered[:5]
            ],
        }

    return {
        "notes_text": notes_text,
        "suggested_student_id": None,
        "student_match_kind": "none",
        "student_match_score": score if score else None,
        "student_match_candidates": [],
    }


def _best_match_for_notes(notes_text: str, roster_refs: list[dict]) -> dict:
    from app_course.roster_match import (
        find_roster_name_substring_in_text,
        match_names_against_roster,
        none_match,
    )

    best = none_match()
    for candidate in note_name_candidates(notes_text):
        if looks_like_course_title(candidate):
            continue
        substring_hit = find_roster_name_substring_in_text(candidate, roster_refs)
        if substring_hit:
            return substring_hit
        raw = match_names_against_roster(
            roster_refs,
            [candidate],
            field="name",
            fuzzy=True,
        )[candidate]
        best_score = float(best.get("score") or 0)
        raw_score = float(raw.get("score") or 0)
        if raw.get("kind") == "exact":
            return raw
        if raw_score > best_score:
            best = raw
    return best


def find_roster_in_parsed_lines(parsed_text: str, roster_refs: list[dict]) -> dict | None:
    from app_course.roster_match import find_roster_name_substring_in_text

    best = None
    best_len = 0
    for line in (parsed_text or "").splitlines():
        line = line.strip()
        if not line or _SKIP_PARSED_LINE.search(line):
            continue
        if _is_bank_party_name(line) or looks_like_course_title(line):
            continue
        hit = find_roster_name_substring_in_text(line, roster_refs)
        if not hit:
            continue
        name = (hit.get("user") or {}).get("name") or ""
        if len(name) > best_len:
            best = hit
            best_len = len(name)
    return best


def build_ocr_student_match(
    course_id: int,
    notes_text: str | None,
    *,
    parsed_text: str | None = None,
) -> dict:
    from app_grading_reports.mark_sheet_services import roster_user_refs

    roster_refs = roster_user_refs(course_id)
    if notes_text and not looks_like_course_title(notes_text):
        raw = _best_match_for_notes(notes_text, roster_refs)
        mapped = map_roster_match_to_ocr_fields(raw, notes_text=notes_text)
        if mapped["student_match_kind"] != "none":
            return mapped

    if parsed_text:
        fallback = find_roster_in_parsed_lines(parsed_text, roster_refs)
        if fallback:
            return map_roster_match_to_ocr_fields(fallback, notes_text=notes_text)

    return empty_ocr_student_match(notes_text)
