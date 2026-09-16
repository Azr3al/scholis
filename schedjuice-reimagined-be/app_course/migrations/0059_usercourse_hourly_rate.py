# Generated manually for UserCourse.hourly_rate (course-specific rates)

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_course", "0058_payment_assignment"),
    ]

    operations = [
        migrations.AddField(
            model_name="usercourse",
            name="hourly_rate",
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text="Course-specific hourly rate for this teacher. Overrides User.per_hour_rate when org supports it.",
                max_digits=12,
                null=True,
            ),
        ),
    ]
