"""Pure planner for clearing false duplicate flags on multi-course group siblings."""

from __future__ import annotations

DUPLICATED = "duplicated"
MULTI_COURSE = "multi_course"
PENDING_VERIFICATION = "pending_verification"
AWAITING_EXTRACTION = "awaiting_extraction"
PENDING_PAYMENT = "pending_payment"


def _corrected_status(row: dict) -> str:
    if row.get("parsed_amount") is not None:
        return PENDING_VERIFICATION
    if row.get("screenshot"):
        return AWAITING_EXTRACTION
    return PENDING_PAYMENT


def plan_group_duplicate_status_backfill(rows: list[dict]) -> dict[int, str]:
    """Map payment id -> corrected status for false duplicate flags.

    Only clears ``duplicated`` on multi_course group parts whose same-transaction
    peers are exclusively other parts of that group.
    """
    by_txn: dict[str, list[dict]] = {}
    for row in rows:
        tid = (row.get("transaction_id") or "").strip()
        if not tid:
            continue
        by_txn.setdefault(tid, []).append(row)

    corrections: dict[int, str] = {}
    for bucket in by_txn.values():
        has_external_peer = any(
            peer.get("group_id") is None
            or peer.get("group__group_kind") != MULTI_COURSE
            for peer in bucket
        )
        if has_external_peer:
            continue

        for row in bucket:
            if row.get("status") != DUPLICATED:
                continue
            if row.get("group__group_kind") != MULTI_COURSE:
                continue
            group_id = row.get("group_id")
            if group_id is None:
                continue
            siblings = [
                peer
                for peer in bucket
                if peer["id"] != row["id"] and peer.get("group_id") == group_id
            ]
            if not siblings:
                continue
            corrections[row["id"]] = _corrected_status(row)

    return corrections
