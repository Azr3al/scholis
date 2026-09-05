from django.core.management.base import BaseCommand

from app_custom_fields.completeness import compute_profile_completeness


def recompute_all(user_manager) -> int:
    """Recompute completeness for all users via the given manager. Returns count updated."""
    updated = 0
    for user in user_manager.iterator():
        percent = compute_profile_completeness(user)["percent"]
        if user.profile_completeness != percent:
            user_manager.filter(pk=user.pk).update(profile_completeness=percent)
            updated += 1
    return updated


class Command(BaseCommand):
    help = "Recompute User.profile_completeness for all users in the current schema."

    def handle(self, *args, **options):
        from app_auth.models import User

        updated = recompute_all(User.objects)
        self.stdout.write(self.style.SUCCESS(f"Updated {updated} user(s)."))
