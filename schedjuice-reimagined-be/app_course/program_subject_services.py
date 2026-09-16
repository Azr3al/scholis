"""Bulk-add subjects to a program's catalog (required strategy)."""

from __future__ import annotations

import re

from django.db import IntegrityError, transaction

from app_course.models import Program, ProgramSubject, Subject

MAX_SUBJECT_NAME_LENGTH = 512


class ProgramSubjectValidationError(ValueError):
    pass


def _normalize_name(raw) -> str:
    return re.sub(r"\s+", " ", str(raw)).strip()


def _dedupe_key(name: str) -> str:
    key = name.casefold()
    key = re.sub(r"\s*&\s*", " and ", key)
    return re.sub(r"\s+", " ", key).strip()


def add_subjects_to_program(program_id: int, names) -> dict:
    """
    Idempotently add subjects (by name) to a program's ProgramSubject catalog.

    - find-or-create each Subject by case-insensitive name
    - link via ProgramSubject if not already linked
    - returns a {created_subjects, linked, skipped_already_linked, results} summary
    """
    program = Program.objects.filter(pk=program_id).first()
    if not program:
        raise ProgramSubjectValidationError("Program not found.")

    if program.subject_strategy != Program.SubjectStrategy.REQUIRED:
        raise ProgramSubjectValidationError(
            "Bulk subject add is only available for fixed-subject-list programs."
        )

    if not isinstance(names, list):
        raise ProgramSubjectValidationError("'names' must be an array.")

    cleaned: list[str] = []
    seen_keys: set[str] = set()
    for raw in names:
        name = _normalize_name(raw)
        if not name:
            continue
        if len(name) > MAX_SUBJECT_NAME_LENGTH:
            raise ProgramSubjectValidationError(
                f"Subject name exceeds {MAX_SUBJECT_NAME_LENGTH} characters: "
                f"{name[:50]!r}…"
            )
        key = _dedupe_key(name)
        if key in seen_keys:
            continue
        seen_keys.add(key)
        cleaned.append(name)

    results: list[dict] = []
    created_count = 0
    linked_count = 0
    skipped_count = 0

    linked_subject_ids = set(
        ProgramSubject.objects.filter(program_id=program_id).values_list(
            "subject_id", flat=True
        )
    )
    next_sort = ProgramSubject.objects.filter(program_id=program_id).count()

    with transaction.atomic():
        for name in cleaned:
            subject = Subject.objects.filter(name__iexact=name).first()
            created_subject = False
            if subject is None:
                try:
                    with transaction.atomic():
                        subject = Subject.objects.create(name=name)
                    created_subject = True
                except IntegrityError:
                    subject = Subject.objects.filter(name__iexact=name).first()

            if subject is None:
                # Should be unreachable; defensive.
                continue

            if subject.id in linked_subject_ids:
                results.append(
                    {"name": name, "subject_id": subject.id, "status": "skipped"}
                )
                skipped_count += 1
                continue

            ProgramSubject.objects.create(
                program_id=program_id, subject=subject, sort_order=next_sort
            )
            linked_subject_ids.add(subject.id)
            next_sort += 1
            if created_subject:
                results.append(
                    {"name": name, "subject_id": subject.id, "status": "created"}
                )
                created_count += 1
            else:
                results.append(
                    {"name": name, "subject_id": subject.id, "status": "linked"}
                )
                linked_count += 1

    return {
        "created_subjects": created_count,
        "linked": linked_count,
        "skipped_already_linked": skipped_count,
        "results": results,
    }
