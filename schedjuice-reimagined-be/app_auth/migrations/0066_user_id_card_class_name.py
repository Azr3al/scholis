from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_auth", "0065_user_id_photo_thumb"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="id_card_class_name",
            field=models.CharField(blank=True, max_length=512, null=True),
        ),
    ]
