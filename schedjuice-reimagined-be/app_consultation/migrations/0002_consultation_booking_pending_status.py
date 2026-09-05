from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_consultation", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="consultationbooking",
            name="status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("confirmed", "Confirmed"),
                    ("cancelled", "Cancelled"),
                ],
                default="pending",
                max_length=16,
            ),
        ),
    ]
