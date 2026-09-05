# Generated manually for PaymentAssignment model

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("app_course", "0057_merge_20260213_1636"),
    ]

    operations = [
        migrations.CreateModel(
            name="PaymentAssignment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("year", models.PositiveIntegerField(help_text="Calendar year, e.g. 2025")),
                (
                    "month_index",
                    models.PositiveIntegerField(help_text="Calendar month: 1=Jan, 2=Feb, ..., 12=Dec"),
                ),
                ("microsoft_assignment_id", models.CharField(max_length=512)),
                (
                    "course",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="payment_assignments",
                        to="app_course.course",
                    ),
                ),
            ],
            options={
                "ordering": ("course", "year", "month_index"),
                "unique_together": {("course", "year", "month_index")},
            },
        ),
    ]
