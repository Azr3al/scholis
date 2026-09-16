from django.contrib import admin

from app_course.models import UserAttendance


@admin.register(UserAttendance)
class UserAttendanceAdmin(admin.ModelAdmin):
    list_display = ("user", "course", "join_datetime", "leave_datetime", "duration_seconds")
    list_filter = ("course",)
    search_fields = ("user__name", "user__email")
