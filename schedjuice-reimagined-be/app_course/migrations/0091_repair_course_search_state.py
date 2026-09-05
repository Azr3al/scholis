"""Bulletproof repair for the Course FTS migration chain.

Some tenants applied 0086-0090 with earlier (broken) immutable_unaccent definitions and
the unaccent extension landed in inconsistent schemas. This migration:

1. Forces the unaccent extension into the `public` schema (ALTER EXTENSION ... SET
   SCHEMA), since CREATE EXTENSION IF NOT EXISTS is a no-op when the extension already
   exists in any schema.
2. (Re)defines `immutable_unaccent(text)` with body `SELECT public.unaccent($1)`. Using
   the schema-qualified one-arg form means callers don't need any particular
   search_path and we never look up a tenant-local text-search dictionary.
3. Ensures `search_text`, `search_vector`, and the GIN index exist (finishes the work
   for any tenant whose 0086 partially failed).

Idempotent on tenants that already finished migrations 0086/0087.
"""
from django.db import migrations


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


ADD_SEARCH_TEXT_IF_MISSING_SQL = """
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'app_course_course'
      AND column_name = 'search_text'
  ) THEN
    ALTER TABLE app_course_course
      ADD COLUMN search_text text NOT NULL DEFAULT '';
  END IF;
END
$migration$;
"""


ADD_SEARCH_VECTOR_IF_MISSING_SQL = """
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'app_course_course'
      AND column_name = 'search_text'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'app_course_course'
      AND column_name = 'search_vector'
  ) THEN
    ALTER TABLE app_course_course
      ADD COLUMN search_vector tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce(immutable_unaccent(title), '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(immutable_unaccent(code), '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(immutable_unaccent(search_text), '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(immutable_unaccent(description), '')), 'C')
      ) STORED;
  END IF;
END
$migration$;
"""


ADD_GIN_INDEX_IF_MISSING_SQL = """
CREATE INDEX CONCURRENTLY IF NOT EXISTS course_search_vector_gin
  ON app_course_course USING gin (search_vector);
"""


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("app_course", "0090_immutable_unaccent_public_dictionary"),
    ]

    operations = [
        migrations.RunSQL(
            sql=ENSURE_UNACCENT_IN_PUBLIC_SQL,
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.RunSQL(
            sql=IMMUTABLE_UNACCENT_SQL,
            reverse_sql="DROP FUNCTION IF EXISTS immutable_unaccent(text);",
        ),
        migrations.RunSQL(
            sql=ADD_SEARCH_TEXT_IF_MISSING_SQL,
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.RunSQL(
            sql=ADD_SEARCH_VECTOR_IF_MISSING_SQL,
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.RunSQL(
            sql=ADD_GIN_INDEX_IF_MISSING_SQL,
            reverse_sql="DROP INDEX IF EXISTS course_search_vector_gin;",
        ),
    ]
