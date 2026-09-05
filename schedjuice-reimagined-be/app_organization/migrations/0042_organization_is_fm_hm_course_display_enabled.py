from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_organization", "0041_graphsubscription"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="is_fm_hm_course_display_enabled",
            field=models.BooleanField(
                default=False,
                help_text="When True, FM/HM (full-month vs half-month) filters can apply to payment and unpaid summaries.",
            ),
        ),
    ]
