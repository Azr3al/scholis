# Drop orphan UNIQUE (user_id, course_id, billing_start_date, billing_end_date)
# on UserPayment. The constraint exists in some tenant schemas but was never
# declared on the Django model. Multi-part groups (and intentional overlapping
# standalone payments) insert multiple rows that share that key.

from django.db import migrations

CONSTRAINT_NAME = "app_finance_userpayment_user_id_course_id_billin_300fd943_uniq"

DROP_SQL = f"""
ALTER TABLE app_finance_userpayment
DROP CONSTRAINT IF EXISTS {CONSTRAINT_NAME};
"""


class Migration(migrations.Migration):
    dependencies = [
        ("app_finance", "0062_user_payment_group"),
    ]

    operations = [
        migrations.RunSQL(
            sql=DROP_SQL,
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
