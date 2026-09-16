from django.db import migrations

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

DROP_TRIGGERS_SQL = """
DROP TRIGGER IF EXISTS trg_userdep_refresh_search_text ON app_department_userdepartment;
DROP TRIGGER IF EXISTS trg_department_refresh_user_search_text ON app_department_department;
DROP TRIGGER IF EXISTS trg_job_refresh_user_search_text ON app_department_job;
"""

DROP_FUNCTIONS_SQL = """
DROP FUNCTION IF EXISTS trg_userdep_refresh_search_text() CASCADE;
DROP FUNCTION IF EXISTS trg_department_refresh_user_search_text() CASCADE;
DROP FUNCTION IF EXISTS trg_job_refresh_user_search_text() CASCADE;
DROP FUNCTION IF EXISTS refresh_user_search_text(bigint) CASCADE;
DROP FUNCTION IF EXISTS compute_user_search_text(bigint) CASCADE;
"""


class Migration(migrations.Migration):
    dependencies = [
        ("app_auth", "0047_user_search_text_and_vector"),
        ("app_department", "0001_initial"),
    ]

    operations = [
        migrations.RunSQL(
            sql=COMPUTE_USER_SEARCH_TEXT_SQL,
            reverse_sql="DROP FUNCTION IF EXISTS compute_user_search_text(bigint);",
        ),
        migrations.RunSQL(
            sql=REFRESH_USER_SEARCH_TEXT_SQL,
            reverse_sql="DROP FUNCTION IF EXISTS refresh_user_search_text(bigint);",
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
            reverse_sql=DROP_TRIGGERS_SQL,
        ),
    ]
