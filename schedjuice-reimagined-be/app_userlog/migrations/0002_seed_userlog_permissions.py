from django.db import migrations

USERLOG_GRANTS = {
    "admin": [
        "userlog.view",
        "userlog.create",
        "userlog.update",
        "userlog.delete",
        "userlog.manage",
        "userlog.configure",
    ],
    "manager": [
        "userlog.view",
        "userlog.create",
        "userlog.update",
        "userlog.delete",
        "userlog.manage",
        "userlog.configure",
    ],
    "teacher": [
        "userlog.view",
        "userlog.create",
        "userlog.update",
        "userlog.delete",
    ],
}


def grant(apps, schema_editor):
    Role = apps.get_model("app_rbac", "Role")
    RolePermission = apps.get_model("app_rbac", "RolePermission")
    for slug, codes in USERLOG_GRANTS.items():
        role = Role.objects.filter(slug=slug).first()
        if not role:
            continue
        existing = set(
            RolePermission.objects.filter(role=role).values_list(
                "permission_code", flat=True
            )
        )
        RolePermission.objects.bulk_create(
            [
                RolePermission(role=role, permission_code=code)
                for code in codes
                if code not in existing
            ]
        )


def ungrant(apps, schema_editor):
    RolePermission = apps.get_model("app_rbac", "RolePermission")
    all_codes = {code for codes in USERLOG_GRANTS.values() for code in codes}
    RolePermission.objects.filter(permission_code__in=all_codes).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("app_userlog", "0001_initial"),
        ("app_crm", "0002_seed_crm_permissions"),
    ]

    operations = [
        migrations.RunPython(grant, ungrant),
    ]
