from django.apps import AppConfig


class TrafficAnalyticsConfig(AppConfig):
    name = "utilitas.traffic_analytics"
    label = "traffic_analytics"

    def ready(self):
        from django.conf import settings

        if getattr(settings, "POSTHOG_ENABLED", False):
            from utilitas.traffic_analytics.client import get_event_queue

            get_event_queue().start()
