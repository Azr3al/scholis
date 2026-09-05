"""Manual or cron hook: Discord digest for current-month payment-assignment gaps."""

from django.core.management import BaseCommand

from app_tasks.payment_assignment_gap_digest import run_payment_assignment_gap_digest


class Command(BaseCommand):
    help = (
        "If DISCORD_WEBHOOK_URL is set, post a Discord message listing tenants that have "
        "missing PaymentAssignment rows for the current calendar month."
    )

    def handle(self, *args, **options):
        run_payment_assignment_gap_digest()
        self.stdout.write(self.style.SUCCESS("alert-payment-assignment-gaps finished."))
