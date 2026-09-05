from django.db import migrations

REPORT_TYPES = [
    ("Behavioural report", "#ef4444", "STUDENT", 1, []),
    (
        "Dropout follow-up",
        "#f59e0b",
        "STUDENT",
        2,
        [
            ("follow_up_person", "Follow-up person", "staff_user_fk", True, None),
            ("related_course", "Related course", "course_fk", False, None),
            (
                "outcome",
                "Outcome",
                "choice",
                False,
                [
                    {"value": "reached", "label": "Reached"},
                    {"value": "no_response", "label": "No response"},
                    {"value": "returned", "label": "Returned"},
                ],
            ),
        ],
    ),
    ("Progress follow-up", "#0ea5e9", "STUDENT", 3, []),
    ("Staff note", "#8b5cf6", "STAFF", 4, []),
]


def seed(apps, schema_editor):
    ReportType = apps.get_model("app_userlog", "ReportType")
    ReportTypeField = apps.get_model("app_userlog", "ReportTypeField")
    if ReportType.objects.exists():
        return
    for name, color, applies_to, order, fields in REPORT_TYPES:
        rt = ReportType.objects.create(
            name=name, color=color, applies_to=applies_to, order=order
        )
        for i, (key, label, ftype, required, choices) in enumerate(fields):
            ReportTypeField.objects.create(
                report_type=rt,
                field_key=key,
                field_label=label,
                field_type=ftype,
                is_required=required,
                choices=choices,
                sort_order=i,
            )


def unseed(apps, schema_editor):
    apps.get_model("app_userlog", "ReportType").objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ("app_userlog", "0003_logentry_logentryversion_logentryevent_and_more"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
