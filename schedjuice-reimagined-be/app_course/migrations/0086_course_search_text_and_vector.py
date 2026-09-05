from django.contrib.postgres.search import SearchVectorField
from django.db import migrations, models

# Move/install the unaccent extension into `public` regardless of where it was created.
# CREATE EXTENSION IF NOT EXISTS is a no-op when the extension already exists in some
# other schema, so we explicitly relocate it. Then `public.unaccent(text)` (the one-arg
# default-dictionary form the extension installs) is reachable from every tenant schema.
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

# unaccent() is STABLE; wrap it in an IMMUTABLE function so it can be used inside a
# GENERATED column expression. Schema-qualify the call so the function works no matter
# what search_path the caller has.
IMMUTABLE_UNACCENT_SQL = """
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $func$
  SELECT public.unaccent($1)
$func$;
"""

IMMUTABLE_UNACCENT_REVERSE = "DROP FUNCTION IF EXISTS immutable_unaccent(text);"

SEARCH_VECTOR_SQL = """
ALTER TABLE app_course_course
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(immutable_unaccent(title), '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(immutable_unaccent(code), '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(immutable_unaccent(search_text), '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(immutable_unaccent(description), '')), 'C')
  ) STORED;
"""


class Migration(migrations.Migration):
    dependencies = [
        ("app_course", "0085_unaccent_extension"),
    ]

    operations = [
        migrations.RunSQL(
            sql=ENSURE_UNACCENT_IN_PUBLIC_SQL,
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.AddField(
            model_name="course",
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
                    reverse_sql="ALTER TABLE app_course_course DROP COLUMN IF EXISTS search_vector;",
                ),
            ],
            state_operations=[
                migrations.AddField(
                    model_name="course",
                    name="search_vector",
                    field=SearchVectorField(editable=False, null=True),
                ),
            ],
        ),
    ]
