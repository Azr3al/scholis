from django.contrib.postgres.search import SearchVectorField
from django.db import migrations, models

CATEGORY_SEARCH_VECTOR_SQL = """
ALTER TABLE app_course_category
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(immutable_unaccent(name), '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(immutable_unaccent(coalesce(description, '')), '')), 'B')
  ) STORED;
"""

CATEGORY_SEARCH_VECTOR_GIN_SQL = """
CREATE INDEX CONCURRENTLY IF NOT EXISTS category_search_vector_gin
  ON app_course_category USING gin (search_vector);
"""


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("app_course", "0099_god_view_perf_indexes"),
    ]

    operations = [
        migrations.AddField(
            model_name="category",
            name="search_text",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql=CATEGORY_SEARCH_VECTOR_SQL,
                    reverse_sql=(
                        "ALTER TABLE app_course_category "
                        "DROP COLUMN IF EXISTS search_vector;"
                    ),
                ),
            ],
            state_operations=[
                migrations.AddField(
                    model_name="category",
                    name="search_vector",
                    field=SearchVectorField(editable=False, null=True),
                ),
            ],
        ),
        migrations.RunSQL(
            sql=CATEGORY_SEARCH_VECTOR_GIN_SQL,
            reverse_sql="DROP INDEX IF EXISTS category_search_vector_gin;",
        ),
    ]
