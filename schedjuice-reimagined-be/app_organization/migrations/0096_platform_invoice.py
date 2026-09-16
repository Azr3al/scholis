from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("app_organization", "0095_organization_warn_on_long_course_duration"),
    ]

    operations = [
        migrations.CreateModel(
            name="PlatformInvoiceCounter",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("next_sequence", models.PositiveIntegerField(default=1)),
            ],
            options={
                "abstract": False,
            },
        ),
        migrations.CreateModel(
            name="PlatformInvoice",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("invoice_number", models.PositiveIntegerField(unique=True)),
                ("billing_year", models.PositiveSmallIntegerField()),
                ("billing_month", models.PositiveSmallIntegerField()),
                (
                    "status",
                    models.CharField(
                        choices=[("issued", "issued"), ("void", "void")],
                        default="issued",
                        max_length=16,
                    ),
                ),
                ("line_items", models.JSONField(default=list)),
                ("totals", models.JSONField(default=dict)),
                (
                    "generated_by_user_id",
                    models.PositiveIntegerField(blank=True, null=True),
                ),
                (
                    "generated_by_name",
                    models.CharField(blank=True, default="", max_length=4096),
                ),
                (
                    "generated_by_email",
                    models.CharField(blank=True, default="", max_length=512),
                ),
                ("generated_at", models.DateTimeField()),
                (
                    "organization",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="platform_invoices",
                        to="app_organization.organization",
                    ),
                ),
            ],
            options={
                "ordering": ["-generated_at", "-id"],
            },
        ),
        migrations.AddConstraint(
            model_name="platforminvoice",
            constraint=models.UniqueConstraint(
                condition=models.Q(("status", "issued")),
                fields=("organization", "billing_year", "billing_month"),
                name="uniq_platform_invoice_org_period_issued",
            ),
        ),
    ]
