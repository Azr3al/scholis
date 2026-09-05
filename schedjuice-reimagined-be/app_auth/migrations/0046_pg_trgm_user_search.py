from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Add digits-only generated columns and GIN trigram indexes for User Hub fuzzy search.
    Non-atomic so CREATE INDEX CONCURRENTLY can commit independently.
    pg_trgm is enabled by app_course migration 0084.
    """

    atomic = False

    dependencies = [
        ("app_auth", "0045_user_zoom_oauth"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql=(
                        "ALTER TABLE app_auth_user "
                        "ADD COLUMN IF NOT EXISTS phone_number_digits text "
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
                        "ADD COLUMN IF NOT EXISTS emergency_contact_phone_number_digits text "
                        "GENERATED ALWAYS AS ("
                        "regexp_replace(coalesce(emergency_contact_phone_number, ''), '\\D', '', 'g')"
                        ") STORED;"
                    ),
                    reverse_sql=(
                        "ALTER TABLE app_auth_user "
                        "DROP COLUMN IF EXISTS emergency_contact_phone_number_digits;"
                    ),
                ),
            ],
            state_operations=[
                migrations.AddField(
                    model_name="user",
                    name="phone_number_digits",
                    field=models.TextField(blank=True, default="", editable=False),
                ),
                migrations.AddField(
                    model_name="user",
                    name="emergency_contact_phone_number_digits",
                    field=models.TextField(blank=True, default="", editable=False),
                ),
            ],
        ),
        migrations.RunSQL(
            sql=(
                "CREATE INDEX CONCURRENTLY IF NOT EXISTS user_name_trgm_idx "
                "ON app_auth_user USING gin (name gin_trgm_ops);"
            ),
            reverse_sql="DROP INDEX IF EXISTS user_name_trgm_idx;",
        ),
        migrations.RunSQL(
            sql=(
                "CREATE INDEX CONCURRENTLY IF NOT EXISTS user_alternative_name_trgm_idx "
                "ON app_auth_user USING gin (alternative_name gin_trgm_ops);"
            ),
            reverse_sql="DROP INDEX IF EXISTS user_alternative_name_trgm_idx;",
        ),
        migrations.RunSQL(
            sql=(
                "CREATE INDEX CONCURRENTLY IF NOT EXISTS user_email_trgm_idx "
                "ON app_auth_user USING gin (email gin_trgm_ops);"
            ),
            reverse_sql="DROP INDEX IF EXISTS user_email_trgm_idx;",
        ),
        migrations.RunSQL(
            sql=(
                "CREATE INDEX CONCURRENTLY IF NOT EXISTS user_communication_email_trgm_idx "
                "ON app_auth_user USING gin (communication_email gin_trgm_ops);"
            ),
            reverse_sql="DROP INDEX IF EXISTS user_communication_email_trgm_idx;",
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
                "CREATE INDEX CONCURRENTLY IF NOT EXISTS user_emergency_contact_name_trgm_idx "
                "ON app_auth_user USING gin (emergency_contact_name gin_trgm_ops);"
            ),
            reverse_sql="DROP INDEX IF EXISTS user_emergency_contact_name_trgm_idx;",
        ),
        migrations.RunSQL(
            sql=(
                "CREATE INDEX CONCURRENTLY IF NOT EXISTS user_emergency_contact_phone_digits_trgm_idx "
                "ON app_auth_user USING gin (emergency_contact_phone_number_digits gin_trgm_ops);"
            ),
            reverse_sql="DROP INDEX IF EXISTS user_emergency_contact_phone_digits_trgm_idx;",
        ),
        migrations.RunSQL(
            sql=(
                "CREATE INDEX CONCURRENTLY IF NOT EXISTS user_emergency_contact_relationship_trgm_idx "
                "ON app_auth_user USING gin (emergency_contact_relationship gin_trgm_ops);"
            ),
            reverse_sql="DROP INDEX IF EXISTS user_emergency_contact_relationship_trgm_idx;",
        ),
    ]
