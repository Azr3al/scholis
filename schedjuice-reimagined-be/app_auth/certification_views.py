from __future__ import annotations

from rest_framework.exceptions import PermissionDenied
from rest_framework.views import Request

from app_auth.certification_serializers import UserCertificationSerializer
from app_auth.models import User, UserCertification
from app_auth.staff_helpers import user_is_staff
from app_auth.user_scoping import acting_user, check_user_write
from app_rbac.views import RBACView
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication


def _can_manage_certifications(actor: User, subject: User) -> bool:
    if actor.id == subject.id:
        return True
    try:
        check_user_write(actor, subject)
        return True
    except PermissionDenied:
        return False


class UserCertificationListCreateView(RBACView):
    name = "User certifications list/create"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"

    def get(self, request: Request, user_id: int):
        actor = acting_user(request)
        if actor is None:
            return self.unauthorized("Authentication required.")
        subject = User.objects.filter(pk=user_id).first()
        if subject is None:
            return self.not_found("User not found.")
        if not _can_manage_certifications(actor, subject):
            return self.forbidden("Not allowed for this user.")
        qs = UserCertification.objects.filter(user=subject).select_related("attachment")
        ser = UserCertificationSerializer(qs, many=True, context={"subject_user": subject})
        return self.ok(ser.data)

    def post(self, request: Request, user_id: int):
        actor = acting_user(request)
        if actor is None:
            return self.unauthorized("Authentication required.")
        subject = User.objects.filter(pk=user_id).first()
        if subject is None or not user_is_staff(subject):
            return self.not_found("User not found.")
        if not _can_manage_certifications(actor, subject):
            return self.forbidden("Not allowed for this user.")
        ser = UserCertificationSerializer(
            data=request.data,
            context={"subject_user": subject, "actor": actor},
        )
        if not ser.is_valid():
            return self.bad_request(details=ser.errors)
        cert = ser.save()
        out = UserCertificationSerializer(cert, context={"subject_user": subject})
        return self.created(out.data)


class UserCertificationDetailView(RBACView):
    name = "User certification detail"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"

    def _get_cert(self, user_id: int, cert_id: int):
        return (
            UserCertification.objects.select_related("attachment", "user")
            .filter(user_id=user_id, pk=cert_id)
            .first()
        )

    def patch(self, request: Request, user_id: int, cert_id: int):
        actor = acting_user(request)
        if actor is None:
            return self.unauthorized("Authentication required.")
        cert = self._get_cert(user_id, cert_id)
        if cert is None:
            return self.not_found("Certification not found.")
        if not _can_manage_certifications(actor, cert.user):
            return self.forbidden("Not allowed for this user.")
        ser = UserCertificationSerializer(
            cert,
            data=request.data,
            partial=True,
            context={"subject_user": cert.user, "actor": actor},
        )
        if not ser.is_valid():
            return self.bad_request(details=ser.errors)
        cert = ser.save()
        out = UserCertificationSerializer(cert, context={"subject_user": cert.user})
        return self.ok(out.data)

    def delete(self, request: Request, user_id: int, cert_id: int):
        actor = acting_user(request)
        if actor is None:
            return self.unauthorized("Authentication required.")
        cert = self._get_cert(user_id, cert_id)
        if cert is None:
            return self.not_found("Certification not found.")
        if not _can_manage_certifications(actor, cert.user):
            return self.forbidden("Not allowed for this user.")
        cert.delete()
        return self.deleted()
