"""
Shared billing snapshot helpers for record_daily_billing and backfill_daily_billing.

Estimates active_user_count for missing calendar days using neighboring Billing rows.
Must run inside schema_context(tenant_schema).
"""

from __future__ import annotations

from datetime import date, timedelta

from app_finance.models import Billing


def active_user_count_for_billing_date(
    d: date,
    *,
    end_date: date,
    live_active_user_count: int,
) -> int:
    """
    If d == end_date, return live_active_user_count (current snapshot).

    Otherwise: average of the nearest Billing row before d and after d when both exist;
    if only one neighbor exists, use that row's count; if neither, fall back to live count.
    """
    if d == end_date:
        return live_active_user_count

    prev_row = Billing.objects.filter(billing_date__lt=d).order_by("-billing_date").first()
    next_row = Billing.objects.filter(billing_date__gt=d).order_by("billing_date").first()
    if prev_row and next_row:
        return (prev_row.active_user_count + next_row.active_user_count) // 2
    if prev_row:
        return prev_row.active_user_count
    if next_row:
        return next_row.active_user_count
    return live_active_user_count


def iter_inclusive_dates(start: date, end: date):
    cur = start
    while cur <= end:
        yield cur
        cur += timedelta(days=1)
