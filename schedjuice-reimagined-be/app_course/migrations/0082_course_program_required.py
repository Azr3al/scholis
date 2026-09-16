import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("app_course", "0081_seed_general_program"),
    ]

    operations = [
        migrations.AlterField(
            model_name="course",
            name="program",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="courses",
                to="app_course.program",
            ),
        ),
    ]
