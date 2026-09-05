from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_ai", "0007_aiuserusagemonthly"),
    ]

    operations = [
        migrations.AddField(
            model_name="aiusagelog",
            name="cache_write_tokens",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="aiuserusagemonthly",
            name="cache_write_tokens",
            field=models.PositiveBigIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="aitenantusagemonthly",
            name="cache_write_tokens",
            field=models.PositiveBigIntegerField(default=0),
        ),
    ]
