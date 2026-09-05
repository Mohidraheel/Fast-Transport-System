from django.db import migrations, models
import django.db.models.deletion


def dedupe_waitlist_entries(apps, schema_editor):
    """
    Waitlist.registration becomes OneToOne. Any historical duplicates would
    break that constraint, so keep the earliest entry per registration.
    """
    Waitlist = apps.get_model("transport", "Waitlist")
    seen = set()
    for entry in Waitlist.objects.order_by("registration_id", "added_at", "id"):
        if entry.registration_id in seen:
            entry.delete()
        else:
            seen.add(entry.registration_id)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('transport', '0014_alter_routestop_options_route_geometry_and_more'),
    ]

    operations = [
        migrations.RunPython(dedupe_waitlist_entries, noop),

        migrations.AddField(
            model_name='challan',
            name='payment_due_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='waitlist',
            name='status',
            field=models.CharField(
                choices=[('waiting', 'Waiting'), ('offered', 'Offered'),
                         ('expired', 'Expired'), ('cancelled', 'Cancelled')],
                default='waiting', max_length=12),
        ),
        migrations.AddField(
            model_name='waitlist',
            name='offered_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='waitlist',
            name='offer_expires_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='waitlist',
            name='registration',
            field=models.OneToOneField(
                on_delete=django.db.models.deletion.CASCADE,
                to='transport.semesterregistration'),
        ),
        migrations.AlterModelOptions(
            name='waitlist',
            options={'ordering': ['position', 'added_at']},
        ),
        migrations.AlterField(
            model_name='transportregistration',
            name='status',
            field=models.CharField(
                choices=[('Pending', 'Pending'), ('Seat Held', 'Seat Held'),
                         ('Approved', 'Approved'),
                         ('payment_submitted', 'Payment Submitted'),
                         ('Waitlisted', 'Waitlisted'), ('Cancelled', 'Cancelled'),
                         ('Rejected', 'Rejected')],
                default='Pending', max_length=30),
        ),
    ]
