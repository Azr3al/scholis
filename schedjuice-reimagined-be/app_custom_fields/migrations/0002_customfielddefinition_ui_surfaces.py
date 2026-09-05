from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app_custom_fields", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="customfielddefinition",
            name="show_on_create",
            field=models.BooleanField(
                default=True,
                help_text="Show this field on create-user forms (when other rules allow).",
            ),
        ),
        migrations.AddField(
            model_name="customfielddefinition",
            name="show_on_edit",
            field=models.BooleanField(
                default=True,
                help_text="Show this field on edit-user forms (when other rules allow).",
            ),
        ),
        migrations.AddField(
            model_name="customfielddefinition",
            name="show_on_detail",
            field=models.BooleanField(
                default=True,
                help_text="Show this field on user profile/detail views.",
            ),
        ),
        migrations.AddField(
            model_name="customfielddefinition",
            name="form_input_mode",
            field=models.CharField(
                choices=[("editable", "editable"), ("read_only", "read_only")],
                default="editable",
                help_text="When shown on a form: editable vs read-only display.",
                max_length=16,
            ),
        ),
    ]
