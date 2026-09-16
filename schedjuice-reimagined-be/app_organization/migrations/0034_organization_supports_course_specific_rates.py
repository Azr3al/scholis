# Generated manually for Organization.supports_course_specific_rates

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_organization", "0033_organization_report_style"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="supports_course_specific_rates",
            field=models.BooleanField(
                default=False,
                help_text="When True, use UserCourse.hourly_rate when set; otherwise fall back to User.per_hour_rate.",
            ),
        ),
    ]
