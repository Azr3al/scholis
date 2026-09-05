"""
Send a test Web Push notification to browser subscriptions in a tenant.
"""

import time

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_auth.models import User, WebPushSubscription
from app_utils.push_helpers import _send_web_push_for_user_ids


class Command(BaseCommand):
    help = (
        "Send a test web push to active browser subscriptions in a tenant. "
        "Specify exactly one of --user-email or --user-id."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--schema",
            type=str,
            required=True,
            help="Tenant schema name (e.g. xschedjuice)",
        )
        parser.add_argument(
            "--user-email",
            type=str,
            default=None,
            dest="user_email",
            help="Send to this user's active web push subscriptions",
        )
        parser.add_argument(
            "--user-id",
            type=int,
            default=None,
            dest="user_id",
            help="Send to this user's active web push subscriptions",
        )
        parser.add_argument(
            "--title",
            type=str,
            default="Schedjuice test",
            dest="title",
            help="Notification title",
        )
        parser.add_argument(
            "--body",
            type=str,
            default=None,
            dest="body",
            help="Notification body (default: timestamped message)",
        )
        parser.add_argument(
            "--wait-seconds",
            type=int,
            default=0,
            dest="wait_seconds",
            help="Poll for an active subscription up to N seconds before sending",
        )

    def handle(self, *args, **options):
        schema_name = options["schema"]
        user_email = (options.get("user_email") or "").strip() or None
        user_id = options["user_id"]
        title = options["title"] or "Schedjuice test"
        body = options["body"]
        if body is None:
            body = f"Test web push at {timezone.now().isoformat()}"
        wait_seconds = max(0, options["wait_seconds"])

        n_targets = sum([bool(user_email), user_id is not None])
        if n_targets == 0:
            raise CommandError("Specify exactly one of: --user-email or --user-id")
        if n_targets > 1:
            raise CommandError("Use only one of: --user-email or --user-id")

        with schema_context(schema_name):
            if user_email is not None:
                user = User.objects.filter(email__iexact=user_email).first()
                if not user:
                    raise CommandError(f"No user with email: {user_email}")
            else:
                user = User.objects.filter(pk=user_id).first()
                if not user:
                    raise CommandError(f"No user with id: {user_id}")

            user_ids = [user.id]
            deadline = time.monotonic() + wait_seconds
            while True:
                count = WebPushSubscription.objects.filter(
                    user_id__in=user_ids,
                    is_active=True,
                ).count()
                if count:
                    break
                if time.monotonic() >= deadline:
                    raise CommandError(
                        f"No active web push subscription for user {user.email}. "
                        "Open the web app, allow notifications, then retry."
                    )
                self.stdout.write("Waiting for web push subscription…")
                time.sleep(2)

        data = {
            "type": "test",
            "route": "/notifications",
            "params": {},
            "notification_id": f"test-{timezone.now().timestamp()}",
        }
        _send_web_push_for_user_ids(schema_name, user_ids, title, body, data)
        self.stdout.write(
            self.style.SUCCESS(
                f"Sent web push test to user {user.email} (schema={schema_name})"
            )
        )
