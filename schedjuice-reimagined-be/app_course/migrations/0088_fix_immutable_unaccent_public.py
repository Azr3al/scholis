from django.db import migrations

# Historical fix-up migration. Kept as a no-op on schemas where it already ran;
# 0091 is the authoritative bulletproof fix for any tenant still in a broken state.


class Migration(migrations.Migration):
    dependencies = [
        ("app_course", "0087_course_search_vector_gin"),
    ]

    operations = [
        migrations.RunSQL(
            sql="SELECT 1;",
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
