from __future__ import annotations
import json, os
from django.core.management.base import BaseCommand
from django.urls import get_resolver, URLPattern, URLResolver

OUT = os.path.join("var", "rbac", "route-audit.json")


def _walk(resolver, prefix=""):
    rows = []
    for p in resolver.url_patterns:
        if isinstance(p, URLResolver):
            rows += _walk(p, prefix + str(p.pattern))
        elif isinstance(p, URLPattern):
            view = getattr(p.callback, "view_class", None)
            cls = view.__name__ if view else getattr(p.callback, "__name__", "?")
            module = (view.__module__ if view else getattr(p.callback, "__module__", "?"))
            decided = bool(view and (getattr(view, "required_permissions", None) or getattr(view, "rbac_decision", None)))
            rows.append({
                "route": prefix + str(p.pattern),
                "view": cls,
                "module": module,
                "has_rbac_decision": decided,
            })
    return rows


class Command(BaseCommand):
    help = "Inventory all routes and whether each view declares an RBAC decision."

    def handle(self, *args, **opts):
        rows = _walk(get_resolver())
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        with open(OUT, "w") as f:
            json.dump(rows, f, indent=2)
        undecided = [r for r in rows if r["module"].startswith("app_") and not r["has_rbac_decision"]]
        self.stdout.write(f"{len(rows)} routes; {len(undecided)} app routes still undecided")
