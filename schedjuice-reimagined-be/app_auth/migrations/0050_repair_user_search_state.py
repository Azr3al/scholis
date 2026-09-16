"""Idempotent repair for User FTS migration chain (mirrors app_course.0091)."""
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

COMPUTE_USER_SEARCH_TEXT_SQL = """
CREATE OR REPLACE FUNCTION compute_user_search_text(target_user_id bigint)
RETURNS text
LANGUAGE sql
STABLE
AS $func$
  SELECT coalesce(string_agg(token, ' ' ORDER BY token), '')
  FROM (
    SELECT d.name AS token
    FROM app_department_userdepartment ud
    JOIN app_department_department d ON d.id = ud.department_id
    WHERE ud.user_id = target_user_id
    UNION ALL
    SELECT j.name AS token
    FROM app_department_userdepartment ud
    JOIN app_department_job j ON j.id = ud.job_id
    WHERE ud.user_id = target_user_id
  ) parts
  WHERE token IS NOT NULL AND token <> '';
$func$;
"""

REFRESH_USER_SEARCH_TEXT_SQL = """
CREATE OR REPLACE FUNCTION refresh_user_search_text(target_user_id bigint)
RETURNS void
LANGUAGE plpgsql
AS $func$
BEGIN
  IF target_user_id IS NULL THEN
    RETURN;
  END IF;
  UPDATE app_auth_user
     SET search_text = compute_user_search_text(target_user_id)
   WHERE id = target_user_id;
END;
$func$;
"""

TRG_USERDEP_REFRESH_FN_SQL = """
CREATE OR REPLACE FUNCTION trg_userdep_refresh_search_text()
RETURNS trigger
LANGUAGE plpgsql
AS $func$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_user_search_text(OLD.user_id);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
      PERFORM refresh_user_search_text(OLD.user_id);
    END IF;
    PERFORM refresh_user_search_text(NEW.user_id);
    RETURN NEW;
  ELSE
    PERFORM refresh_user_search_text(NEW.user_id);
    RETURN NEW;
  END IF;
END;
$func$;
"""

TRG_DEPARTMENT_REFRESH_FN_SQL = """
CREATE OR REPLACE FUNCTION trg_department_refresh_user_search_text()
RETURNS trigger
LANGUAGE plpgsql
AS $func$
DECLARE
  uid bigint;
BEGIN
  IF TG_OP <> 'UPDATE' OR NEW.name IS NOT DISTINCT FROM OLD.name THEN
    RETURN NEW;
  END IF;
  FOR uid IN
    SELECT DISTINCT ud.user_id
    FROM app_department_userdepartment ud
    WHERE ud.department_id = NEW.id
  LOOP
    PERFORM refresh_user_search_text(uid);
  END LOOP;
  RETURN NEW;
END;
$func$;
"""

TRG_JOB_REFRESH_FN_SQL = """
CREATE OR REPLACE FUNCTION trg_job_refresh_user_search_text()
RETURNS trigger
LANGUAGE plpgsql
AS $func$
DECLARE
  uid bigint;
BEGIN
  IF TG_OP <> 'UPDATE' OR NEW.name IS NOT DISTINCT FROM OLD.name THEN
    RETURN NEW;
  END IF;
  FOR uid IN
    SELECT DISTINCT ud.user_id
    FROM app_department_userdepartment ud
    WHERE ud.job_id = NEW.id
  LOOP
    PERFORM refresh_user_search_text(uid);
  END LOOP;
  RETURN NEW;
END;
$func$;
"""

CREATE_TRIGGERS_SQL = """
DROP TRIGGER IF EXISTS trg_userdep_refresh_search_text ON app_department_userdepartment;
CREATE TRIGGER trg_userdep_refresh_search_text
  AFTER INSERT OR UPDATE OR DELETE ON app_department_userdepartment
  FOR EACH ROW EXECUTE PROCEDURE trg_userdep_refresh_search_text();

DROP TRIGGER IF EXISTS trg_department_refresh_user_search_text ON app_department_department;
CREATE TRIGGER trg_department_refresh_user_search_text
  AFTER UPDATE OF name ON app_department_department
  FOR EACH ROW EXECUTE PROCEDURE trg_department_refresh_user_search_text();

DROP TRIGGER IF EXISTS trg_job_refresh_user_search_text ON app_department_job;
CREATE TRIGGER trg_job_refresh_user_search_text
  AFTER UPDATE OF name ON app_department_job
  FOR EACH ROW EXECUTE PROCEDURE trg_job_refresh_user_search_text();
"""

ADD_SEARCH_TEXT_IF_MISSING_SQL = """
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'app_auth_user'
      AND column_name = 'search_text'
  ) THEN
    ALTER TABLE app_auth_user
      ADD COLUMN search_text text NOT NULL DEFAULT '';
  END IF;
END
$migration$;
"""

ADD_SEARCH_VECTOR_IF_MISSING_SQL = r"""
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'app_auth_user'
      AND column_name = 'search_text'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'app_auth_user'
      AND column_name = 'search_vector'
  ) THEN
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
  END IF;
END
$migration$;
"""

ADD_GIN_INDEX_IF_MISSING_SQL = """
CREATE INDEX CONCURRENTLY IF NOT EXISTS user_search_vector_gin
  ON app_auth_user USING gin (search_vector);
"""


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("app_auth", "0049_user_search_vector_gin"),
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
            sql=COMPUTE_USER_SEARCH_TEXT_SQL,
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.RunSQL(
            sql=REFRESH_USER_SEARCH_TEXT_SQL,
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.RunSQL(
            sql=TRG_USERDEP_REFRESH_FN_SQL,
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.RunSQL(
            sql=TRG_DEPARTMENT_REFRESH_FN_SQL,
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.RunSQL(
            sql=TRG_JOB_REFRESH_FN_SQL,
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.RunSQL(
            sql=CREATE_TRIGGERS_SQL,
            reverse_sql=migrations.RunSQL.noop,
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
            reverse_sql="DROP INDEX IF EXISTS user_search_vector_gin;",
        ),
    ]
