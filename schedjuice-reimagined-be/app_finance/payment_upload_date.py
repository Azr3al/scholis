from django.utils import timezone

from app_finance.models import UserPayment


def stamp_payment_upload_date(payment: UserPayment) -> None:
    """Record screenshot upload time for receipts and recent-transactions filters."""
    payment.payment_date = timezone.now()
