"""Enable Teams attendance sync for existing Microsoft-enabled orgs (grandfather)."""

from django.db import migrations


def enable_teams_sync_for_microsoft_orgs(apps, schema_editor):
    Organization = apps.get_model("app_organization", "Organization")
    Organization.objects.filter(is_microsoft_on=True).update(
        is_teams_attendance_sync_enabled=True
    )


def disable_teams_sync_for_microsoft_orgs(apps, schema_editor):
    Organization = apps.get_model("app_organization", "Organization")
    Organization.objects.filter(is_microsoft_on=True).update(
        is_teams_attendance_sync_enabled=False
    )


class Migration(migrations.Migration):

    dependencies = [
        ("app_organization", "0068_organization_is_teams_attendance_sync_enabled"),
    ]

    operations = [
        migrations.RunPython(
            enable_teams_sync_for_microsoft_orgs,
            disable_teams_sync_for_microsoft_orgs,
        ),
    ]
