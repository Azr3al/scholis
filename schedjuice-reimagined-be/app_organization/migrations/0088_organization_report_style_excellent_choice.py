from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app_organization", "0087_organization_is_substitute_teachers_enabled"),
    ]

    operations = [
        migrations.AlterField(
            model_name="organization",
            name="report_style",
            field=models.CharField(
                blank=True,
                choices=[
                    ("TR_SU_STYLE", "TR_SU_STYLE"),
                    ("TR_PHILLIPS_STYLE", "TR_PHILLIPS_STYLE"),
                    (
                        "EXCELLENT_CHOICE_STYLE",
                        "EXCELLENT_CHOICE_STYLE",
                    ),
                ],
                max_length=40,
                null=True,
            ),
        ),
    ]
