import csv
from datetime import datetime
import sys

from django.core.management import BaseCommand, call_command
from django.db import connection

from app_organization.models import Organization


# Faced and solved this issue.
# https://github.com/bernardopires/django-tenant-schemas/issues/331
class Command(BaseCommand):
    def handle(self, *args, **options):
        connection.set_schema_to_public()
        f = csv.DictReader(
            open(f"./app_data/dummydata/organization.csv", "r"), delimiter=","
        )
        rows = list(f)

        if "test" in sys.argv:
            for row in rows:
                tenant = Organization.objects.filter(
                    schema_name=row["schema_name"]
                ).first()
                if tenant is not None:
                    continue
                tenant = Organization(
                    **row,
                    created_at=datetime.now(),
                    updated_at=datetime.now(),
                )
                tenant.save()
                tenant.create_schema(check_if_exists=True)
                self.stdout.write(str(tenant.id), ending="\n")
            return

        call_command("flush")
        for row in rows:
            tenant = Organization(**row, created_at=datetime.now(), updated_at=datetime.now())
            tenant.save()
            print(tenant)
            tenant.create_schema(check_if_exists=True)
            self.stdout.write(str(tenant.id), ending="\n")
