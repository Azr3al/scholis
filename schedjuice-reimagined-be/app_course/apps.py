from django.apps import AppConfig


class AppCourseConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "app_course"

    def ready(self):
        import app_course.search_signals  # noqa: F401
