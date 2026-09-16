import app_organization.models
from django.db import migrations, models

import schedjuice_backend.storages


class Migration(migrations.Migration):
    dependencies = [
        ("app_organization", "0082_id_card_template"),
    ]

    operations = [
        migrations.AddField(
            model_name="idcardtemplate",
            name="back_background",
            field=models.ImageField(
                blank=True,
                null=True,
                storage=schedjuice_backend.storages.PublicMediaStorage(),
                upload_to=app_organization.models.get_upload_to_path_for_id_card_templates,
            ),
        ),
        migrations.AddField(
            model_name="idcardtemplate",
            name="back_slots",
            field=models.JSONField(default=list),
        ),
    ]
