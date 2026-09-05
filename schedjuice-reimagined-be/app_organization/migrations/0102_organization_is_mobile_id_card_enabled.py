from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app_organization", "0101_organization_student_dm_contact_user_id"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="is_mobile_id_card_enabled",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "When True, the mobile app digital ID page renders the "
                    "organization's generated ID card instead of a plain QR code."
                ),
            ),
        ),
    ]
