from django.db import migrations, models


def _empty_tiptap_doc():
    return {"type": "doc", "content": []}


class Migration(migrations.Migration):
    dependencies = [
        ("app_quiz_v3", "0008_quiz_can_navigate_questions"),
    ]

    operations = [
        migrations.AddField(
            model_name="quiz",
            name="intro_body",
            field=models.JSONField(default=_empty_tiptap_doc),
        ),
        migrations.AddField(
            model_name="quiz",
            name="outro_body",
            field=models.JSONField(default=_empty_tiptap_doc),
        ),
        migrations.AddField(
            model_name="quiz",
            name="quiz_theme",
            field=models.CharField(
                choices=[
                    ("slate", "Slate"),
                    ("forest", "Forest"),
                    ("ocean", "Ocean"),
                    ("plum", "Plum"),
                    ("amber", "Amber"),
                    ("high_contrast", "High contrast"),
                ],
                default="slate",
                max_length=32,
            ),
        ),
    ]
