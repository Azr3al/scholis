from django.db import migrations


class Migration(migrations.Migration):
    """
    GIN index on search_vector for FTS. Non-atomic so CREATE INDEX CONCURRENTLY works.
    """

    atomic = False

    dependencies = [
        ("app_course", "0086_course_search_text_and_vector"),
    ]

    operations = [
        migrations.RunSQL(
            sql=(
                "CREATE INDEX CONCURRENTLY IF NOT EXISTS course_search_vector_gin "
                "ON app_course_course USING gin (search_vector);"
            ),
            reverse_sql="DROP INDEX IF EXISTS course_search_vector_gin;",
        ),
    ]
