from django.core.management.base import BaseCommand
from django.db import transaction

from apps.transport.models import RouteStop


class Command(BaseCommand):
    help = "Remove duplicate route-stop rows and reindex stop orders before enforcing uniqueness constraints."

    def handle(self, *args, **options):
        with transaction.atomic():
            duplicates = []
            seen = set()
            for row in RouteStop.objects.select_related("route", "stop").order_by("route_id", "stop_id", "stop_order", "id"):
                key = (row.route_id, row.stop_id)
                if key in seen:
                    duplicates.append(row.id)
                else:
                    seen.add(key)

            if duplicates:
                deleted = RouteStop.objects.filter(id__in=duplicates).count()
                RouteStop.objects.filter(id__in=duplicates).delete()
                self.stdout.write(self.style.WARNING(f"Removed {deleted} duplicate route-stop rows."))

            route_ids = list(RouteStop.objects.order_by("route_id").values_list("route_id", flat=True).distinct())
            for route_id in route_ids:
                rows = list(RouteStop.objects.filter(route_id=route_id).order_by("stop_order", "id"))
                for index, row in enumerate(rows, start=1):
                    if row.stop_order != index:
                        row.stop_order = index
                        row.save(update_fields=["stop_order"])

            self.stdout.write(self.style.SUCCESS("Route-stop cleanup complete."))
