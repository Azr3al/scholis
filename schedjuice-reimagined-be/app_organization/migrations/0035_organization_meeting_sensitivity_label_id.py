# Add meeting_sensitivity_label_id for restricting recording access to organizers and co-organizers

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_organization", "0034_organization_supports_course_specific_rates"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="meeting_sensitivity_label_id",
            field=models.CharField(
                blank=True,
                help_text="Sensitivity label ID that restricts recording access to organizers and co-organizers. "
                "Create in Microsoft Purview with 'Who has access to recording' = Organizers and co-organizers. "
                "Requires Teams Premium.",
                max_length=512,
                null=True,
            ),
        ),
    ]
