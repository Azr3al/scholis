from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="CustomFieldDefinition",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("entity_type", models.CharField(db_index=True, max_length=128)),
                ("field_key", models.SlugField(max_length=100)),
                ("field_label", models.CharField(max_length=255)),
                (
                    "field_type",
                    models.CharField(
                        choices=[
                            ("text", "text"),
                            ("textarea", "textarea"),
                            ("number", "number"),
                            ("date", "date"),
                            ("datetime", "datetime"),
                            ("boolean", "boolean"),
                            ("choice", "choice"),
                            ("multichoice", "multichoice"),
                            ("email", "email"),
                            ("url", "url"),
                        ],
                        max_length=32,
                    ),
                ),
                ("is_required", models.BooleanField(default=False)),
                ("is_filterable", models.BooleanField(default=False)),
                ("sort_order", models.IntegerField(default=0)),
                (
                    "choices",
                    models.JSONField(
                        blank=True,
                        help_text='For choice/multichoice: [{"value": "...", "label": "..."}, ...]',
                        null=True,
                    ),
                ),
                ("validation_rules", models.JSONField(blank=True, null=True)),
                ("description", models.TextField(blank=True, default="")),
                ("is_active", models.BooleanField(db_index=True, default=True)),
            ],
            options={
                "ordering": ("sort_order", "id"),
            },
        ),
        migrations.AddConstraint(
            model_name="customfielddefinition",
            constraint=models.UniqueConstraint(
                condition=models.Q(is_active=True),
                fields=("entity_type", "field_key"),
                name="uniq_customfielddefinition_entity_key_active",
            ),
        ),
    ]
