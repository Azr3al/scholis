from django.test import SimpleTestCase
from django.urls import get_resolver

from app_rbac_audit.management.commands.rbac_audit_routes import _walk

# Views intentionally exempt (documented). Keep this list tiny and reviewed.
KNOWN_EXEMPT: set[str] = set()

