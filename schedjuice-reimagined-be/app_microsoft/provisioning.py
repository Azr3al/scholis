"""Shared Microsoft provisioning service for users and courses.

Centralizes the logic used by:
  - per-record recovery endpoints (edit pages),
  - existing-object linking endpoints,
  - bulk repair dry-run + async repair jobs.

Provisioning is idempotent: if the local record already has its Microsoft id,
the functions report ``already_linked`` instead of creating duplicates.
"""

from __future__ import annotations

import logging
import random

from app_auth.models import User
from app_auth.microsoft_display_name import resolve_microsoft_display_name
from app_course.models import Course
from app_microsoft.flows import CreateUserFlow
from app_microsoft.graph_wrapper.group import MSGroup
from app_microsoft.graph_wrapper.license import assert_license_available_for_user_type
from app_microsoft.graph_wrapper.user import MSUser
from rest_framework.exceptions import ValidationError
from app_microsoft.team_provisioning_helpers import provision_course_team
from app_organization.domain_utils import (
    email_domain_allowed,
    get_organization_approved_domains,
)
from app_organization.acca_spreadsheet_import import IMPORT_PASSWORD

logger = logging.getLogger(__name__)

# Candidate statuses (also used by the bulk repair UI).
STATUS_READY = "ready"
STATUS_ALREADY_LINKED = "already_linked"
STATUS_INVALID_DOMAIN = "invalid_domain"
STATUS_MISSING_LICENSE = "missing_license"
STATUS_UNLICENSED = "unlicensed"
STATUS_READY_LICENSE = "ready_license"
STATUS_MISSING_OWNER = "missing_owner"
STATUS_MISSING_CONFIG = "missing_config"
STATUS_TEAMS_DISABLED = "teams_disabled"
STATUS_MICROSOFT_OFF = "microsoft_off"

# Statuses that mean "we can attempt a create right now".
REPAIRABLE_STATUSES = frozenset({STATUS_READY})
REPAIRABLE_LICENSE_STATUSES = frozenset({STATUS_READY_LICENSE})


def _generate_initial_password() -> str:
    """Strong throwaway password; create() forces a reset on first sign-in."""
    password = ""
    for _ in range(3):
        password += random.choice("abcdefghijklmnopqrstuvwxyz")
        password += random.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
        password += random.choice("0987654321")
        password += random.choice("!@#$%^")
    return password


def user_type_for_roles(roles) -> str:
    roles = roles or []
    if len(roles) == 1 and User.UserRole.STUDENT in roles:
        return "student"
    return "staff"


def tenant_microsoft_config_blockers(tenant) -> list[str]:
    """Human-readable list of missing tenant-level Microsoft credentials."""
    blockers: list[str] = []
    if not getattr(tenant, "is_microsoft_on", False):
        blockers.append("Microsoft integration is off for this organization.")
    if not getattr(tenant, "app_id", None):
        blockers.append("Missing Microsoft app_id.")
    if not getattr(tenant, "authority", None):
        blockers.append("Missing Microsoft authority.")
    if not getattr(tenant, "private_key", None):
        blockers.append("Missing Microsoft certificate (private key).")
    return blockers


def _license_for_user_type(tenant, user_type: str) -> str | None:
    if user_type == "student":
        return getattr(tenant, "student_license_id", None)
    return getattr(tenant, "staff_license_id", None)


def evaluate_user_candidate(user: User, tenant, approved_domains=None) -> dict:
    """Classify whether a single user can have a Microsoft account created."""
    if approved_domains is None:
        approved_domains = get_organization_approved_domains(tenant)

    info = {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "microsoft_id": user.microsoft_id,
    }

    if not getattr(tenant, "is_microsoft_on", False):
        return {**info, "status": STATUS_MICROSOFT_OFF,
                "detail": "Microsoft integration is off."}
    if user.microsoft_id:
        return {**info, "status": STATUS_ALREADY_LINKED,
                "detail": "Already linked to Microsoft."}
    if not email_domain_allowed(user.email or "", approved_domains):
        return {
            **info,
            "status": STATUS_INVALID_DOMAIN,
            "detail": (
                "Email domain is not in the approved list: "
                f"{', '.join(approved_domains) if approved_domains else '(none configured)'}"
            ),
        }
    user_type = user_type_for_roles(user.roles)
    if not _license_for_user_type(tenant, user_type):
        return {
            **info,
            "status": STATUS_MISSING_LICENSE,
            "detail": f"No {user_type} license configured for this organization.",
        }
    return {**info, "status": STATUS_READY, "detail": "Ready to provision."}


def evaluate_course_candidate(course: Course, tenant) -> dict:
    """Classify whether a single course can have a Microsoft Team created."""
    info = {
        "id": course.id,
        "title": course.title,
        "microsoft_group_id": course.microsoft_group_id,
    }
    if not getattr(tenant, "is_microsoft_on", False):
        return {**info, "status": STATUS_MICROSOFT_OFF,
                "detail": "Microsoft integration is off."}
    if not getattr(tenant, "is_teams_creation_enabled", True):
        return {**info, "status": STATUS_TEAMS_DISABLED,
                "detail": "Teams creation is disabled for this organization."}
    if course.microsoft_group_id:
        return {**info, "status": STATUS_ALREADY_LINKED,
                "detail": "Already linked to a Microsoft Team."}
    if not getattr(tenant, "default_owner_id", None):
        return {**info, "status": STATUS_MISSING_OWNER,
                "detail": "No default team owner (default_owner_id) configured."}
    return {**info, "status": STATUS_READY, "detail": "Ready to provision."}


def evaluate_unlicensed_user_candidate(user: User, tenant) -> dict:
    """Classify whether a linked-but-unlicensed user can receive a license."""
    info = {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "microsoft_id": user.microsoft_id,
    }

    if not getattr(tenant, "is_microsoft_on", False):
        return {
            **info,
            "status": STATUS_MICROSOFT_OFF,
            "detail": "Microsoft integration is off.",
        }
    if not user.microsoft_id:
        return {
            **info,
            "status": STATUS_ALREADY_LINKED,
            "detail": "No Microsoft account linked.",
        }
    if getattr(user, "microsoft_license_assigned", True):
        return {
            **info,
            "status": STATUS_ALREADY_LINKED,
            "detail": "License already assigned.",
        }

    user_type = user_type_for_roles(user.roles)
    if not _license_for_user_type(tenant, user_type):
        return {
            **info,
            "status": STATUS_MISSING_LICENSE,
            "detail": f"No {user_type} license configured for this organization.",
        }
    return {
        **info,
        "status": STATUS_READY_LICENSE,
        "detail": "Ready to assign license.",
    }


def assign_license_to_user(user: User, tenant) -> dict:
    """Assign a Microsoft license to an existing linked user."""
    if not user.microsoft_id:
        raise ValidationError("User has no Microsoft account linked.")
    if getattr(user, "microsoft_license_assigned", True):
        return {
            "status": STATUS_ALREADY_LINKED,
            "microsoft_id": user.microsoft_id,
        }

    user_type = user_type_for_roles(user.roles)
    assert_license_available_for_user_type(tenant, user_type)
    license_id = _license_for_user_type(tenant, user_type)

    ms_user = MSUser(tenant)
    res = ms_user.assign_license(
        user.microsoft_id, license_id, ensure_usage_location=True
    )
    if res.status_code not in range(199, 300):
        raise ValidationError(
            {
                "MS_ERROR": res.json(),
                "step": "license assignment",
                "license_blocked": True,
            }
        )

    user.microsoft_license_assigned = True
    user.save(update_fields=["microsoft_license_assigned"])
    return {"status": "licensed", "microsoft_id": user.microsoft_id}


def provision_user_account(user: User, tenant, *, assign_license: bool = True) -> dict:
    """Create + link a Microsoft account for a user. Idempotent.

    Raises MicrosoftAlreadyExistsError when Entra reports the account exists
    (caller should route to linking). Other Graph failures raise ValidationError.
    """
    if user.microsoft_id:
        return {"status": STATUS_ALREADY_LINKED, "microsoft_id": user.microsoft_id}

    user_type = user_type_for_roles(user.roles)
    # Import and other default-password onboarding paths store IMPORT_PASSWORD locally;
    # use the same value in Entra so Microsoft sign-in matches communicated credentials.
    check_password = getattr(user, "check_password", None)
    if callable(check_password) and check_password(IMPORT_PASSWORD):
        password = IMPORT_PASSWORD
    else:
        # Edit-page / bulk recovery has no human-entered password: generate a strong
        # one. create() sets forceChangePasswordNextSignIn, so the user resets on first login.
        password = _generate_initial_password()
    flow = CreateUserFlow(
        user.email,
        password,
        user_type,
        resolve_microsoft_display_name(
            raw=getattr(user, "microsoft_display_name", None),
            name=user.name or "",
        ),
        tenant,
        assign_license=assign_license,
    )
    microsoft_id = flow.start()
    user.microsoft_id = microsoft_id
    user.microsoft_license_assigned = assign_license
    user.save(update_fields=["microsoft_id", "microsoft_license_assigned"])
    return {"status": "created", "microsoft_id": microsoft_id}


def link_user_account(user: User, tenant, identifier: str) -> dict:
    """Link an existing Microsoft account (by object id or UPN/email) to a user."""
    identifier = (identifier or "").strip()
    if not identifier:
        raise ValueError("A Microsoft object id or UPN is required.")
    if user.microsoft_id:
        return {"status": STATUS_ALREADY_LINKED, "microsoft_id": user.microsoft_id}

    approved_domains = get_organization_approved_domains(tenant)
    if not email_domain_allowed(user.email or "", approved_domains):
        raise ValueError(
            "User email domain is not in the approved list: "
            f"{', '.join(approved_domains) if approved_domains else '(none configured)'}"
        )

    ms_user = MSUser(tenant)
    res = ms_user.find_by_upn(identifier)
    if res.status_code not in range(199, 300):
        raise ValueError(
            "Could not find a Microsoft account for the provided identifier "
            f"(HTTP {res.status_code})."
        )
    body = res.json()
    microsoft_id = body.get("id")
    if not microsoft_id:
        raise ValueError("Microsoft response did not include an object id.")

    # Guard against linking an object already owned by another local user.
    clash = (
        User.objects.filter(microsoft_id=microsoft_id)
        .exclude(pk=user.pk)
        .first()
    )
    if clash is not None:
        raise ValueError(
            f"That Microsoft account is already linked to {clash.email}."
        )

    user.microsoft_id = microsoft_id
    display_name = (body.get("displayName") or "").strip()
    if display_name:
        from app_auth.microsoft_display_name import (
            MS_DISPLAY_NAME_MAX_LENGTH,
        )

        user.microsoft_display_name = display_name[:MS_DISPLAY_NAME_MAX_LENGTH]
        user.save(update_fields=["microsoft_id", "microsoft_display_name"])
    else:
        user.save(update_fields=["microsoft_id"])
    return {"status": "linked", "microsoft_id": microsoft_id}


def _candidate_from_graph_user(body: dict, match_type: str) -> dict | None:
    microsoft_id = body.get("id")
    if not microsoft_id:
        return None
    return {
        "microsoft_id": microsoft_id,
        "display_name": body.get("displayName") or "",
        "user_principal_name": body.get("userPrincipalName") or "",
        "mail": body.get("mail") or "",
        "match_type": match_type,
    }


def suggest_microsoft_matches(user: User, tenant, query: str | None = None) -> list[dict]:
    """Return linkable Microsoft account suggestions for a local user."""
    if user.microsoft_id:
        return []

    query = (query or user.email or "").strip()
    if not query:
        return []

    ms_user = MSUser(tenant)
    candidates: list[dict] = []
    seen_ids: set[str] = set()

    exact_res = ms_user.find_by_upn(query)
    if exact_res.status_code in range(199, 300):
        cand = _candidate_from_graph_user(exact_res.json(), "exact_email")
        if cand:
            candidates.append(cand)
            seen_ids.add(cand["microsoft_id"])

    search_res = ms_user.search(query)
    if search_res.status_code not in range(199, 300):
        if not candidates:
            raise ValueError(
                "Could not search Microsoft accounts "
                f"(HTTP {search_res.status_code})."
            )
    else:
        for item in search_res.json().get("value") or []:
            cand = _candidate_from_graph_user(item, "search")
            if cand and cand["microsoft_id"] not in seen_ids:
                candidates.append(cand)
                seen_ids.add(cand["microsoft_id"])

    if not candidates:
        return []

    linked_ids = set(
        User.objects.filter(microsoft_id__in=seen_ids).values_list(
            "microsoft_id", flat=True
        )
    )
    return [c for c in candidates if c["microsoft_id"] not in linked_ids]


def provision_course_team_for(course: Course, tenant) -> dict:
    """Create + link a Microsoft Team for a course. Idempotent."""
    if course.microsoft_group_id:
        return {"status": STATUS_ALREADY_LINKED,
                "microsoft_group_id": course.microsoft_group_id}
    provision_course_team(course, tenant)
    course.refresh_from_db(fields=["microsoft_group_id", "microsoft_channel_id"])
    return {"status": "created", "microsoft_group_id": course.microsoft_group_id}


def link_course_team(course: Course, tenant, group_id: str) -> dict:
    """Link an existing Microsoft group/team to a course."""
    group_id = (group_id or "").strip()
    if not group_id:
        raise ValueError("A Microsoft group/team id is required.")
    if course.microsoft_group_id:
        return {"status": STATUS_ALREADY_LINKED,
                "microsoft_group_id": course.microsoft_group_id}

    clash = (
        Course.objects.filter(microsoft_group_id=group_id)
        .exclude(pk=course.pk)
        .first()
    )
    if clash is not None:
        raise ValueError(
            f"That Microsoft Team is already linked to course #{clash.id}."
        )

    res = MSGroup(tenant).get(group_id)
    if res.status_code not in range(199, 300):
        raise ValueError(
            f"Could not find a Microsoft group for the provided id (HTTP {res.status_code})."
        )

    course.microsoft_group_id = group_id
    course.save(update_fields=["microsoft_group_id"])
    return {"status": "linked", "microsoft_group_id": group_id}
