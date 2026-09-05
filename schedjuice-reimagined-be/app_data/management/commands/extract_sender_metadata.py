from app_organization.helpers import run_for_all_orgs
from django.core.management import BaseCommand
from app_finance.models import UserPayment
from django_q.tasks import async_task


def extract(org):
    ups = UserPayment.objects.filter(text_ocr_data__isnull=False).all()
    for up in ups:
        async_task("app_finance.ocr.extract_metadata_using_regex", up, org.schema_name)


class Command(BaseCommand):
    def handle(self, *args, **options):
        run_for_all_orgs(lambda x: extract(x), {})
