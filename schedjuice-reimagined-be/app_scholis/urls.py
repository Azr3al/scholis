"""
Routes for the Scholis integration. Included at ``api/v1/`` like every other app.

The webhook path carries the tenant schema and a per-connection token. See
``ScholisWebhookView`` for why the schema has to be in the URL rather than in a
header.
"""
from django.urls import path

from app_scholis import views

urlpatterns = [
    # School-level setup: provision at Scholis, register the webhook, read status.
    path("scholis/connect", views.ScholisConnectView.as_view()),
    # Which Scholis paper writes into which gradebook column.
    path("scholis/papers", views.ScholisPaperLinkView.as_view()),
    # Send one named student into one paper.
    path("scholis/launch", views.ScholisLaunchView.as_view()),
    # Sign one teacher into Scholis from here.
    path("scholis/teacher-link", views.ScholisTeacherLinkView.as_view()),
    # Released marks: pull them, and read what is stored.
    path("scholis/scores", views.ScholisScoreSyncView.as_view()),
    # Replay what was missed from Scholis's own event log.
    path("scholis/catch-up", views.ScholisCatchUpView.as_view()),
    # Inbound deliveries. Unauthenticated; the HMAC is the credential.
    path(
        "scholis/webhooks/<str:schema_name>/<str:token>",
        views.ScholisWebhookView.as_view(),
    ),
]
