from django.db import migrations

ISSUE_GRANTS = {
    "admin": [
        "issue.view",
        "issue.create",
        "issue.update",
        "issue.delete",
        "issue.configure",
    ],
    "manager": [
        "issue.view",
        "issue.create",
        "issue.update",
        "issue.delete",
        "issue.configure",
    ],
    "teacher": ["issue.view"],
}


def grant_issue_permissions(apps, schema_editor):
    Role = apps.get_model("app_rbac", "Role")
    RolePermission = apps.get_model("app_rbac", "RolePermission")
    for slug, codes in ISSUE_GRANTS.items():
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


def remove_issue_permissions(apps, schema_editor):
    RolePermission = apps.get_model("app_rbac", "RolePermission")
    all_codes = {code for codes in ISSUE_GRANTS.values() for code in codes}
    RolePermission.objects.filter(permission_code__in=all_codes).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("app_crm", "0005_issues_initial"),
        ("app_rbac", "0015_attendance_correct_own_checkin"),
    ]

    operations = [
        migrations.RunPython(grant_issue_permissions, remove_issue_permissions),
    ]
