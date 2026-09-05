"""
Widen phone_number columns; Postgres forbids ALTER on columns used by generated columns.

Drop phone_number_digits, emergency_contact_phone_number_digits, and search_vector
(and their indexes), alter the source varchar columns, then recreate generated columns.

Each SQL statement is its own RunSQL — multi-statement strings only execute the first
statement under psycopg2/Django.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("app_auth", "0057_user_public_profile"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql="DROP INDEX IF EXISTS user_phone_digits_trgm_idx;",
                    reverse_sql=migrations.RunSQL.noop,
                ),
                migrations.RunSQL(
                    sql="DROP INDEX IF EXISTS user_emergency_contact_phone_digits_trgm_idx;",
                    reverse_sql=migrations.RunSQL.noop,
                ),
                migrations.RunSQL(
                    sql="DROP INDEX IF EXISTS user_search_vector_gin;",
                    reverse_sql=migrations.RunSQL.noop,
                ),
                migrations.RunSQL(
                    sql="ALTER TABLE app_auth_user DROP COLUMN IF EXISTS phone_number_digits;",
                    reverse_sql=migrations.RunSQL.noop,
                ),
                migrations.RunSQL(
                    sql=(
                        "ALTER TABLE app_auth_user "
                        "DROP COLUMN IF EXISTS emergency_contact_phone_number_digits;"
                    ),
                    reverse_sql=migrations.RunSQL.noop,
                ),
                migrations.RunSQL(
                    sql="ALTER TABLE app_auth_user DROP COLUMN IF EXISTS search_vector;",
                    reverse_sql=migrations.RunSQL.noop,
                ),
                migrations.RunSQL(
                    sql=(
                        "ALTER TABLE app_auth_user "
                        "ALTER COLUMN phone_number TYPE varchar(512);"
                    ),
                    reverse_sql=(
                        "ALTER TABLE app_auth_user "
                        "ALTER COLUMN phone_number TYPE varchar(32);"
                    ),
                ),
                migrations.RunSQL(
                    sql=(
                        "ALTER TABLE app_auth_user "
                        "ALTER COLUMN emergency_contact_phone_number TYPE varchar(512);"
                    ),
                    reverse_sql=(
                        "ALTER TABLE app_auth_user "
                        "ALTER COLUMN emergency_contact_phone_number TYPE varchar(32);"
                    ),
                ),
                migrations.RunSQL(
                    sql=(
                        "ALTER TABLE app_auth_user "
                        "ADD COLUMN phone_number_digits text "
                        "GENERATED ALWAYS AS ("
                        "regexp_replace(coalesce(phone_number, ''), '\\D', '', 'g')"
                        ") STORED;"
                    ),
                    reverse_sql=(
                        "ALTER TABLE app_auth_user DROP COLUMN IF EXISTS phone_number_digits;"
                    ),
                ),
                migrations.RunSQL(
                    sql=(
                        "ALTER TABLE app_auth_user "
                        "ADD COLUMN emergency_contact_phone_number_digits text "
                        "GENERATED ALWAYS AS ("
                        "regexp_replace(coalesce(emergency_contact_phone_number, ''), '\\D', '', 'g')"
                        ") STORED;"
                    ),
                    reverse_sql=(
                        "ALTER TABLE app_auth_user "
                        "DROP COLUMN IF EXISTS emergency_contact_phone_number_digits;"
                    ),
                ),
                migrations.RunSQL(
                    sql=r"""
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
                    """,
                    reverse_sql="ALTER TABLE app_auth_user DROP COLUMN IF EXISTS search_vector;",
                ),
                migrations.RunSQL(
                    sql=(
                        "CREATE INDEX CONCURRENTLY IF NOT EXISTS user_phone_digits_trgm_idx "
                        "ON app_auth_user USING gin (phone_number_digits gin_trgm_ops);"
                    ),
                    reverse_sql="DROP INDEX IF EXISTS user_phone_digits_trgm_idx;",
                ),
                migrations.RunSQL(
                    sql=(
                        "CREATE INDEX CONCURRENTLY IF NOT EXISTS "
                        "user_emergency_contact_phone_digits_trgm_idx "
                        "ON app_auth_user USING gin (emergency_contact_phone_number_digits gin_trgm_ops);"
                    ),
                    reverse_sql=(
                        "DROP INDEX IF EXISTS user_emergency_contact_phone_digits_trgm_idx;"
                    ),
                ),
                migrations.RunSQL(
                    sql=(
                        "CREATE INDEX CONCURRENTLY IF NOT EXISTS user_search_vector_gin "
                        "ON app_auth_user USING gin (search_vector);"
                    ),
                    reverse_sql="DROP INDEX IF EXISTS user_search_vector_gin;",
                ),
            ],
            state_operations=[
                migrations.AlterField(
                    model_name="user",
                    name="phone_number",
                    field=models.CharField(max_length=512),
                ),
                migrations.AlterField(
                    model_name="user",
                    name="emergency_contact_phone_number",
                    field=models.CharField(blank=True, max_length=512, null=True),
                ),
            ],
        ),
    ]
