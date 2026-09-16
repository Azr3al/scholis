# Backfill User.zoom_user_identifier from legacy UserAttendance.zoom_user_identifier, then drop column.

from django.db import migrations


def backfill_user_zoom_identifier(apps, schema_editor):
    UserAttendance = apps.get_model("app_course", "UserAttendance")
    User = apps.get_model("app_auth", "User")
    for row in (
        UserAttendance.objects.filter(source="zoom")
        .exclude(zoom_user_identifier__isnull=True)
        .exclude(zoom_user_identifier="")
        .values_list("user_id", "zoom_user_identifier")
        .distinct()
    ):
        user_id, zid = row
        if not user_id or not (zid or "").strip():
            continue
        u = User.objects.filter(pk=user_id).first()
        if not u:
            continue
        existing = (getattr(u, "zoom_user_identifier", None) or "").strip()
        if existing:
            continue
        User.objects.filter(pk=user_id).update(zoom_user_identifier=zid.strip())


class Migration(migrations.Migration):

    dependencies = [
        ("app_course", "0073_video_attendance_zoom_processed_video"),
        ("app_auth", "0042_user_zoom_user_identifier"),
    ]

    operations = [
        migrations.RunPython(backfill_user_zoom_identifier, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name="userattendance",
            name="zoom_user_identifier",
        ),
    ]
