"""User insights: duplicate student cluster detection."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass

from app_attendance.god_view_services import paginate_rows
from app_auth.import_user_match import normalize_phone_digits
from app_organization.acca_spreadsheet_import import normalize_email

MATCH_FIELD_LABELS = {
    "phone": "Shared phone",
    "communication_email": "Shared communication email",
    "emergency_phone": "Shared emergency contact phone",
}


def normalize_name(name: str) -> str:
    return " ".join((name or "").strip().lower().split())


class UnionFind:
    def __init__(self) -> None:
        self.parent: dict[int, int] = {}

    def find(self, x: int) -> int:
        self.parent.setdefault(x, x)
        if self.parent[x] != x:
            self.parent[x] = self.find(self.parent[x])
        return self.parent[x]

    def union(self, a: int, b: int) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[rb] = ra


@dataclass
class DuplicateClusterFilters:
    q: str | None = None
    include_inactive: bool = False
    page: int = 1
    size: int = 25


def _cluster_id(user_ids: list[int]) -> str:
    raw = ",".join(str(i) for i in sorted(user_ids))
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _is_student(user: dict) -> bool:
    roles = user.get("roles") or []
    return "student" in roles


def build_duplicate_clusters(
    users: list[dict],
    filters: DuplicateClusterFilters,
) -> tuple[dict, list[dict], int]:
    scoped = [
        u
        for u in users
        if _is_student(u) and (filters.include_inactive or u.get("is_active", True))
    ]
    by_id = {u["id"]: u for u in scoped}

    buckets: dict[tuple[str, str], list[int]] = {}
    for u in scoped:
        uid = u["id"]
        phone = normalize_phone_digits(
            u.get("phone_number_digits") or u.get("phone_number")
        )
        if phone:
            buckets.setdefault(("phone", phone), []).append(uid)
        comm = normalize_email(u.get("communication_email") or "")
        if comm:
            buckets.setdefault(("communication_email", comm), []).append(uid)
        emerg = normalize_phone_digits(
            u.get("emergency_contact_phone_number_digits") or ""
        )
        if emerg:
            buckets.setdefault(("emergency_phone", emerg), []).append(uid)

    uf = UnionFind()
    reasons_raw: list[dict] = []
    for (field, norm_val), ids in buckets.items():
        unique_ids = sorted(set(ids))
        if len(unique_ids) < 2:
            continue
        for i in range(1, len(unique_ids)):
            uf.union(unique_ids[0], unique_ids[i])
        reasons_raw.append(
            {"field": field, "normalized_value": norm_val, "user_ids": unique_ids}
        )

    groups: dict[int, set[int]] = {}
    for uid in by_id:
        root = uf.find(uid)
        groups.setdefault(root, set()).add(uid)
    cluster_user_ids = [sorted(g) for g in groups.values() if len(g) >= 2]

    clusters: list[dict] = []
    for user_ids in cluster_user_ids:
        match_reasons: list[dict] = []
        possible_siblings = False
        for rr in reasons_raw:
            overlap = [i for i in rr["user_ids"] if i in user_ids]
            if len(overlap) < 2:
                continue
            edge_sibling = len({normalize_name(by_id[i]["name"]) for i in overlap}) > 1
            possible_siblings = possible_siblings or edge_sibling
            match_reasons.append(
                {
                    "field": rr["field"],
                    "label": MATCH_FIELD_LABELS[rr["field"]],
                    "normalized_value": rr["normalized_value"],
                    "user_ids": overlap,
                    "possible_sibling": edge_sibling,
                }
            )
        members = [
            {
                "id": by_id[i]["id"],
                "name": by_id[i]["name"],
                "email": by_id[i]["email"],
                "communication_email": by_id[i].get("communication_email") or "",
                "phone_number": by_id[i].get("phone_number") or "",
                "emergency_contact_phone_number": by_id[i].get(
                    "emergency_contact_phone_number"
                )
                or "",
                "microsoft_id": by_id[i].get("microsoft_id"),
                "is_active": by_id[i].get("is_active", True),
            }
            for i in user_ids
        ]
        clusters.append(
            {
                "cluster_id": _cluster_id(user_ids),
                "possible_siblings": possible_siblings,
                "user_ids": user_ids,
                "users": members,
                "match_reasons": match_reasons,
            }
        )

    if filters.q:
        q = filters.q.strip().lower()
        clusters = [
            c
            for c in clusters
            if any(
                q in (m.get("name") or "").lower()
                or q in (m.get("email") or "").lower()
                or q in (m.get("communication_email") or "").lower()
                for m in c["users"]
            )
        ]

    summary = {
        "cluster_count": len(clusters),
        "sibling_flagged_count": sum(1 for c in clusters if c["possible_siblings"]),
        "student_count": sum(len(c["user_ids"]) for c in clusters),
    }
    page_rows, count = paginate_rows(clusters, filters.page, filters.size)
    return summary, page_rows, count


def load_student_rows(include_inactive: bool) -> list[dict]:
    from app_auth.models import User

    qs = User.objects.filter(roles__contains=[User.UserRole.STUDENT])
    if not include_inactive:
        qs = qs.filter(is_active=True)
    return list(
        qs.values(
            "id",
            "name",
            "email",
            "communication_email",
            "phone_number",
            "phone_number_digits",
            "emergency_contact_phone_number",
            "emergency_contact_phone_number_digits",
            "microsoft_id",
            "is_active",
            "roles",
        )
    )
