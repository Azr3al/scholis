from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_course", "0103_coursemembershipevent_source"),
    ]

    operations = [
        migrations.AddField(
            model_name="course",
            name="id_card_expiry_date",
            field=models.DateField(blank=True, null=True),
        ),
    ]
