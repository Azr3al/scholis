# Set default for course_fields: all Course columns except subject, exam_intake, exam_board

import django.contrib.postgres.fields
from django.db import migrations, models


def get_default_course_fields():
    """All Course columns except subject, exam_intake, exam_board."""
    from django.apps import apps
    Course = apps.get_model("app_course", "Course")
    exclude = {"subject", "exam_intake", "exam_board"}
    return [
        f.name
        for f in Course._meta.get_fields()
        if f.name not in exclude and not getattr(f, "auto_created", False)
    ]


def backfill_course_fields(apps, schema_editor):
    Organization = apps.get_model("app_organization", "Organization")
    Course = apps.get_model("app_course", "Course")
    exclude = {"subject", "exam_intake", "exam_board"}
    default_fields = [
        f.name
        for f in Course._meta.get_fields()
        if f.name not in exclude and not getattr(f, "auto_created", False)
    ]
    Organization.objects.filter(course_fields__isnull=True).update(
        course_fields=default_fields
    )


def backfill_course_fields_reverse(apps, schema_editor):
    """Set back to null for orgs that were backfilled (best-effort)."""
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("app_organization", "0037_organization_course_fields"),
        ("app_course", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(backfill_course_fields, backfill_course_fields_reverse),
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
