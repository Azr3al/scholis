import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_organization", "0040_organization_currency_fields"),
    ]

    operations = [
        migrations.CreateModel(
            name="GraphSubscription",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "resource",
                    models.CharField(
                        help_text="e.g. communications/onlineMeetings/getAllRecordings",
                        max_length=1024,
                    ),
                ),
                ("subscription_id", models.CharField(max_length=512, unique=True)),
                ("expiration_datetime", models.DateTimeField()),
                ("client_state", models.CharField(blank=True, default="", max_length=512)),
                (
                    "organization",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="graph_subscriptions",
                        to="app_organization.organization",
                    ),
                ),
            ],
            options={
                "abstract": False,
            },
        ),
        migrations.AddConstraint(
            model_name="graphsubscription",
            constraint=models.UniqueConstraint(
                fields=("organization", "resource"),
                name="uniq_graph_subscription_org_resource",
            ),
        ),
    ]
