from django.contrib.postgres.fields import ArrayField
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("app_custom_fields", "0003_alter_customfielddefinition_form_input_mode_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="FieldGroup",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("entity_type", models.CharField(db_index=True, max_length=128)),
                ("name", models.CharField(max_length=255)),
                ("sort_order", models.IntegerField(default=0)),
                ("is_active", models.BooleanField(db_index=True, default=True)),
            ],
            options={"ordering": ("sort_order", "id")},
        ),
        migrations.RenameModel(
            old_name="CustomFieldDefinition",
            new_name="FieldDefinition",
        ),
        migrations.AlterModelTable(
            name="fielddefinition",
            table="app_custom_fields_customfielddefinition",
        ),
        migrations.AddField(
            model_name="fielddefinition",
            name="source",
            field=models.CharField(
                choices=[("custom", "custom"), ("builtin", "builtin")],
                db_index=True,
                default="custom",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="fielddefinition",
            name="required_at",
            field=models.CharField(
                choices=[
                    ("registration", "registration"),
                    ("profile_completion", "profile_completion"),
                    ("never", "never"),
                ],
                default="never",
                max_length=24,
            ),
        ),
        migrations.AddField(
            model_name="fielddefinition",
            name="roles",
            field=ArrayField(
                base_field=models.CharField(max_length=128),
                blank=True,
                default=list,
                size=None,
            ),
        ),
        migrations.AddField(
            model_name="fielddefinition",
            name="filled_by",
            field=models.CharField(
                choices=[("user", "user"), ("admin", "admin"), ("both", "both")],
                default="both",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="fielddefinition",
            name="group",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="fields",
                to="app_custom_fields.fieldgroup",
            ),
        ),
        migrations.AlterField(
            model_name="fielddefinition",
            name="field_type",
            field=models.CharField(
                blank=True,
                choices=[
                    ("text", "text"), ("textarea", "textarea"), ("number", "number"),
                    ("date", "date"), ("datetime", "datetime"), ("boolean", "boolean"),
                    ("choice", "choice"), ("multichoice", "multichoice"),
                    ("email", "email"), ("url", "url"),
                ],
                max_length=32,
                null=True,
            ),
        ),
        migrations.AlterField(
            model_name="fielddefinition",
            name="show_on_create",
            field=models.BooleanField(
                default=True,
                help_text="Show on create forms (subject to filled_by when on form).",
            ),
        ),
        migrations.AlterField(
            model_name="fielddefinition",
            name="show_on_edit",
            field=models.BooleanField(
                default=True,
                help_text="Show on edit forms (subject to filled_by when on form).",
            ),
        ),
        migrations.AlterField(
            model_name="fielddefinition",
            name="form_input_mode",
            field=models.CharField(
                choices=[("editable", "editable"), ("read_only", "read_only")],
                default="editable",
                help_text="Deprecated; derived from filled_by. Kept until FE migrates.",
                max_length=16,
            ),
        ),
    ]
