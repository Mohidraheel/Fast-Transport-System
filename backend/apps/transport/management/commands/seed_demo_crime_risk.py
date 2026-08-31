from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.transport.crime_risk import calculate_risk, rebuild_zones
from apps.transport.models import ExternalCrimeEvent


class Command(BaseCommand):
    help = "Seed clearly labelled development-only crime-risk events for map verification."

    def add_arguments(self, parser):
        parser.add_argument("--clear", action="store_true", help="Remove only previously seeded demo events first.")

    def handle(self, *args, **options):
        if options["clear"]:
            deleted, _ = ExternalCrimeEvent.objects.filter(source_name="demo-development-only").delete()
            self.stdout.write(f"Removed {deleted} demo events.")

        now = timezone.now()
        # Fictional coordinates clustered in separate generated cells so the
        # low/elevated/high colours are visible on the Karachi map.
        demo_events = [
            ("high", 67.0847, 24.9215, 12, "Robbery", 8),
            ("elevated", 67.1150, 24.9500, 5, "Mobile Snatching", 6),
            ("low", 67.0500, 24.8850, 1, "Theft", 1),
        ]
        created = 0
        for label, longitude, latitude, count, category, severity in demo_events:
            for index in range(count):
                event_id = f"demo-{label}-{index + 1}"
                ExternalCrimeEvent.objects.update_or_create(
                    source_event_id=event_id,
                    defaults={
                        "source_name": "demo-development-only",
                        "category": category,
                        "severity": severity,
                        "latitude": latitude + (index % 3) * 0.0004,
                        "longitude": longitude + (index % 4) * 0.0004,
                        "location_precision_m": 300,
                        "occurred_at": now - timedelta(days=index * 2),
                        "source_updated_at": now,
                    },
                )
                created += 1

        zones = rebuild_zones()
        scored = calculate_risk()
        self.stdout.write(self.style.SUCCESS(
            f"Seeded {created} demo events, generated {zones} zones, and scored {scored} zones. "
            "These values are fictional and development-only."
        ))
