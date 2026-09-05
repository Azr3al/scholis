from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_announcement", "0015_announcement_post_type_finished_unit"),
    ]

    operations = [
        migrations.AddField(
            model_name="announcement",
            name="microsoft_teams_message_id",
            field=models.CharField(blank=True, max_length=512, null=True),
        ),
        migrations.AddField(
            model_name="announcement",
            name="microsoft_teams_team_id",
            field=models.CharField(blank=True, max_length=512, null=True),
        ),
        migrations.AddField(
            model_name="announcement",
            name="microsoft_teams_channel_id",
            field=models.CharField(blank=True, max_length=512, null=True),
        ),
    ]
