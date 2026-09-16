from django.db import migrations

AWARD_TITLE_GRANTS = {
    "admin": ["award_title.manage"],
    "manager": ["award_title.manage"],
}


def grant(apps, schema_editor):
    Role = apps.get_model("app_rbac", "Role")
    RolePermission = apps.get_model("app_rbac", "RolePermission")
    for slug, codes in AWARD_TITLE_GRANTS.items():
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
    all_codes = {code for codes in AWARD_TITLE_GRANTS.values() for code in codes}
    RolePermission.objects.filter(permission_code__in=all_codes).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("app_awards", "0001_initial"),
        # Roles must exist before granting; without this edge app_awards runs before
        # app_rbac on fresh tenant schemas and apps.get_model("app_rbac", ...) fails.
        ("app_rbac", "0002_seed_roles"),
    ]

    operations = [
        migrations.RunPython(grant, ungrant),
    ]
