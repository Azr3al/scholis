from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_auth", "0060_user_per_session_rate"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="resigned_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="user",
            name="resignation_inform_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="user",
            name="resignation_last_working_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="user",
            name="resignation_type_of_pay",
            field=models.CharField(
                blank=True,
                choices=[
                    ("per_month", "Per Month"),
                    ("per_session", "Per Session"),
                    ("collaboration", "Collaboration Half/Half"),
                ],
                max_length=32,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="user",
            name="resignation_employment_type",
            field=models.CharField(
                blank=True,
                choices=[
                    ("part_time", "part_time"),
                    ("full_time", "full_time"),
                ],
                max_length=32,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="user",
            name="resignation_remark",
            field=models.TextField(blank=True, null=True),
        ),
    ]
