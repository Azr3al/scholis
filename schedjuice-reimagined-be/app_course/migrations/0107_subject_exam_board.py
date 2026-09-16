from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_course", "0106_usercourse_substitute_auto_remove_on"),
    ]

    operations = [
        migrations.AddField(
            model_name="subject",
            name="exam_board",
            field=models.CharField(
                blank=True,
                choices=[("EdExcel", "EdExcel"), ("CIE", "CIE")],
                max_length=16,
                null=True,
            ),
        ),
    ]
