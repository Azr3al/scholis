from django.apps import AppConfig


class SchedjuiceBackendConfig(AppConfig):
    """Project package: management command overrides (e.g. runserver) live here."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "schedjuice_backend"
    label = "schedjuice_backend"
    verbose_name = "Schedjuice backend"
