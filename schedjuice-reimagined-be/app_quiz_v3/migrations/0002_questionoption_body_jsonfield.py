import json

from django.db import migrations, models


def _parse_legacy_body(raw):
    if raw is None or raw == "":
        return {"type": "doc", "content": []}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        t = raw.strip()
        if t.startswith("{"):
            try:
                return json.loads(t)
            except json.JSONDecodeError:
                pass
        return {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": raw}],
                }
            ],
        }
    return {"type": "doc", "content": []}


def forwards_copy_body(apps, schema_editor):
    QuestionOption = apps.get_model("app_quiz_v3", "QuestionOption")
    for o in QuestionOption.objects.all():
        o.body_json = _parse_legacy_body(o.body)
        o.save(update_fields=["body_json"])


def backwards_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("app_quiz_v3", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="questionoption",
            name="body_json",
            field=models.JSONField(null=True),
        ),
        migrations.RunPython(forwards_copy_body, backwards_noop),
        migrations.RemoveField(
            model_name="questionoption",
            name="body",
        ),
        migrations.RenameField(
            model_name="questionoption",
            old_name="body_json",
            new_name="body",
        ),
        migrations.AlterField(
            model_name="questionoption",
            name="body",
            field=models.JSONField(
                default={"type": "doc", "content": []},
            ),
        ),
    ]
