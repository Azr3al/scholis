from __future__ import annotations

from datetime import date
from typing import Any

from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_demo.config import ResolvedDemoConfig
from app_rbac.seeding import seed_rbac

DEMO_PASSWORD = "Demo12345!"

_DEMO_ACCOUNTS_SPEC = [
    ("demo-admin", "Demo Admin", User.UserRole.ADMIN),
    ("demo-finance", "Demo Finance", User.UserRole.FINANCE),
    ("demo-teacher", "Demo Teacher", User.UserRole.TEACHER),
    ("demo-student", "Demo Student", User.UserRole.STUDENT),
]


def expected_demo_accounts(domain_url: str) -> dict[str, Any]:
    account_rows = [
        {
            "email": f"{local_part}@{domain_url}",
            "role": role,
            "name": display_name,
        }
        for local_part, display_name, role in _DEMO_ACCOUNTS_SPEC
    ]
    return {
        "password": DEMO_PASSWORD,
        "accounts": account_rows,
        "dev_tenant_domain_hint": f"DEV_TENANT_DOMAIN={domain_url}",
    }


def _upsert_account(
    *,
    email: str,
    name: str,
    role: str,
    code: str,
) -> User:
    defaults = {
        "name": name,
        "phone_number": "-",
        "communication_email": email,
        "date_of_birth": date(1990, 1, 1),
        "roles": [role],
        "is_active": True,
        "is_password_change_required": False,
        "code": code,
    }
    user = User.objects.filter(email=email).first()
    if user is None:
        return User.objects.create_user(
            email=email,
            password=DEMO_PASSWORD,
            **defaults,
        )

    update_fields: list[str] = []
    for field, value in defaults.items():
        if getattr(user, field) != value:
            setattr(user, field, value)
            update_fields.append(field)
    user.set_password(DEMO_PASSWORD)
    update_fields.append("password")
    update_fields.append("updated_at")
    user.save(update_fields=list(dict.fromkeys(update_fields)))
    return user


def seed_demo_accounts(*, schema_name: str, config: ResolvedDemoConfig) -> dict[str, Any]:
    with schema_context(schema_name):
        seed_rbac()
        account_rows: list[dict[str, str]] = []
        for local_part, display_name, role in _DEMO_ACCOUNTS_SPEC:
            code = local_part
            email = f"{local_part}@{config.domain_url}"
            user = _upsert_account(email=email, name=display_name, role=role, code=code)
            account_rows.append(
                {
                    "email": user.email,
                    "role": role,
                    "name": user.name,
                }
            )

    return {
        "password": DEMO_PASSWORD,
        "accounts": account_rows,
    }
