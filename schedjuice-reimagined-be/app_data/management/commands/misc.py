import csv

from django.core.management import BaseCommand
from tenant_schemas.utils import schema_context
from app_auth.models import User
from app_tools.services import send_mail
from app_organization.models import Organization
class Command(BaseCommand):
    def handle(self, *args, **options):
        with open("to-be-deleted.csv") as f:
            emails = []
            reader = csv.reader(f)
            for row in reader:
                emails.append(row[0])
        tenant = Organization.objects.filter(schema_name="xteachersu").first()
        with schema_context("xteachersu"):
            print(f"new account\told account\tname")
            new_accounts = User.objects.filter(email__in=emails).order_by("alternative_name").all()
            for i in new_accounts:
                old_account = User.objects.filter(communication_email=i.communication_email).exclude(id=i.id).first()
                if old_account:
                    for email in [i.email, old_account.email, i.communication_email]:
                        send_mail(
                            tenant,
                            "Account Deletion Imminent",
                            f"<p>Your Teacher Su International School account with the email <strong>{i.email}</strong> will be deleted on 7.4.2025. If you have any questions, please contact James (telegram: @thiha_sh) immediately.</p><br><br>Thank you,<br>SuConnect Team",
                            email
                        )
                    print(f"{i.alternative_name},{old_account.email},{i.email}")

