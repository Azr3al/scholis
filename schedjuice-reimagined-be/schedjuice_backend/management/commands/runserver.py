"""
Daphne runserver with dev-friendly WebSocket timeouts.

Stock Daphne uses `websocket_handshake_timeout=5`. Tenant JWT middleware plus DB
work over a slow or remote database often exceeds 5s before `accept()`, so
clients see HANDSHAKING then DISCONNECT with no CONNECT.

Stock `runserver` also does not pass `application_close_timeout`; the default
10s can trigger "Application instance ... took too long to shut down" during
WebSocket teardown under load.

This command overrides `daphne`'s `runserver` by listing `schedjuice_backend`
before `daphne` in INSTALLED_APPS.

Env (optional):
  DJANGO_WEBSOCKET_HANDSHAKE_TIMEOUT — seconds (DEBUG default 30 if not on CLI)
  DJANGO_APPLICATION_CLOSE_TIMEOUT — seconds (DEBUG default 30)
"""
from __future__ import annotations

import datetime
import logging
import os
import sys

from django.conf import settings
from daphne import __version__
from daphne.endpoints import build_endpoint_description_strings
from daphne.management.commands.runserver import Command as DaphneRunserverCommand
from django.core.management.commands.runserver import Command as RunserverCommand

logger = logging.getLogger("django.channels.server")


class Command(DaphneRunserverCommand):
    def handle(self, *args, **options):
        if settings.DEBUG and "--websocket_handshake_timeout" not in sys.argv:
            options["websocket_handshake_timeout"] = int(
                os.environ.get("DJANGO_WEBSOCKET_HANDSHAKE_TIMEOUT", "30")
            )
        return super().handle(*args, **options)

    def inner_run(self, *args, **options):
        if not options.get("use_asgi", True):
            if hasattr(RunserverCommand, "server_cls"):
                self.server_cls = RunserverCommand.server_cls
            return RunserverCommand.inner_run(self, *args, **options)

        self.stdout.write("Performing system checks...\n\n")
        self.check(display_num_errors=True)
        self.check_migrations()
        quit_command = "CTRL-BREAK" if sys.platform == "win32" else "CONTROL-C"
        now = datetime.datetime.now().strftime("%B %d, %Y - %X")
        self.stdout.write(now)
        self.stdout.write(
            (
                "Django version %(version)s, using settings %(settings)r\n"
                "Starting ASGI/Daphne version %(daphne_version)s development server"
                " at %(protocol)s://%(addr)s:%(port)s/\n"
                "Quit the server with %(quit_command)s.\n"
            )
            % {
                "version": self.get_version(),
                "daphne_version": __version__,
                "settings": settings.SETTINGS_MODULE,
                "protocol": self.protocol,
                "addr": "[%s]" % self.addr if self._raw_ipv6 else self.addr,
                "port": self.port,
                "quit_command": quit_command,
            }
        )

        logger.debug("Daphne running, listening on %s:%s", self.addr, self.port)

        endpoints = build_endpoint_description_strings(host=self.addr, port=self.port)
        application = self.get_application(options)

        application_close_timeout = 10
        if settings.DEBUG:
            application_close_timeout = int(
                os.environ.get("DJANGO_APPLICATION_CLOSE_TIMEOUT", "30")
            )

        try:
            self.server_cls(
                application=application,
                endpoints=endpoints,
                signal_handlers=not options["use_reloader"],
                action_logger=self.log_action,
                http_timeout=self.http_timeout,
                root_path=getattr(settings, "FORCE_SCRIPT_NAME", "") or "",
                websocket_handshake_timeout=self.websocket_handshake_timeout,
                application_close_timeout=application_close_timeout,
            ).run()
            logger.debug("Daphne exited")
        except KeyboardInterrupt:
            shutdown_message = options.get("shutdown_message", "")
            if shutdown_message:
                self.stdout.write(shutdown_message)
            return
