# Generated manually for course membership history

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

BATCH = 1000


def forwards_backfill(apps, schema_editor):
    UserCourse = apps.get_model("app_course", "UserCourse")
    CourseMembershipEvent = apps.get_model("app_course", "CourseMembershipEvent")
    joined_batch = []
    removed_batch = []
    dropped_uc_ids = []

    active_qs = UserCourse.objects.filter(
        assigned_as="student", is_dropped_out=False
    ).only("id", "course_id", "user_id", "created_at")
    for uc in active_qs.iterator(chunk_size=BATCH):
        joined_batch.append(
            CourseMembershipEvent(
                course_id=uc.course_id,
                user_id=uc.user_id,
                event_type="joined",
                occurred_at=uc.created_at,
                actor_id=None,
            )
        )
        if len(joined_batch) >= BATCH:
            CourseMembershipEvent.objects.bulk_create(joined_batch, batch_size=BATCH)
            joined_batch.clear()

    dropped_qs = UserCourse.objects.filter(
        assigned_as="student", is_dropped_out=True
    ).only("id", "course_id", "user_id", "created_at", "dropped_out_date")
    for uc in dropped_qs.iterator(chunk_size=BATCH):
        occurred = uc.dropped_out_date or uc.created_at
        removed_batch.append(
            CourseMembershipEvent(
                course_id=uc.course_id,
                user_id=uc.user_id,
                event_type="removed",
                occurred_at=occurred,
                actor_id=None,
            )
        )
        dropped_uc_ids.append(uc.id)
        if len(removed_batch) >= BATCH:
            CourseMembershipEvent.objects.bulk_create(removed_batch, batch_size=BATCH)
            removed_batch.clear()

    if joined_batch:
        CourseMembershipEvent.objects.bulk_create(joined_batch, batch_size=BATCH)
    if removed_batch:
        CourseMembershipEvent.objects.bulk_create(removed_batch, batch_size=BATCH)
    if dropped_uc_ids:
        UserCourse.objects.filter(id__in=dropped_uc_ids).delete()


def backwards_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    # Deletes on app_course_usercourse fire FK/trigger cascades; RemoveField
    # must run in a separate transaction (PostgreSQL pending trigger events).
    atomic = False

    dependencies = [
        ("app_course", "0101_user_course_oversight_scope"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="CourseMembershipEvent",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "event_type",
                    models.CharField(
                        choices=[("joined", "Joined"), ("removed", "Removed")],
                        max_length=16,
                    ),
                ),
                ("occurred_at", models.DateTimeField()),
                (
                    "actor",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="membership_events_performed",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "course",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="membership_events",
                        to="app_course.course",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="course_membership_events",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-occurred_at", "-id"],
            },
        ),
        migrations.AddIndex(
            model_name="coursemembershipevent",
            index=models.Index(
                fields=["course", "-occurred_at"],
                name="app_course__course__6a8f2d_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="coursemembershipevent",
            index=models.Index(
                fields=["course", "user"],
                name="app_course__course__9c4e1a_idx",
            ),
        ),
        migrations.RunPython(forwards_backfill, backwards_noop),
        migrations.RemoveField(
            model_name="usercourse",
            name="dropped_out_date",
        ),
        migrations.RemoveField(
            model_name="usercourse",
            name="is_dropped_out",
        ),
    ]
