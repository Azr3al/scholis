from collections import defaultdict

from django.db import migrations, models


def dedupe_active_field_labels(apps, schema_editor):
    """Keep lowest id per (entity_type, field_label); rename other active dupes."""
    FieldDefinition = apps.get_model("app_custom_fields", "FieldDefinition")
    active = list(FieldDefinition.objects.filter(is_active=True).order_by("id"))
    by_key = defaultdict(list)
    for row in active:
        by_key[(row.entity_type, row.field_label)].append(row)

    used_by_entity = defaultdict(set)
    for row in active:
        used_by_entity[row.entity_type].add(row.field_label)

    for (entity_type, label), rows in by_key.items():
        if len(rows) < 2:
            continue
        for idx, row in enumerate(rows[1:], start=2):
            n = idx
            candidate = f"{label} ({n})"
            while candidate in used_by_entity[entity_type]:
                n += 1
                candidate = f"{label} ({n})"
            row.field_label = candidate
            row.save(update_fields=["field_label"])
            used_by_entity[entity_type].add(candidate)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("app_custom_fields", "0007_seed_builtin_groups"),
    ]

    operations = [
        migrations.RunPython(dedupe_active_field_labels, noop_reverse),
        migrations.AddConstraint(
            model_name="fielddefinition",
            constraint=models.UniqueConstraint(
                condition=models.Q(is_active=True),
                fields=("entity_type", "field_label"),
                name="uniq_customfielddefinition_entity_label_active",
            ),
        ),
    ]
