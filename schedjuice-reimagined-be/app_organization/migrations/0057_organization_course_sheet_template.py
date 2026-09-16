from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_organization", "0056_organization_payroll_calculation_strategy"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="course_sheet_template",
            field=models.CharField(
                blank=True,
                choices=[("teacher_su", "Teacher Su")],
                default=None,
                help_text="Layout template for the Course Data sheet shortcut. Null hides the shortcut.",
                max_length=32,
                null=True,
            ),
        ),
    ]
