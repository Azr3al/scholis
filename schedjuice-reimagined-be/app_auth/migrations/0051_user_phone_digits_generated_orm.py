from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Align ORM state with Postgres GENERATED STORED columns.

    No database_operations: altering null/default on generated columns via ALTER
    would be invalid; only Django's model state must change so INSERT omits these fields.
    """

    dependencies = [
        ("app_auth", "0050_repair_user_search_state"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.AlterField(
                    model_name="user",
                    name="phone_number_digits",
                    field=models.TextField(blank=True, editable=False, null=True),
                ),
                migrations.AlterField(
                    model_name="user",
                    name="emergency_contact_phone_number_digits",
                    field=models.TextField(blank=True, editable=False, null=True),
                ),
            ],
        ),
    ]
