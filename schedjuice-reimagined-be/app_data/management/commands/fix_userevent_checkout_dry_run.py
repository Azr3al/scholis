"""
Fix UserEvents where checkout_time is before checkin_time (negative hours) by
setting checkout_time to checkout_time + 1 day. Prints id and old/new values.
"""
from datetime import timedelta

from django.core.management import BaseCommand
from django.db.models import F
from tenant_schemas.utils import schema_context, get_public_schema_name

from app_attendance.models import UserEvent
from app_organization.models import Organization


class Command(BaseCommand):
    help = (
        "Fix UserEvents where checkout_time < checkin_time by setting checkout_time "
        "to checkout_time + 1 day. Prints id and old/new values, then updates the DB."
    )

    def handle(self, *args, **options):
        with schema_context(get_public_schema_name()):
            organizations = list(Organization.objects.all())

        total = 0
        for org in organizations:
            schema_name = getattr(org, "schema_name", None)
            if not schema_name:
                self.stdout.write(self.style.WARNING(f"Skipping org (no schema_name): {org}"))
                continue

            with schema_context(schema_name):
                # checkout_time < checkin_time and both set
                bad = (
                    UserEvent.objects.filter(
                        checkin_time__isnull=False,
                        checkout_time__isnull=False,
                    )
                    .filter(checkout_time__lt=F("checkin_time"))
                    .order_by("id")
                )
                count = bad.count()
                if count == 0:
                    continue

                self.stdout.write(self.style.NOTICE(f"\nSchema: {schema_name} ({count} row(s))"))
                self.stdout.write("id\tcurrent_checkout_time\tfixed_checkout_time")
                for ue in bad:
                    old_checkout = ue.checkout_time
                    fixed_checkout = old_checkout + timedelta(days=1)
                    self.stdout.write(
                        f"{ue.id}\t{old_checkout.isoformat()}\t{fixed_checkout.isoformat()}"
                    )
                    ue.checkout_time = fixed_checkout
                    ue.save(update_fields=["checkout_time"])
                total += count

        if total == 0:
            self.stdout.write(self.style.SUCCESS("No UserEvents with checkout_time < checkin_time."))
        else:
            self.stdout.write(self.style.SUCCESS(f"\nTotal: {total} row(s) updated."))
