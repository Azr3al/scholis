# Generated manually for UserPayment.microsoft_submission_id

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_finance", "0049_receiversidescreenshot_user_payment"),
    ]

    operations = [
        migrations.AddField(
            model_name="userpayment",
            name="microsoft_submission_id",
            field=models.CharField(blank=True, max_length=512, null=True, unique=True),
        ),
    ]
