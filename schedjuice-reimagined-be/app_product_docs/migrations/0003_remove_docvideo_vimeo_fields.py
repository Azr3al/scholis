from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("app_product_docs", "0002_docvideo_video_url"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="docvideo",
            name="vimeo_id",
        ),
        migrations.RemoveField(
            model_name="docvideo",
            name="vimeo_uri",
        ),
    ]
