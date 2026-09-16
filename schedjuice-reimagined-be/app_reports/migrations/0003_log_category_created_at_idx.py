from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_reports", "0002_log_category"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="log",
            index=models.Index(
                fields=["category", "created_at"],
                name="log_category_created_at_idx",
            ),
        ),
    ]
