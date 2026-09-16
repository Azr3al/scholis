from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_course", "0112_usercourse_billing_cycle_anchor_date"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="usercourse",
            index=models.Index(
                fields=["course", "assigned_as"],
                name="usercourse_open_course_role",
                condition=models.Q(left_at__isnull=True),
            ),
        ),
    ]
