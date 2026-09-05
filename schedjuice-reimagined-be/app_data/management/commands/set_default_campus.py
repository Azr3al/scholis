from django.core.management import BaseCommand
from app_course.models import Campus, Course


class Command(BaseCommand):
    """
    set all the Courses with campus_id = null to the campus model with is_default = True
    """

    def handle(self, *args, **options):
        try:
            default_campus = Campus.objects.get(is_default=True)
        except Campus.DoesNotExist:
            self.stdout.write(self.style.ERROR("No default campus found."))
            return

        updated = Course.objects.filter(campus__isnull=True).update(
            campus=default_campus
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"Updated {updated} courses to default campus '{default_campus.name}'"
            )
        )
