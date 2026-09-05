from django.db import migrations

CRM_GRANTS = {
    "admin": [
        "lead.view",
        "lead.create",
        "lead.update",
        "lead.delete",
        "crm.configure",
    ],
    "manager": [
        "lead.view",
        "lead.create",
        "lead.update",
        "lead.delete",
        "crm.configure",
    ],
    "teacher": ["lead.view"],
}


def grant_crm_permissions(apps, schema_editor):
    Role = apps.get_model("app_rbac", "Role")
    RolePermission = apps.get_model("app_rbac", "RolePermission")
    for slug, codes in CRM_GRANTS.items():
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


def remove_crm_permissions(apps, schema_editor):
    RolePermission = apps.get_model("app_rbac", "RolePermission")
    all_codes = {code for codes in CRM_GRANTS.values() for code in codes}
    RolePermission.objects.filter(permission_code__in=all_codes).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("app_crm", "0001_initial"),
        ("app_rbac", "0010_attendance_manage_all"),
    ]

    operations = [
        migrations.RunPython(grant_crm_permissions, remove_crm_permissions),
    ]
