from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.transport.crime_risk import calculate_risk, rebuild_zones, refresh_feed


class Command(BaseCommand):
    help = "Refresh the configured external crime feed and calculate risk zones."

    def add_arguments(self, parser):
        parser.add_argument("--skip-feed", action="store_true")
        parser.add_argument("--source-name", default=None)

    def handle(self, *args, **options):
        try:
            zones = rebuild_zones()
            imported = 0
            if not options["skip_feed"]:
                imported = refresh_feed(
                    source_name=options["source_name"] or settings.CRIME_RISK_FEED_SOURCE_NAME,
                )
            updated = calculate_risk()
        except Exception as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(self.style.SUCCESS(
            f"Generated {zones} zones, imported {imported} external events, scored {updated} zones."
        ))
