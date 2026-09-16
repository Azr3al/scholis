# Polymorphic UserTeachingSubject: subject, program_level, or category per row.
# Existing subject+level pairs become subject-only rows (level dropped; duplicates deduped).

from django.db import migrations, models
import django.db.models.deletion


def migrate_subject_level_pairs_to_subject_only(apps, schema_editor):
    UserTeachingSubject = apps.get_model("app_auth", "UserTeachingSubject")
    rows = UserTeachingSubject.objects.all().order_by(
        "user_id", "subject_id", "sort_order", "created_at", "id"
    )
    seen_subject_by_user: set[tuple[int, int]] = set()
    duplicate_ids: list[int] = []
    for row in rows:
        if row.subject_id is None:
            continue
        key = (row.user_id, row.subject_id)
        if key in seen_subject_by_user:
            duplicate_ids.append(row.pk)
            continue
        seen_subject_by_user.add(key)
        row.entity_type = "subject"
        row.program_level_id = None
        row.category_id = None
        row.save(update_fields=["entity_type", "program_level_id", "category_id"])
    if duplicate_ids:
        UserTeachingSubject.objects.filter(pk__in=duplicate_ids).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("app_course", "0083_programlevelsubject"),
        ("app_auth", "0073_user_teaching_subject"),
    ]

    operations = [
        migrations.AddField(
            model_name="userteachingsubject",
            name="entity_type",
            field=models.CharField(
                choices=[
                    ("subject", "Subject"),
                    ("program_level", "Program level"),
                    ("category", "Category"),
                ],
                default="subject",
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name="userteachingsubject",
            name="category",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="user_teaching_subjects",
                to="app_course.category",
            ),
        ),
        migrations.AlterField(
            model_name="userteachingsubject",
            name="program_level",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="user_teaching_subjects",
                to="app_course.programlevel",
            ),
        ),
        migrations.AlterField(
            model_name="userteachingsubject",
            name="subject",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="user_teaching_subjects",
                to="app_course.subject",
            ),
        ),
        migrations.RunPython(
            migrate_subject_level_pairs_to_subject_only,
            migrations.RunPython.noop,
        ),
        migrations.RemoveConstraint(
            model_name="userteachingsubject",
            name="uniq_user_teaching_subject_user_subject_level",
        ),
        migrations.AddConstraint(
            model_name="userteachingsubject",
            constraint=models.CheckConstraint(
                check=(
                    models.Q(
                        entity_type="subject",
                        subject__isnull=False,
                        program_level__isnull=True,
                        category__isnull=True,
                    )
                    | models.Q(
                        entity_type="program_level",
                        program_level__isnull=False,
                        subject__isnull=True,
                        category__isnull=True,
                    )
                    | models.Q(
                        entity_type="category",
                        category__isnull=False,
                        subject__isnull=True,
                        program_level__isnull=True,
                    )
                ),
                name="user_teaching_subject_entity_fk_consistency",
            ),
        ),
        migrations.AddConstraint(
            model_name="userteachingsubject",
            constraint=models.UniqueConstraint(
                condition=models.Q(entity_type="subject"),
                fields=("user", "subject"),
                name="uniq_user_teaching_subject_user_subject",
            ),
        ),
        migrations.AddConstraint(
            model_name="userteachingsubject",
            constraint=models.UniqueConstraint(
                condition=models.Q(entity_type="program_level"),
                fields=("user", "program_level"),
                name="uniq_user_teaching_subject_user_program_level",
            ),
        ),
        migrations.AddConstraint(
            model_name="userteachingsubject",
            constraint=models.UniqueConstraint(
                condition=models.Q(entity_type="category"),
                fields=("user", "category"),
                name="uniq_user_teaching_subject_user_category",
            ),
        ),
    ]
