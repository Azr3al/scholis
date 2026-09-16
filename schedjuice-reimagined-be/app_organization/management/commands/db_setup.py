from django.core.management import BaseCommand
from app_organization.on_ready import run_on_ready_commands

class Command(BaseCommand):
    def handle(self, *args, **options):
        run_on_ready_commands("app_organization")