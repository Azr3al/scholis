"""
Send a test Expo push notification for debugging (django-expo-notifications).
"""

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_auth.serializers import ExpoTokenSerializer


class Command(BaseCommand):
    help = (
        "Send a test Expo push to device(s) in a tenant. "
        "Specify exactly one of --push-token, --user-email, or --user-id. "
        "Async mode queues Celery (requires a worker); --sync sends in-process."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--schema",
            type=str,
            required=True,
            help="Tenant schema name (e.g. xteachersu)",
        )
        parser.add_argument(
            "--push-token",
            type=str,
            default=None,
            dest="push_token",
            help="ExponentPushToken[...] or ExpoPushToken[...] (single device)",
        )
        parser.add_argument(
            "--user-email",
            type=str,
            default=None,
            dest="user_email",
            help="Send to all matching active devices for this user (unless --include-inactive)",
        )
        parser.add_argument(
            "--user-id",
            type=int,
            default=None,
            dest="user_id",
            help="Send to all matching active devices for this user id (unless --include-inactive)",
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
            "--sync",
            action="store_true",
            dest="sync",
            help="Send immediately in-process (bypasses Celery queue)",
        )
        parser.add_argument(
            "--include-inactive",
            action="store_true",
            dest="include_inactive",
            help="Include devices with is_active=False (debug)",
        )

    def handle(self, *args, **options):
        schema_name = options["schema"]
        push_token = (options.get("push_token") or "").strip() or None
        user_email = (options.get("user_email") or "").strip() or None
        user_id = options["user_id"]
        title = options["title"] or "Schedjuice test"
        body = options["body"]
        if body is None:
            body = f"Test notification at {timezone.now().isoformat()}"

        n_targets = sum(
            [
                bool(push_token),
                bool(user_email),
                user_id is not None,
            ]
        )
        if n_targets == 0:
            raise CommandError(
                "Specify exactly one of: --push-token, --user-email, or --user-id"
            )
        if n_targets > 1:
            raise CommandError(
                "Use only one of: --push-token, --user-email, or --user-id"
            )

        with schema_context(schema_name):
            from expo_notifications.models import Device, Message

            qs = Device.objects.all()
            if not options["include_inactive"]:
                qs = qs.filter(is_active=True)

            if push_token is not None:
                ser = ExpoTokenSerializer(data={"push_token": push_token})
                if not ser.is_valid():
                    raise CommandError(f"Invalid push_token: {ser.errors}")
                validated = ser.validated_data["push_token"]
                devices = list(qs.filter(push_token=validated))
            elif user_email is not None:
                user = User.objects.filter(email__iexact=user_email).first()
                if not user:
                    raise CommandError(f"No user with email: {user_email}")
                devices = list(qs.filter(user=user))
            else:
                user = User.objects.filter(pk=user_id).first()
                if not user:
                    raise CommandError(f"No user with id: {user_id}")
                devices = list(qs.filter(user=user))

            if not devices:
                raise CommandError("No matching Device rows for this target.")

            to_send = [Message(device=d, title=title, body=body) for d in devices]

            if options["sync"]:
                created = Message.objects.bulk_create(to_send)
                pks = [m.pk for m in created]
                from app_utils.expo_tasks import send_messages_tenant

                send_messages_tenant.apply(args=(schema_name, pks))
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Sent synchronously via Expo ({len(pks)} message(s)), pks={pks}"
                    )
                )
            else:
                Message.objects.bulk_send(to_send)
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Queued {len(to_send)} message(s) for Celery after DB commit "
                        f"(start a worker against this broker; e.g. "
                        f"`celery -A schedjuice_backend worker …`). schema={schema_name}"
                    )
                )
