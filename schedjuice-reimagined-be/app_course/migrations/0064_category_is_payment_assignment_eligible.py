# Add is_payment_assignment_eligible to Category

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_course", "0063_processedteamsrecording_file_path"),
    ]

    operations = [
        migrations.AddField(
            model_name="category",
            name="is_payment_assignment_eligible",
            field=models.BooleanField(
                default=True,
                help_text="If True, courses in this category are eligible for MS Teams payment assignment creation.",
            ),
        ),
    ]
