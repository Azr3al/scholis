from django.db import migrations


class Migration(migrations.Migration):
    """GIN index on search_vector for FTS. Non-atomic so CREATE INDEX CONCURRENTLY works."""

    atomic = False

    dependencies = [
        ("app_auth", "0048_user_search_text_triggers"),
    ]

    operations = [
        migrations.RunSQL(
            sql=(
                "CREATE INDEX CONCURRENTLY IF NOT EXISTS user_search_vector_gin "
                "ON app_auth_user USING gin (search_vector);"
            ),
            reverse_sql="DROP INDEX IF EXISTS user_search_vector_gin;",
        ),
    ]
