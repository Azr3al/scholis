"""Shared helpers for app_telegram tests."""
from __future__ import annotations

from datetime import date
from uuid import uuid4

from app_course.models import Category, Course, Program


def create_test_course(**overrides) -> Course:
    suffix = uuid4().hex[:6]
    cat = Category.objects.create(name=f"Cat-{suffix}", sort_order=1)
    program = Program.objects.create(name=f"Prog-{suffix}")
    defaults = {
        "title": f"Course-{suffix}",
        "start_date": date(2026, 6, 1),
        "end_date": date(2026, 6, 30),
        "category": cat,
        "program": program,
    }
    defaults.update(overrides)
    return Course.objects.create(**defaults)
