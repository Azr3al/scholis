# Subject model and Course fields: subject, exam_intake, exam_board

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("app_course", "0066_userattendance_attendance_date"),
    ]

    operations = [
        migrations.CreateModel(
            name="Subject",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("name", models.CharField(max_length=512, unique=True)),
                ("description", models.TextField(blank=True, null=True)),
            ],
            options={
                "abstract": False,
            },
        ),
        migrations.AddField(
            model_name="course",
            name="subject",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="courses",
                to="app_course.subject",
            ),
        ),
        migrations.AddField(
            model_name="course",
            name="exam_intake",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="course",
            name="exam_board",
            field=models.CharField(
                blank=True,
                choices=[("EdExcel", "EdExcel"), ("CIE", "CIE")],
                max_length=16,
                null=True,
            ),
        ),
    ]
