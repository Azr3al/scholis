# Generated manually — multi-blank fill-in-the-blank slots + JSON response_text.

import json
import uuid

from django.db import migrations, models
import django.db.models.deletion


def _list_blank_uuids_in_order(doc):
    out = []

    def walk(node):
        if not isinstance(node, dict):
            return
        if node.get("type") == "quizFillBlank":
            attrs = node.get("attrs") or {}
            bid = attrs.get("blankId")
            if bid:
                out.append(str(bid))
        for child in node.get("content") or []:
            walk(child)

    if isinstance(doc, dict):
        walk(doc)
    return out


def migrate_fib_to_slots_and_json_response(apps, schema_editor):
    Question = apps.get_model("app_quiz_v3", "Question")
    QuestionOption = apps.get_model("app_quiz_v3", "QuestionOption")
    QuestionFillBlankSlot = apps.get_model("app_quiz_v3", "QuestionFillBlankSlot")
    QuestionFillBlankAcceptableAnswer = apps.get_model(
        "app_quiz_v3", "QuestionFillBlankAcceptableAnswer"
    )
    AttemptAnswer = apps.get_model("app_quiz_v3", "AttemptAnswer")

    fib_type = "FILL_IN_BLANK"

    for q in Question.objects.filter(question_type=fib_type).iterator():
        body = q.body if isinstance(q.body, dict) else {}
        uuids = _list_blank_uuids_in_order(body)
        if not uuids:
            new_id = str(uuid.uuid4())
            uuids = [new_id]
            para = body.get("content") or []
            if para and isinstance(para[0], dict):
                inner = para[0].get("content") or []
                para[0]["content"] = list(inner) + [
                    {"type": "quizFillBlank", "attrs": {"blankId": new_id}}
                ]
            else:
                body = {
                    "type": "doc",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [
                                {
                                    "type": "quizFillBlank",
                                    "attrs": {"blankId": new_id},
                                }
                            ],
                        }
                    ],
                }
            q.body = body
            q.save(update_fields=["body", "updated_at"])

        opts = list(
            QuestionOption.objects.filter(question_id=q.id).order_by("display_order", "id")
        )
        n = len(uuids)
        per = max(1, int(q.points) // n) if n else int(q.points)
        remainder = int(q.points) - per * n
        for i, bu in enumerate(uuids):
            pts = per + (1 if i < remainder else 0)
            slot = QuestionFillBlankSlot.objects.create(
                question_id=q.id,
                blank_uuid=bu,
                points=pts or 1,
                display_order=i,
            )
            # Legacy data had one set of options for the single blank; attach to first slot only.
            if i == 0 and opts:
                for j, opt in enumerate(opts):
                    QuestionFillBlankAcceptableAnswer.objects.create(
                        slot_id=slot.id,
                        body=opt.body if isinstance(opt.body, dict) else {},
                        display_order=j,
                    )
        if opts:
            QuestionOption.objects.filter(question_id=q.id).delete()

        total_pts = sum(
            QuestionFillBlankSlot.objects.filter(question_id=q.id).values_list(
                "points", flat=True
            )
        )
        if total_pts:
            q.points = total_pts
            q.save(update_fields=["points", "updated_at"])

    for aa in AttemptAnswer.objects.select_related("question").iterator():
        rt = aa.response_text
        q = aa.question
        if q.question_type != fib_type:
            if not rt:
                aa.response_text = "{}"
                aa.save(update_fields=["response_text", "updated_at"])
            elif isinstance(rt, str) and rt.strip().startswith("{"):
                try:
                    json.loads(rt)
                except json.JSONDecodeError:
                    aa.response_text = "{}"
                    aa.save(update_fields=["response_text", "updated_at"])
            else:
                aa.response_text = "{}"
                aa.save(update_fields=["response_text", "updated_at"])
            continue

        if isinstance(rt, str) and rt.strip().startswith("{"):
            try:
                obj = json.loads(rt)
                if isinstance(obj, dict):
                    aa.response_text = json.dumps(obj)
                    aa.save(update_fields=["response_text", "updated_at"])
                continue
            except json.JSONDecodeError:
                pass

        uuids = _list_blank_uuids_in_order(q.body if isinstance(q.body, dict) else {})
        if isinstance(rt, str) and rt.strip() and len(uuids) == 1:
            aa.response_text = json.dumps({uuids[0]: rt.strip()[:10000]})
        else:
            aa.response_text = "{}"
        aa.save(update_fields=["response_text", "updated_at"])


def reverse_migrate(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("app_quiz_v3", "0006_quizattempt_overdue_seconds"),
    ]

    operations = [
        migrations.CreateModel(
            name="QuestionFillBlankSlot",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("blank_uuid", models.UUIDField(db_index=True)),
                ("points", models.PositiveIntegerField(default=1)),
                ("display_order", models.PositiveIntegerField(default=0)),
                (
                    "question",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="fill_blank_slots",
                        to="app_quiz_v3.question",
                    ),
                ),
            ],
            options={
                "ordering": ["display_order", "id"],
            },
        ),
        migrations.CreateModel(
            name="QuestionFillBlankAcceptableAnswer",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("body", models.JSONField(default=dict)),
                ("display_order", models.PositiveIntegerField(default=0)),
                (
                    "slot",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="acceptable_answers",
                        to="app_quiz_v3.questionfillblankslot",
                    ),
                ),
            ],
            options={
                "ordering": ["display_order", "id"],
            },
        ),
        migrations.AddConstraint(
            model_name="questionfillblankslot",
            constraint=models.UniqueConstraint(
                fields=("question", "blank_uuid"),
                name="uniq_question_fill_blank_uuid",
            ),
        ),
        migrations.RunPython(migrate_fib_to_slots_and_json_response, reverse_migrate),
        migrations.AlterField(
            model_name="attemptanswer",
            name="response_text",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
