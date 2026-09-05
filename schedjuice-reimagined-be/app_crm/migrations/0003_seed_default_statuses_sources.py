from django.db import migrations

STATUSES = [
    ("New inquiry", "#64748b", 1, "NORMAL", True),
    ("Contacted", "#0ea5e9", 2, "NORMAL", False),
    ("Appointment booked", "#8b5cf6", 3, "APPOINTMENT", False),
    ("Consulted/Tested", "#f59e0b", 4, "NORMAL", False),
    ("Student", "#10b981", 5, "CONVERTED", False),
    ("Lost", "#ef4444", 6, "LOST", False),
]
SOURCES = [
    "Facebook page DM",
    "Facebook page comment",
    "Instagram DM/comment",
    "TikTok DM/comment",
    "Walk-in",
    "Referral",
    "Other",
]


def seed(apps, schema_editor):
    LeadStatus = apps.get_model("app_crm", "LeadStatus")
    LeadSource = apps.get_model("app_crm", "LeadSource")
    if LeadStatus.objects.exists() or LeadSource.objects.exists():
        return
    for name, color, order, behavior, is_default in STATUSES:
        LeadStatus.objects.create(
            name=name,
            color=color,
            order=order,
            behavior=behavior,
            is_default=is_default,
        )
    for name in SOURCES:
        LeadSource.objects.create(name=name)


def unseed(apps, schema_editor):
    apps.get_model("app_crm", "LeadStatus").objects.all().delete()
    apps.get_model("app_crm", "LeadSource").objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ("app_crm", "0002_seed_crm_permissions"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
