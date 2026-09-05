from django.db import migrations

STATUSES = [
    ("Open", "#64748b", 0, "NORMAL", True),
    ("In progress", "#2563eb", 1, "NORMAL", False),
    ("Done", "#16a34a", 2, "DONE", False),
    ("Cancelled", "#94a3b8", 3, "CANCELLED", False),
]


def seed(apps, schema_editor):
    IssueStatus = apps.get_model("app_crm", "IssueStatus")
    if IssueStatus.objects.exists():
        return
    for name, color, order, behavior, is_default in STATUSES:
        IssueStatus.objects.create(
            name=name,
            color=color,
            order=order,
            behavior=behavior,
            is_default=is_default,
        )


def unseed(apps, schema_editor):
    apps.get_model("app_crm", "IssueStatus").objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ("app_crm", "0006_seed_issue_permissions"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
