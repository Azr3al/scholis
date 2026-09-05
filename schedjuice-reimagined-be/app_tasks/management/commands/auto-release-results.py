from django.core.management.base import BaseCommand
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_course.models import Assignment, Submission
from app_organization.models import Organization
from datetime import datetime
import pytz


class Command(BaseCommand):

    def handle(self, *args, **options):        
        total_released = 0
        total_assignments = 0
        
        for tenant in Organization.objects.exclude(schema_name=get_public_schema_name()):
            with schema_context(tenant.schema_name):
                now = datetime.now(tz=pytz.UTC)
                
                assignments = Assignment.objects.filter(
                    results_release_date__lte=now,
                    results_release_date__isnull=False
                )
                
                for assignment in assignments:
                    updated_count = Submission.objects.filter(
                        assignment=assignment,
                        is_graded=True,
                        are_results_released=False
                    ).update(are_results_released=True)
                    
                    if updated_count > 0:
                        total_released += updated_count
                        total_assignments += 1
        
        self.stdout.write(
            self.style.SUCCESS(
                f"Released {total_released} submissions across {total_assignments} assignments"
            )
        )
