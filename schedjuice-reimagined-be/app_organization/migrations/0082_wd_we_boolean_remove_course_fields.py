from django.db import migrations, models


def migrate_course_fields_to_wd_we_boolean(apps, schema_editor):
    Organization = apps.get_model("app_organization", "Organization")
    for org in Organization.objects.all().only("id", "course_fields"):
        fields = org.course_fields or []
        enabled = "course_type" in fields
        Organization.objects.filter(pk=org.pk).update(
            is_wd_we_course_types_enabled=enabled
        )


def reverse_wd_we_boolean_to_course_fields(apps, schema_editor):
    Organization = apps.get_model("app_organization", "Organization")
    for org in Organization.objects.all().only("id", "is_wd_we_course_types_enabled"):
        fields = ["course_type"] if org.is_wd_we_course_types_enabled else []
        Organization.objects.filter(pk=org.pk).update(course_fields=fields or None)


class Migration(migrations.Migration):
    dependencies = [
        ("app_organization", "0081_organization_is_discount_eligibility_enabled"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="is_wd_we_course_types_enabled",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "When True, scheduling uses WD (Mon–Thu) and WE (Sat–Sun) course types "
                    "instead of individual weekday labels."
                ),
            ),
        ),
        migrations.RunPython(
            migrate_course_fields_to_wd_we_boolean,
            reverse_wd_we_boolean_to_course_fields,
        ),
        migrations.RemoveField(
            model_name="organization",
            name="course_fields",
        ),
    ]
