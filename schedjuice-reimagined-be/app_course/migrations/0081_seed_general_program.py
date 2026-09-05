from django.db import migrations


def seed_general_program(apps, schema_editor):
    Program = apps.get_model("app_course", "Program")
    Course = apps.get_model("app_course", "Course")
    program, _ = Program.objects.get_or_create(
        name="General",
        defaults={
            "description": "Default program for courses not assigned to a specific curriculum.",
            "course_creation_method": "manual",
            "subject_strategy": "optional",
            "is_default": True,
            "is_protected": True,
            "is_active": True,
        },
    )
    if not program.is_default or not program.is_protected:
        Program.objects.filter(pk=program.pk).update(
            is_default=True, is_protected=True
        )
    Course.objects.filter(program_id__isnull=True).update(program_id=program.id)


def reverse_seed(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("app_course", "0080_program_intake_models"),
    ]

    operations = [
        migrations.RunPython(seed_general_program, reverse_seed),
    ]
