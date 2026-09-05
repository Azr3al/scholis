from django.contrib.postgres.operations import TrigramExtension
from django.db import migrations


class Migration(migrations.Migration):
    """
    Enable pg_trgm and add GIN trigram indexes for Academic Hub fuzzy search.
    Non-atomic so CREATE INDEX CONCURRENTLY can commit independently.
    """

    atomic = False

    dependencies = [
        ("app_course", "0083_programlevelsubject"),
    ]

    operations = [
        TrigramExtension(),
        migrations.RunSQL(
            sql=(
                "CREATE INDEX CONCURRENTLY IF NOT EXISTS course_title_trgm_idx "
                "ON app_course_course USING gin (title gin_trgm_ops);"
            ),
            reverse_sql="DROP INDEX IF EXISTS course_title_trgm_idx;",
        ),
        migrations.RunSQL(
            sql=(
                "CREATE INDEX CONCURRENTLY IF NOT EXISTS course_code_trgm_idx "
                "ON app_course_course USING gin (code gin_trgm_ops);"
            ),
            reverse_sql="DROP INDEX IF EXISTS course_code_trgm_idx;",
        ),
        migrations.RunSQL(
            sql=(
                "CREATE INDEX CONCURRENTLY IF NOT EXISTS subject_name_trgm_idx "
                "ON app_course_subject USING gin (name gin_trgm_ops);"
            ),
            reverse_sql="DROP INDEX IF EXISTS subject_name_trgm_idx;",
        ),
        migrations.RunSQL(
            sql=(
                "CREATE INDEX CONCURRENTLY IF NOT EXISTS program_level_name_trgm_idx "
                "ON app_course_programlevel USING gin (name gin_trgm_ops);"
            ),
            reverse_sql="DROP INDEX IF EXISTS program_level_name_trgm_idx;",
        ),
        migrations.RunSQL(
            sql=(
                "CREATE INDEX CONCURRENTLY IF NOT EXISTS program_level_section_name_trgm_idx "
                "ON app_course_programlevelsection USING gin (name gin_trgm_ops);"
            ),
            reverse_sql="DROP INDEX IF EXISTS program_level_section_name_trgm_idx;",
        ),
    ]
