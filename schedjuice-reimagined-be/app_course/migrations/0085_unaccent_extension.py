from django.db import migrations

# Install in public so every tenant schema can call public.unaccent() from generated columns.
UNACCENT_PUBLIC_SQL = "CREATE EXTENSION IF NOT EXISTS unaccent SCHEMA public;"


class Migration(migrations.Migration):
    dependencies = [
        ("app_course", "0084_pg_trgm_course_search"),
    ]

    operations = [
        migrations.RunSQL(
            sql=UNACCENT_PUBLIC_SQL,
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
