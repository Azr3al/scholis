"""No-op stub: dropout-based Telegram roster reconcile was removed."""

from django.core.management import BaseCommand


class Command(BaseCommand):
    help = "No-op stub (dropout roster state removed); kept for command-name stability."

    def handle(self, *args, **options):
        self.stdout.write(
            self.style.SUCCESS(
                "No dropped-teacher enrollments to reconcile (dropout roster state removed)."
            )
        )
