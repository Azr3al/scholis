import django.contrib.postgres.fields
from django.db import migrations, models


def get_default_course_fields():
    from django.apps import apps

    Course = apps.get_model("app_course", "Course")
    exclude = {
        "subject",
        "exam_session_date",
        "exam_board",
        "program",
        "intake",
        "level",
        "section",
    }
    return [
        f.name
        for f in Course._meta.get_fields()
        if f.name not in exclude and not getattr(f, "auto_created", False)
    ]


def refresh_org_course_fields(apps, schema_editor):
    Organization = apps.get_model("app_organization", "Organization")
    Course = apps.get_model("app_course", "Course")
    exclude = {
        "subject",
        "exam_session_date",
        "exam_board",
        "program",
        "intake",
        "level",
        "section",
    }
    default_fields = [
        f.name
        for f in Course._meta.get_fields()
        if f.name not in exclude and not getattr(f, "auto_created", False)
    ]
    for org in Organization.objects.all().only("id", "course_fields"):
        fields = list(org.course_fields or [])
        if "exam_intake" in fields:
            fields = [
                "exam_session_date" if f == "exam_intake" else f for f in fields
            ]
        for rem in ("program", "intake", "level", "section"):
            if rem in fields:
                fields.remove(rem)
        for add in default_fields:
            if add not in fields and add not in exclude:
                fields.append(add)
        Organization.objects.filter(pk=org.pk).update(course_fields=fields)


def reverse_refresh(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("app_organization", "0046_zoom_account"),
        ("app_course", "0082_course_program_required"),
    ]

    operations = [
        migrations.RunPython(refresh_org_course_fields, reverse_refresh),
        migrations.AlterField(
            model_name="organization",
            name="course_fields",
            field=django.contrib.postgres.fields.ArrayField(
                base_field=models.CharField(max_length=64),
                blank=True,
                default=get_default_course_fields,
                null=True,
                size=None,
            ),
        ),
    ]
