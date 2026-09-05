from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app_finance", "0079_payment_receipt_numbering"),
    ]

    operations = [
        migrations.AddField(
            model_name="userpaymentgroup",
            name="group_kind",
            field=models.CharField(
                choices=[
                    ("split_screenshots", "split_screenshots"),
                    ("multi_course", "multi_course"),
                ],
                default="split_screenshots",
                max_length=32,
            ),
        ),
    ]
