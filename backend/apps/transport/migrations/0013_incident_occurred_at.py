# Generated manually to preserve the already-applied incident migration.

from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ("transport", "0012_incident"),
    ]

    operations = [
        migrations.AddField(
            model_name="incident",
            name="occurred_at",
            field=models.DateTimeField(default=django.utils.timezone.now),
        ),
    ]
