from app_organization.helpers import run_for_all_orgs
from django.core.management import BaseCommand
from app_finance.models import UserPayment
from app_finance.services import image_to_text_v2
from django_q.tasks import async_task
from tenant_schemas.utils import schema_context


def extract(up, schema):
    with schema_context(schema):
        x = image_to_text_v2(up.screenshot.url)
        if x["ParsedResults"][0]["ParsedText"]:
            up.text_ocr_data = x["ParsedResults"][0]["ParsedText"]
        up.save()


def extract_text_ocr(org):
    ups = UserPayment.objects.filter(text_ocr_data__isnull=True).all()
    for i in ups:
        async_task(
            "app_data.management.commands.extract_sender_text_ocr.extract",
            i,
            "xteachersu",
        )


class Command(BaseCommand):
    def handle(self, *args, **options):
        run_for_all_orgs(lambda x: extract_text_ocr(x), {})
