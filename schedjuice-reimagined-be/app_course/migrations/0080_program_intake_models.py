# Programs, intakes, course program FKs, exam_intake rename

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("app_course", "0079_course_zoom_meeting_personal"),
    ]

    operations = [
        migrations.CreateModel(
            name="Program",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("name", models.CharField(max_length=512, unique=True)),
                ("description", models.TextField(blank=True, null=True)),
                (
                    "course_creation_method",
                    models.CharField(
                        choices=[("manual", "manual"), ("intake_based", "intake_based")],
                        default="manual",
                        max_length=32,
                    ),
                ),
                (
                    "subject_strategy",
                    models.CharField(
                        choices=[
                            ("none", "none"),
                            ("optional", "optional"),
                            ("required", "required"),
                            ("multi", "multi"),
                        ],
                        default="optional",
                        max_length=32,
                    ),
                ),
                ("is_default", models.BooleanField(default=False)),
                ("is_protected", models.BooleanField(default=False)),
                ("is_active", models.BooleanField(default=True)),
            ],
            options={
                "ordering": ["name"],
            },
        ),
        migrations.CreateModel(
            name="ProgramLevel",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("name", models.CharField(max_length=512)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                ("default_capacity", models.PositiveIntegerField(blank=True, null=True)),
                ("is_active", models.BooleanField(default=True)),
                (
                    "default_category",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="program_levels",
                        to="app_course.category",
                    ),
                ),
                (
                    "program",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="levels",
                        to="app_course.program",
                    ),
                ),
            ],
            options={
                "ordering": ["sort_order", "name"],
            },
        ),
        migrations.AddConstraint(
            model_name="programlevel",
            constraint=models.UniqueConstraint(
                fields=("program", "name"), name="uniq_program_level_program_name"
            ),
        ),
        migrations.CreateModel(
            name="ProgramLevelSection",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("name", models.CharField(max_length=64)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                ("default_capacity", models.PositiveIntegerField(blank=True, null=True)),
                ("is_active", models.BooleanField(default=True)),
                (
                    "default_campus",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="program_level_sections",
                        to="app_course.campus",
                    ),
                ),
                (
                    "default_teacher",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="default_program_level_sections",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "level",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="sections",
                        to="app_course.programlevel",
                    ),
                ),
            ],
            options={
                "ordering": ["sort_order", "name"],
            },
        ),
        migrations.AddConstraint(
            model_name="programlevelsection",
            constraint=models.UniqueConstraint(
                fields=("level", "name"), name="uniq_program_level_section_level_name"
            ),
        ),
        migrations.CreateModel(
            name="Intake",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("name", models.CharField(max_length=512)),
                ("start_date", models.DateField()),
                ("end_date", models.DateField()),
                ("description", models.TextField(blank=True, default="")),
                (
                    "program",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="intakes",
                        to="app_course.program",
                    ),
                ),
            ],
            options={
                "ordering": ["-start_date", "name"],
            },
        ),
        migrations.AddConstraint(
            model_name="intake",
            constraint=models.UniqueConstraint(
                fields=("program", "name"), name="uniq_intake_program_name"
            ),
        ),
        migrations.CreateModel(
            name="ProgramSubject",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                ("is_active", models.BooleanField(default=True)),
                (
                    "program",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="program_subjects",
                        to="app_course.program",
                    ),
                ),
                (
                    "subject",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="program_subjects",
                        to="app_course.subject",
                    ),
                ),
            ],
            options={
                "ordering": ["sort_order", "id"],
            },
        ),
        migrations.AddConstraint(
            model_name="programsubject",
            constraint=models.UniqueConstraint(
                fields=("program", "subject"), name="uniq_program_subject_program_subject"
            ),
        ),
        migrations.RenameField(
            model_name="course",
            old_name="exam_intake",
            new_name="exam_session_date",
        ),
        migrations.AddField(
            model_name="course",
            name="program",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="courses",
                to="app_course.program",
            ),
        ),
        migrations.AddField(
            model_name="course",
            name="intake",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="courses",
                to="app_course.intake",
            ),
        ),
        migrations.AddField(
            model_name="course",
            name="level",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="courses",
                to="app_course.programlevel",
            ),
        ),
        migrations.AddField(
            model_name="course",
            name="section",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="courses",
                to="app_course.programlevelsection",
            ),
        ),
        migrations.CreateModel(
            name="CourseSubject",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                (
                    "course",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="course_subjects",
                        to="app_course.course",
                    ),
                ),
                (
                    "subject",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="course_subjects",
                        to="app_course.subject",
                    ),
                ),
            ],
            options={
                "ordering": ["sort_order", "id"],
            },
        ),
        migrations.AddConstraint(
            model_name="coursesubject",
            constraint=models.UniqueConstraint(
                fields=("course", "subject"), name="uniq_course_subject_course_subject"
            ),
        ),
    ]
