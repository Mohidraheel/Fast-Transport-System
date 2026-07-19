from django.contrib import admin
from .models import Bus, BusLocationPing


@admin.register(Bus)
class BusAdmin(admin.ModelAdmin):
    list_display = ["bus_number", "capacity", "is_active", "is_off_route", "last_off_route_alert_at"]


@admin.register(BusLocationPing)
class BusLocationPingAdmin(admin.ModelAdmin):
    list_display = ["bus", "latitude", "longitude", "distance_from_route_m", "recorded_at"]
    readonly_fields = ["distance_from_route_m"]