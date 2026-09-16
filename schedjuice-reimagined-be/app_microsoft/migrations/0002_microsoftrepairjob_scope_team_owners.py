from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_microsoft", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="microsoftrepairjob",
            name="target_type",
            field=models.CharField(
                choices=[
                    ("users", "Users"),
                    ("courses", "Courses"),
                    ("unlicensed_users", "Unlicensed users"),
                    ("scope_team_owners", "Scope team owners"),
                ],
                max_length=32,
            ),
        ),
    ]
