import logging
import time

from rest_framework.exceptions import ValidationError

from app_microsoft.graph_wrapper.group import MSGroup
from app_microsoft.graph_wrapper.license import assert_license_available_for_user_type
from app_microsoft.graph_wrapper.retry import response_indicates_already_exists
from app_microsoft.graph_wrapper.user import MSUser
from app_microsoft.payment_assignment_helpers import create_payment_assignment_for_course_async

logger = logging.getLogger(__name__)

# Spacing between Graph directory calls reduces "concurrent requests" from Entra.
_MS_GRAPH_MUTATION_GAP_SEC = 0.45


def _rollback_entra_user(ms_user: MSUser, user_id: str) -> None:
    res = ms_user.delete_with_retry(user_id)
    if res.status_code not in range(199, 300):
        logger.error(
            "Failed to delete orphaned Entra user after provisioning rollback "
            "(user_id=%s, status=%s): %s",
            user_id,
            res.status_code,
            (res.text or "")[:500],
        )


class MicrosoftAlreadyExistsError(ValidationError):
    """Raised when Graph rejects a create because the object already exists.

    Carries a structured ``MS_CONFLICT`` payload so callers/UI can route the
    admin to the "link existing Microsoft object" flow instead of retrying a
    doomed create.
    """

    def __init__(self, *, kind: str, identifier: str, detail):
        self.kind = kind
        self.identifier = identifier
        super().__init__(
            {
                "MS_CONFLICT": {
                    "kind": kind,
                    "identifier": identifier,
                    "details": detail,
                    "recommendation": (
                        "A Microsoft object with this identity already exists. "
                        "Link the existing object instead of creating a new one."
                    ),
                }
            }
        )

# This is mostly copied from https://github.com/ninnroot/schedjuice5/blob/development/app_microsoft/flows.py


class CreateUserFlow:
    def __init__(
        self,
        email: str,
        password: str,
        user_type: str,
        new_name: str,
        tenant,
        *,
        assign_license: bool = True,
    ):
        self.email = email
        self.password = password
        self.tenant = tenant
        if user_type not in {"staff", "student"}:
            raise ValueError("'user_type' can either be 'staff' or 'student'.")
        self.user_type = user_type
        self.new_name = new_name
        self.assign_license = assign_license
        self.ms_user = MSUser(tenant)

    def start(self):
        """
        This piece of code is fking stupid. But, that is the only way Microsoft Graph allows.
        Later, this can be carried out by a queue of some sort so that the client doesn't have to wait.
        """
        if self.assign_license:
            assert_license_available_for_user_type(self.tenant, self.user_type)

        # displayName set to final name here; avoids a separate PATCH (fewer directory writes).
        res = self.ms_user.create(self.new_name, self.email, self.password)

        if res.status_code not in range(199, 300):
            # A pre-existing account with this UPN is a conflict, not a generic failure:
            # surface it so the caller can route to the "link existing account" flow.
            if response_indicates_already_exists(res):
                raise MicrosoftAlreadyExistsError(
                    kind="user",
                    identifier=self.email,
                    detail=res.json(),
                )
            # since the creation fails, abort the entire flow
            raise ValidationError({"MS_ERROR": res.json()})

        # enable mail functionality for the user
        user_id = res.json()["id"]
        time.sleep(_MS_GRAPH_MUTATION_GAP_SEC)
        res = self.ms_user.enable_mail(user_id, self.email)

        if res.status_code not in range(199, 300):
            # mail-enabling fails.
            # Abort entire flow AND delete the previously created user to maintain data consistency.
            _rollback_entra_user(self.ms_user, user_id)
            raise ValidationError({"MS_ERROR": res.json()})
        if self.assign_license:
            license_id = ""
            if self.user_type == "staff":
                license_id = self.tenant.staff_license_id
            elif self.user_type == "student":
                license_id = self.tenant.student_license_id

            time.sleep(_MS_GRAPH_MUTATION_GAP_SEC)
            # create() set usageLocation; no extra PATCH before assignLicense.
            res = self.ms_user.assign_license(
                user_id, license_id, ensure_usage_location=False
            )

            if res.status_code not in range(199, 300):
                # License assignment failed: delete the orphaned Entra user so a later
                # retry/link starts from a clean state (mirrors the mail-enable rollback).
                _rollback_entra_user(self.ms_user, user_id)
                raise ValidationError(
                    {
                        "MS_ERROR": res.json(),
                        "step": "license assignment",
                        "license_blocked": True,
                    }
                )

        return user_id


class CreateTeamFlow:
    def __init__(self, name: str, tenant):
        self.name = name
        self.tenant = tenant
        self.ms_group = MSGroup(tenant)

    def start(self):
        res = self.ms_group.create(self.name)
        if res.status_code not in range(199, 300):
            raise ValidationError({"MS_ERROR": res.json(), "step": "creating group"})

        # after successful creation, we need to get the group_id uuid from the response's headers.
        # why tf is it in the headers? No idea. It's how the Graph API works.
        group_id = res.headers["Content-Location"].split("'")[1::2][0]

        return {"group_id": group_id}

    def schedule_payment_assignment(self, course_id: int):
        """
        Schedule async creation of the current month's payment assignment for the course.
        Call after the course is created. Runs asynchronously via django_q.
        """
        schema_name = getattr(self.tenant, "schema_name", None)
        if not schema_name:
            return
        create_payment_assignment_for_course_async.delay(
            course_id,
            schema_name,
        )
