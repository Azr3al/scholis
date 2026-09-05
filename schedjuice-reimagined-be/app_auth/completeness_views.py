from rest_framework.views import Request

from app_auth import models
from app_auth.user_scoping import acting_user, check_user_read
from app_custom_fields.completeness import compute_profile_completeness
from app_rbac.views import RBACView


class UserCompletenessView(RBACView):
    model = models.User
    required_permissions = {"GET": "user.view"}

    def get(self, request: Request, user_id: int):
        target = self.model.objects.filter(pk=user_id).first()
        if target is None:
            return self.not_found(f"User {user_id} does not exist.")
        actor = acting_user(request)
        if actor is None:
            return self.forbidden("Authentication required.")
        check_user_read(actor, target)
        return self.ok(compute_profile_completeness(target))
