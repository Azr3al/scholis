# Generated manually for User.course_rates

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_auth", "0038_user_student_bonus_hourly_rate"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="course_rates",
            field=models.JSONField(
                blank=True,
                help_text="Category-specific rates: { category_id: rate }. Used to auto-set UserCourse.hourly_rate on create.",
                null=True,
            ),
        ),
    ]
