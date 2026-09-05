from __future__ import annotations

SKIP_API_PREFIXES = (
    "/api/v1/health",
    "/api/v1/admin",
)


def should_track_api_path(path: str, method: str = "GET") -> bool:
    if method == "OPTIONS":
        return False
    if not path.startswith("/api/v1/"):
        return False
    if path.startswith("/silk/"):
        return False
    return not any(path.startswith(p) for p in SKIP_API_PREFIXES)


def resolve_route_template(request) -> str:
    match = getattr(request, "resolver_match", None)
    if match and getattr(match, "route", None):
        return str(match.route)
    path = getattr(request, "path", "") or ""
    if path.startswith("/api/v1/"):
        return path[len("/api/v1/") :].lstrip("/") or "root"
    return path.lstrip("/") or "root"
