from django.contrib.postgres.indexes import GinIndex
from django.db import migrations, models
from django.db.models import BooleanField, ExpressionWrapper
from django.db.models.expressions import RawSQL


class Migration(migrations.Migration):

    dependencies = [
        ("app_auth", "0042_user_zoom_user_identifier"),
        ("app_custom_fields", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="custom_data",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddIndex(
            model_name="user",
            index=GinIndex(
                fields=["custom_data"],
                name="auth_user_custom_data_gin",
                opclasses=["jsonb_path_ops"],
            ),
        ),
        migrations.AddConstraint(
            model_name="user",
            constraint=models.CheckConstraint(
                check=ExpressionWrapper(
                    RawSQL("jsonb_typeof(custom_data) = 'object'", []),
                    output_field=BooleanField(),
                ),
                name="app_auth_user_custom_data_is_object",
            ),
        ),
    ]
