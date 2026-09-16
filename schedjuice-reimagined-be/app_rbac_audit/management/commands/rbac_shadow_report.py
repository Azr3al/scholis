# app_rbac_audit/management/commands/rbac_shadow_report.py
from __future__ import annotations
import json, os
from django.core.management.base import BaseCommand
from app_rbac_audit.models import ShadowDenial

OUT_DIR = os.path.join("var", "rbac")


def build_report():
    rows = list(
        ShadowDenial.objects.order_by("-hit_count").values(
            "schema_name", "view_name", "path_pattern", "method",
            "missing_codes", "role_signature", "legacy_allowed", "hit_count",
        )
    )
    return rows


def _write_md(rows, path):
    lines = ["# RBAC shadow-denial report", "", f"Total distinct gaps: {len(rows)}", ""]
    for r in rows:
        lines.append(
            f"- `{r['method']} {r['path_pattern']}` ({r['view_name']}) — roles "
            f"`{r['role_signature']}` missing `{', '.join(r['missing_codes'])}` "
            f"(hits: {r['hit_count']}, legacy_allowed: {r['legacy_allowed']})"
        )
    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")


class Command(BaseCommand):
    help = "Export RBAC shadow-denials to var/rbac/shadow-denials.{jsonl,md} for agent review."

    def handle(self, *args, **opts):
        os.makedirs(OUT_DIR, exist_ok=True)
        rows = build_report()
        with open(os.path.join(OUT_DIR, "shadow-denials.jsonl"), "w") as f:
            for r in rows:
                f.write(json.dumps(r) + "\n")
        _write_md(rows, os.path.join(OUT_DIR, "shadow-denials.md"))
        self.stdout.write(self.style.SUCCESS(f"Wrote {len(rows)} gaps to {OUT_DIR}/"))
