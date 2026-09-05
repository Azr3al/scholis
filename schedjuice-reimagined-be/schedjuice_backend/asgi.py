"""
ASGI config for schedjuice_backend project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/4.2/howto/deployment/asgi/
"""
import logging
import os

from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator
from django.conf import settings
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "schedjuice_backend.settings")

logger = logging.getLogger("schedjuice_backend.asgi")

app = get_asgi_application()

if getattr(settings, "CHAT_AND_WEBSOCKET_ENABLED", False):
    try:
        from app_chat.middleware import JWTTokenAuthMiddlewareStack
        from app_ws.routing import websocket_urlpatterns

        websocket_app = AllowedHostsOriginValidator(
            JWTTokenAuthMiddlewareStack(URLRouter(websocket_urlpatterns))
        )
        logger.info(
            "WebSocket chat enabled (%s route(s))",
            len(websocket_urlpatterns),
        )
    except Exception:
        logger.exception(
            "Failed to initialize WebSocket chat — HTTP still works; WebSocket URLs "
            "will get no route (empty router). Fix imports/consumers and restart."
        )
        websocket_app = URLRouter([])
else:
    websocket_app = URLRouter([])

application = ProtocolTypeRouter({
    "http": app,
    "websocket": websocket_app,
})
