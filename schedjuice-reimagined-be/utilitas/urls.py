from django.urls import path

from utilitas.health import health

urlpatterns = [
    path("health", health, name="api-health"),
]
