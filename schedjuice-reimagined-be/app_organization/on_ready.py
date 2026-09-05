
from tenant_schemas.utils import schema_context
from django.db import connection
def create_db_function():
    with connection.cursor() as cursor:
        cursor.execute("set search_path = 'public';")
        cursor.execute(
        """
        CREATE OR REPLACE FUNCTION get_tenants_by_email(target_email text)
    RETURNS TABLE
            (
                organization_id   bigint,
                organization_name varchar,
                schema_name       varchar
            )
AS
$$
DECLARE
    dyn_sql text;
BEGIN
    -- Build a dynamic query that unions results from all tenant schemas
    SELECT string_agg(
                   format(
                           $f$
            SELECT
            o.id AS organization_id,
            o.name AS organization_name,
            o.schema_name
            FROM public.app_organization_organization o
            JOIN %I.app_auth_user u
              ON u.email = %L
            WHERE o.schema_name = %L
            $f$,
                           t.schema_name, target_email, t.schema_name
                   ),
                   ' UNION ALL '
           )
    INTO dyn_sql
    FROM information_schema.schemata t
    WHERE t.schema_name LIKE 'x%';

    -- Execute the query and return the results
    RETURN QUERY EXECUTE dyn_sql;
END;
$$ LANGUAGE plpgsql;
        """
    )


# public tenant is just another tenant model with is_public set to True.
# Don't confuse wit the public schema
def create_public_tenant():
    from app_organization.models import Organization
    from tenant_schemas.utils import get_public_schema_name

    with schema_context(get_public_schema_name()):
        public_tenant = Organization.objects.filter(is_public=True).first()
        if public_tenant:
            return public_tenant
        else:
            public_tenant = Organization.objects.create(
                is_public=True,
                name="Public Tenant",
                schema_name="xpublic",
                available_domains=["xpublic.example.com"],
            )
            print("Created public tenant:", public_tenant.name)
            return public_tenant

def run_on_ready_commands(name: str):
    create_db_function()
    print(f"{name}: Created function get_tenants_by_email")
    create_public_tenant()
    print(f"{name}: Created public tenant if it didn't exist")


