from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('transport', '0015_waitlist_offers'),
    ]

    operations = [
        migrations.AddField(
            model_name='semester',
            name='registration_deadline',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
