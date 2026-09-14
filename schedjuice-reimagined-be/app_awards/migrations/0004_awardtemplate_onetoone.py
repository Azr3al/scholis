from django.db import migrations, models
import django.db.models.deletion


def dedupe_award_templates(apps, schema_editor):
    AwardTemplate = apps.get_model("app_awards", "AwardTemplate")
    from django.db.models import Count

    dup_title_ids = (
        AwardTemplate.objects.values("title_id")
        .annotate(c=Count("id"))
        .filter(c__gt=1)
        .values_list("title_id", flat=True)
    )
    for title_id in dup_title_ids:
        rows = list(
            AwardTemplate.objects.filter(title_id=title_id).order_by(
                "-updated_at", "-id"
            )
        )
        keeper_id = rows[0].id
        AwardTemplate.objects.filter(title_id=title_id).exclude(pk=keeper_id).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("app_awards", "0003_awardtemplate"),
    ]

    operations = [
        migrations.RunPython(dedupe_award_templates, migrations.RunPython.noop),
        migrations.RemoveConstraint(
            model_name="awardtemplate",
            name="uniq_award_template_title_name",
        ),
        migrations.AlterField(
            model_name="awardtemplate",
            name="title",
            field=models.OneToOneField(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="template",
                to="app_awards.awardtitle",
            ),
        ),
    ]
