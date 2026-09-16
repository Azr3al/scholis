from django.db import models
from rest_framework.exceptions import ValidationError

from app_course.models import UserCourse


class ActiveUserEventQuerySet(models.QuerySet):
    def delete(self):
        from app_attendance.userevent_lifecycle import soft_delete_userevents

        count = soft_delete_userevents(self)
        return count, {self.model._meta.label: count}


class AttendanceManager(models.Manager):
    def bulk_create(self, objs, *args, **kwargs):
        objs = list(objs)
        if not objs:
            return super().bulk_create(objs, *args, **kwargs)
        from app_course.models import Event

        # Resolve event -> course without triggering a lazy FK fetch per object.
        event_course = {}
        uncached_event_ids = set()
        for o in objs:
            cached_event = o._state.fields_cache.get("event")
            if cached_event is not None:
                event_course[o.event_id] = cached_event.course_id
            else:
                uncached_event_ids.add(o.event_id)
        if uncached_event_ids:
            event_course.update(
                Event.objects.filter(id__in=uncached_event_ids).values_list(
                    "id", "course_id"
                )
            )
        required = {(o.user_id, event_course[o.event_id]) for o in objs}
        # The __in/__in filter over-matches as a cross-product; the set
        # difference below keeps validation exact.
        existing = set(
            UserCourse.objects.filter(
                user_id__in={u for u, _ in required},
                course_id__in={c for _, c in required},
            ).values_list("user_id", "course_id")
        )
        if required - existing:
            raise ValidationError(
                {
                    "course": "The user does not belong in the event's course."
                    " Refer to app_attendance.AttendanceManager for more information."
                }
            )
        return super().bulk_create(objs, *args, **kwargs)


class ActiveUserEventManager(AttendanceManager):
    def get_queryset(self):
        return ActiveUserEventQuerySet(self.model, using=self._db).filter(is_deleted=False)
