from django.core.management.base import BaseCommand

from apps.transport.crime_risk import rebuild_zones


class Command(BaseCommand):
    help = "Rebuild the deterministic Karachi crime-risk grid."

    def handle(self, *args, **options):
        count = rebuild_zones()
        self.stdout.write(self.style.SUCCESS(f"Generated {count} crime-risk zones."))
