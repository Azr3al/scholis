from django.db.models import Q, QuerySet

from app_auth.models import User
from app_product_docs.models import DocAudience, DocStatus


ROLE_TO_AUDIENCE = {
    User.UserRole.ADMIN: DocAudience.ADMIN,
    User.UserRole.MANAGER: DocAudience.ADMIN,
    User.UserRole.FINANCE: DocAudience.ADMIN,
    User.UserRole.HR: DocAudience.ADMIN,
    User.UserRole.TEACHER: DocAudience.TEACHER,
    User.UserRole.STUDENT: DocAudience.STUDENT,
    User.UserRole.SUPERADMIN: DocAudience.ADMIN,
}


def audiences_for_user(user) -> set[str]:
    from app_rbac.resolution import roles_for_user

    roles = roles_for_user(user)
    out: set[str] = set()
    for role in roles:
        mapped = ROLE_TO_AUDIENCE.get(role)
        if mapped:
            out.add(mapped)
    return out


def filter_articles_for_reader(qs: QuerySet, user_audiences: set[str]) -> QuerySet:
    audience_q = Q(audiences__contains=[DocAudience.ALL])
    for aud in user_audiences:
        audience_q |= Q(audiences__contains=[aud])
    return (
        qs.filter(status=DocStatus.PUBLISHED, organization__isnull=True)
        .filter(audience_q)
        .distinct()
    )


def user_attribution(request) -> dict:
    """Resolve tenant User pk + email from JWT stateless or ORM-authenticated requests."""
    from app_auth.models import User

    candidate = getattr(request, "user", None)
    if candidate is None or not getattr(candidate, "is_authenticated", False):
        return {"user_id": None, "email": ""}
    if isinstance(candidate, User):
        return {"user_id": candidate.pk, "email": candidate.email or ""}
    db_user = User.get_user_from_request(request)
    if db_user:
        return {"user_id": db_user.pk, "email": db_user.email or ""}
    email = str(getattr(candidate, "id", "") or "")
    return {"user_id": None, "email": email}
