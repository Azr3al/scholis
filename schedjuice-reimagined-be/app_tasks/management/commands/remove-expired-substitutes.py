import logging
import sys

from django.core.management import BaseCommand

from app_course.substitute_removal import expire_substitute_assignments

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

handler = logging.StreamHandler(sys.stdout)
handler.setLevel(logging.INFO)
logger.addHandler(handler)


def _get_current_org():
    from django.db import connection
    from tenant_schemas.utils import get_public_schema_name, schema_context

    from app_organization.models import Organization

    tenant_schema = connection.schema_name
    with schema_context(get_public_schema_name()):
        return Organization.objects.filter(schema_name=tenant_schema).first()


class Command(BaseCommand):
    help = "Remove substitute teachers whose last covered session has passed."

    def handle(self, *args, **options):
        logger.info("Running [remove-expired-substitutes]")
        org = _get_current_org()
        result = expire_substitute_assignments(tenant=org)
        logger.info("[remove-expired-substitutes] removed=%s", result["count"])
