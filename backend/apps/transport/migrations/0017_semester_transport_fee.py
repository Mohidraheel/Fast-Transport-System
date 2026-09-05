from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('transport', '0016_semester_registration_deadline'),
    ]

    operations = [
        migrations.AddField(
            model_name='semester',
            name='transport_fee',
            field=models.DecimalField(decimal_places=0, default=5000, max_digits=10),
        ),
    ]
