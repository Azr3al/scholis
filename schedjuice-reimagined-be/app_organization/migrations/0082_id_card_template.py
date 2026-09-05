import app_organization.models
import django.db.models.deletion
from django.db import migrations, models

import schedjuice_backend.storages


class Migration(migrations.Migration):
    dependencies = [
        ("app_organization", "0081_organization_is_telegram_login_on"),
    ]

    operations = [
        migrations.CreateModel(
            name="IdCardTemplate",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("name", models.CharField(max_length=256)),
                (
                    "audience",
                    models.CharField(
                        choices=[("student", "Student"), ("staff", "Staff")],
                        max_length=16,
                    ),
                ),
                ("width_in", models.DecimalField(decimal_places=3, max_digits=6)),
                ("height_in", models.DecimalField(decimal_places=3, max_digits=6)),
                (
                    "background",
                    models.ImageField(
                        storage=schedjuice_backend.storages.PublicMediaStorage(),
                        upload_to=app_organization.models.get_upload_to_path_for_id_card_templates,
                    ),
                ),
                ("slots", models.JSONField(default=list)),
                (
                    "academic_year",
                    models.CharField(blank=True, max_length=64, null=True),
                ),
                ("expires_on", models.DateField(blank=True, null=True)),
                (
                    "organization",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="id_card_templates",
                        to="app_organization.organization",
                    ),
                ),
            ],
        ),
        migrations.AddConstraint(
            model_name="idcardtemplate",
            constraint=models.UniqueConstraint(
                fields=("organization", "name", "audience"),
                name="uniq_id_card_template_org_name_audience",
            ),
        ),
        migrations.AddField(
            model_name="organization",
            name="active_staff_id_card_template",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to="app_organization.idcardtemplate",
            ),
        ),
        migrations.AddField(
            model_name="organization",
            name="active_student_id_card_template",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to="app_organization.idcardtemplate",
            ),
        ),
    ]
