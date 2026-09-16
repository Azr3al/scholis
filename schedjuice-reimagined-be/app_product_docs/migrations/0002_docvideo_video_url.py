from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_product_docs", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="docvideo",
            name="video_url",
            field=models.URLField(blank=True, default="", max_length=1024),
        ),
    ]
