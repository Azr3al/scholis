from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_organization", "0065_platformopssettings_vimeo_access_token_ct_and_more"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="platformopssettings",
            name="vimeo_access_token_ct",
        ),
        migrations.RemoveField(
            model_name="platformopssettings",
            name="vimeo_folder_uri",
        ),
        migrations.RemoveField(
            model_name="platformopssettings",
            name="vimeo_settings_updated_at",
        ),
        migrations.AddField(
            model_name="platformopssettings",
            name="github_docs_video_token_ct",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="platformopssettings",
            name="github_docs_video_repo",
            field=models.CharField(blank=True, default="", max_length=256),
        ),
        migrations.AddField(
            model_name="platformopssettings",
            name="github_docs_video_release_tag",
            field=models.CharField(blank=True, default="videos", max_length=128),
        ),
        migrations.AddField(
            model_name="platformopssettings",
            name="github_docs_video_settings_updated_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
