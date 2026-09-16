"""Multi-column existing-user matching for the Import Wizard (Approach A)."""
from __future__ import annotations

import re

from django.conf import settings
from django.db.models import Q
from rapidfuzz import fuzz

from app_auth.import_resolve import USER_REF_FIELDS
from app_auth.models import User
from app_organization.acca_spreadsheet_import import normalize_email

_NON_DIGITS = re.compile(r"\D+")


def normalize_phone_digits(value: str | None) -> str:
    return _NON_DIGITS.sub("", value or "")


def _none_result() -> dict:
    return {
        "kind": "none",
        "user": None,
        "field": None,
        "score": None,
        "candidates": [],
    }


def _exact_emails(values: list[str]) -> dict[str, dict]:
    normalized: dict[str, str] = {}
    for value in values:
        norm = normalize_email(value)
        if norm:
            normalized.setdefault(norm, value)
    out: dict[str, dict] = {original: _none_result() for original in values}
    if not normalized:
        return out

    keys = list(normalized.keys())
    rows = User.objects.filter(
        Q(email__in=keys) | Q(communication_email__in=keys)
    ).values(*USER_REF_FIELDS, "communication_email")

    by_email: dict[str, dict] = {}
    by_comm: dict[str, dict] = {}
    for row in rows:
        ref = {k: row[k] for k in USER_REF_FIELDS}
        primary = normalize_email(row.get("email"))
        comm = normalize_email(row.get("communication_email"))
        if primary:
            by_email[primary] = ref
        if comm:
            by_comm.setdefault(comm, ref)

    for norm, original in normalized.items():
        if norm in by_email:
            out[original] = {
                "kind": "exact",
                "user": by_email[norm],
                "field": "email",
                "score": 100.0,
                "candidates": [],
            }
        elif norm in by_comm:
            out[original] = {
                "kind": "exact",
                "user": by_comm[norm],
                "field": "communication_email",
                "score": 100.0,
                "candidates": [],
            }
    return out


def _exact_phones(values: list[str]) -> dict[str, dict]:
    normalized: dict[str, str] = {}
    for value in values:
        norm = normalize_phone_digits(value)
        if norm:
            normalized.setdefault(norm, value)
    out: dict[str, dict] = {original: _none_result() for original in values}
    if not normalized:
        return out

    keys = list(normalized.keys())
    rows = User.objects.filter(
        Q(phone_number_digits__in=keys)
        | Q(emergency_contact_phone_number_digits__in=keys)
    ).values(
        *USER_REF_FIELDS,
        "phone_number_digits",
        "emergency_contact_phone_number_digits",
    )

    by_phone: dict[str, tuple[dict, str]] = {}
    for row in rows:
        ref = {k: row[k] for k in USER_REF_FIELDS}
        pd = row.get("phone_number_digits") or ""
        ed = row.get("emergency_contact_phone_number_digits") or ""
        if pd:
            by_phone.setdefault(pd, (ref, "phone_number"))
        if ed:
            by_phone.setdefault(ed, (ref, "emergency_contact_phone_number"))

    for norm, original in normalized.items():
        hit = by_phone.get(norm)
        if hit:
            ref, field = hit
            out[original] = {
                "kind": "exact",
                "user": ref,
                "field": field,
                "score": 100.0,
                "candidates": [],
            }
    return out


def _email_domain(value: str) -> str:
    norm = normalize_email(value)
    return norm.split("@", 1)[1] if "@" in norm else ""


def _candidate_ref_emails(domains: set[str]) -> list[tuple[dict, str, str]]:
    if not domains:
        return []
    domain_q = Q()
    for d in domains:
        domain_q |= Q(email__iendswith=f"@{d}") | Q(
            communication_email__iendswith=f"@{d}"
        )
    rows = User.objects.filter(domain_q).values(
        *USER_REF_FIELDS, "communication_email"
    )
    pool: list[tuple[dict, str, str]] = []
    for row in rows:
        ref = {k: row[k] for k in USER_REF_FIELDS}
        if row.get("email"):
            pool.append((ref, normalize_email(row["email"]), "email"))
        if row.get("communication_email"):
            pool.append(
                (
                    ref,
                    normalize_email(row["communication_email"]),
                    "communication_email",
                )
            )
    return pool


def _fuzzy_emails(values: list[str], exact_out: dict[str, dict]) -> None:
    pending = [
        v for v in values if exact_out[v]["kind"] == "none" and normalize_email(v)
    ]
    if not pending:
        return
    domains = {_email_domain(v) for v in pending if _email_domain(v)}
    pool = _candidate_ref_emails(domains)
    if not pool:
        return
    floor = settings.IMPORT_USER_MATCH_FUZZY_MIN
    limit = settings.IMPORT_USER_MATCH_CANDIDATE_LIMIT
    for value in pending:
        norm = normalize_email(value)
        scored: list[dict] = []
        for ref, cand_email, field in pool:
            if _email_domain(cand_email) != _email_domain(value):
                continue
            score = float(fuzz.WRatio(norm, cand_email))
            if score >= floor:
                scored.append(
                    {"user": ref, "score": round(score, 1), "field": field}
                )
        if not scored:
            continue
        scored.sort(key=lambda c: c["score"], reverse=True)
        scored = scored[:limit]
        exact_out[value] = {
            "kind": "fuzzy",
            "user": None,
            "field": None,
            "score": scored[0]["score"],
            "candidates": scored,
        }


def _fuzzy_phones(values: list[str], exact_out: dict[str, dict]) -> None:
    pending = [
        v
        for v in values
        if exact_out[v]["kind"] == "none" and normalize_phone_digits(v)
    ]
    if not pending:
        return
    tail = settings.IMPORT_USER_PHONE_TAIL_DIGITS
    tails = {
        normalize_phone_digits(v)[-tail:]
        for v in pending
        if len(normalize_phone_digits(v)) >= tail
    }
    if not tails:
        return
    tail_q = Q()
    for t in tails:
        tail_q |= Q(phone_number_digits__endswith=t) | Q(
            emergency_contact_phone_number_digits__endswith=t
        )
    rows = User.objects.filter(tail_q).values(
        *USER_REF_FIELDS,
        "phone_number_digits",
        "emergency_contact_phone_number_digits",
    )
    pool: list[tuple[dict, str, str]] = []
    for row in rows:
        ref = {k: row[k] for k in USER_REF_FIELDS}
        if row.get("phone_number_digits"):
            pool.append((ref, row["phone_number_digits"], "phone_number"))
        if row.get("emergency_contact_phone_number_digits"):
            pool.append(
                (
                    ref,
                    row["emergency_contact_phone_number_digits"],
                    "emergency_contact_phone_number",
                )
            )

    floor = settings.IMPORT_USER_MATCH_FUZZY_MIN
    limit = settings.IMPORT_USER_MATCH_CANDIDATE_LIMIT
    for value in pending:
        digits = normalize_phone_digits(value)
        scored: list[dict] = []
        for ref, cand_digits, field in pool:
            score = float(fuzz.ratio(digits, cand_digits))
            if score >= floor:
                scored.append(
                    {"user": ref, "score": round(score, 1), "field": field}
                )
        if not scored:
            continue
        scored.sort(key=lambda c: c["score"], reverse=True)
        scored = scored[:limit]
        exact_out[value] = {
            "kind": "fuzzy",
            "user": None,
            "field": None,
            "score": scored[0]["score"],
            "candidates": scored,
        }


def match_users(specs: list[dict]) -> dict[str, dict[str, dict]]:
    results: dict[str, dict[str, dict]] = {}
    for spec in specs:
        key = spec["key"]
        values = [str(v) for v in spec.get("values", []) if isinstance(v, str)]
        if spec.get("type") == "email":
            email_out = _exact_emails(values)
            if spec.get("fuzzy"):
                _fuzzy_emails(values, email_out)
            results[key] = email_out
        else:
            phone_out = _exact_phones(values)
            if spec.get("fuzzy"):
                _fuzzy_phones(values, phone_out)
            results[key] = phone_out
    return results
