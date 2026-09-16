from app_organization.models import Organization
from app_auth.models import User
from tenant_schemas.utils import get_public_schema_name, schema_context


def find_tenants_of_user(email: str):
    tenants = Organization.objects.raw(
        """
        SELECT 1 AS id, * FROM  get_tenants_by_email(%s)
        """,
        [email]
    )
    return tenants


def authenticate_with_multiple_tenants(email: str, tenants: list[str], password: str):
    is_legit = False
    for t in tenants:
        with schema_context(t):
            u: User = User.objects.filter(email=email).first()
            is_legit = u.check_password(password)
    return is_legit


def run_for_all_orgs(callback, org_filters):
    with schema_context(get_public_schema_name()):
        orgs = Organization.objects.filter(**org_filters).all()
    for org in orgs:
        with schema_context(org.schema_name):
            callback(org)