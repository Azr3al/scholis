import logging
import sys

from django.core.management import BaseCommand

from app_finance.models import UserPayment
from app_finance.services import extract_receiver_ss_text_data
from app_data.helpers import run_for_all_orgs

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

handler = logging.StreamHandler(sys.stdout)
handler.setLevel(logging.INFO)
logger.addHandler(handler)


def f(org):
    print(org)
    user_payments = UserPayment.objects.filter(
        status=UserPayment.Status.CANNOT_EXTRACT,
    )
    for i in user_payments:
        extract_receiver_ss_text_data.delay(i.id, org.schema_name)


class Command(BaseCommand):
    def handle(self, *args, **options):
        logger.info("Running [retry_ss_extraction]")
        run_for_all_orgs(lambda x: f(x), {"schema_name": "xschedjuice"})
