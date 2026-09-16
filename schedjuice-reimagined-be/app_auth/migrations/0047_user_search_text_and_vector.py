from django.contrib.postgres.search import SearchVectorField
from django.db import migrations, models

# Reuse immutable_unaccent from course FTS chain; re-assert for tenants that only run app_auth.
ENSURE_UNACCENT_IN_PUBLIC_SQL = r"""
DO $migration$
DECLARE
  ext_schema text;
BEGIN
  SELECT n.nspname INTO ext_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'unaccent';

  IF ext_schema IS NULL THEN
    CREATE EXTENSION unaccent SCHEMA public;
  ELSIF ext_schema <> 'public' THEN
    EXECUTE 'ALTER EXTENSION unaccent SET SCHEMA public';
  END IF;
END
$migration$;
"""

IMMUTABLE_UNACCENT_SQL = """
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $func$
  SELECT public.unaccent($1)
$func$;
"""

IMMUTABLE_UNACCENT_REVERSE = "DROP FUNCTION IF EXISTS immutable_unaccent(text);"

# Phone digit columns from migration 0046 are themselves GENERATED STORED, and Postgres forbids
# a generated column from referencing another generated column. Inline the same expression here
# so search_vector depends only on real (non-generated) columns.
SEARCH_VECTOR_SQL = r"""
ALTER TABLE app_auth_user
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(immutable_unaccent(name), '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(immutable_unaccent(code), '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(immutable_unaccent(alternative_name), '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(immutable_unaccent(email), '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(immutable_unaccent(communication_email), '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(immutable_unaccent(search_text), '')), 'B') ||
    setweight(to_tsvector('simple', regexp_replace(coalesce(phone_number, ''), '\D', '', 'g')), 'C') ||
    setweight(to_tsvector('simple', regexp_replace(coalesce(emergency_contact_phone_number, ''), '\D', '', 'g')), 'C') ||
    setweight(to_tsvector('simple', coalesce(immutable_unaccent(emergency_contact_name), '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(immutable_unaccent(emergency_contact_relationship), '')), 'C')
  ) STORED;
"""


class Migration(migrations.Migration):
    dependencies = [
        ("app_auth", "0046_pg_trgm_user_search"),
        ("app_course", "0091_repair_course_search_state"),
    ]

    operations = [
        migrations.RunSQL(
            sql=ENSURE_UNACCENT_IN_PUBLIC_SQL,
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.AddField(
            model_name="user",
            name="search_text",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.RunSQL(
            sql=IMMUTABLE_UNACCENT_SQL,
            reverse_sql=IMMUTABLE_UNACCENT_REVERSE,
        ),
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql=SEARCH_VECTOR_SQL,
                    reverse_sql="ALTER TABLE app_auth_user DROP COLUMN IF EXISTS search_vector;",
                ),
            ],
            state_operations=[
                migrations.AddField(
                    model_name="user",
                    name="search_vector",
                    field=SearchVectorField(editable=False, null=True),
                ),
            ],
        ),
    ]
