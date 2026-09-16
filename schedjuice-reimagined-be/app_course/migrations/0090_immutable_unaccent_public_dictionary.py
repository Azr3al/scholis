from django.db import migrations

# Historical fix-up migration; superseded by 0091.


class Migration(migrations.Migration):
    dependencies = [
        ("app_course", "0089_unaccent_regdictionary_wrapper"),
    ]

    operations = [
        migrations.RunSQL(
            sql="SELECT 1;",
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
