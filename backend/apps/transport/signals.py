from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from .models import Route, Stop, RouteStop, Bus, Driver, Semester, RouteAssignment, FeeVerification, SemesterRegistration, BusLocationPing, Notification, User
from .seatallocation import allocate_seat_for_student
from .geofencing import is_off_route
from django.utils import timezone

def _deactivate_assignments(**filter_kwargs):
    """Set is_active=False on all active RouteAssignments matching the filter."""
    RouteAssignment.objects.filter(is_active=True, **filter_kwargs).update(is_active=False)


@receiver(post_save, sender=Route)
def deactivate_on_route_inactive(sender, instance, **kwargs):
    if not instance.is_active:
        _deactivate_assignments(route=instance)


@receiver(post_save, sender=Bus)
def deactivate_on_bus_inactive(sender, instance, **kwargs):
    if not instance.is_active:
        _deactivate_assignments(bus=instance)


@receiver(post_save, sender=Driver)
def deactivate_on_driver_unavailable(sender, instance, **kwargs):
    if not instance.is_available:
        _deactivate_assignments(driver=instance)


@receiver(post_save, sender=Semester)
def deactivate_on_semester_inactive(sender, instance, **kwargs):
    if not instance.is_active:
        _deactivate_assignments(semester=instance)


@receiver(post_save, sender=Stop)
def invalidate_geometry_after_stop_change(sender, instance, created, **kwargs):
    """A moved/disabled stop invalidates every cached road line that uses it."""
    if not created:
        Route.objects.filter(routestop__stop=instance).update(
            geometry=None,
            geometry_updated_at=None,
        )


@receiver(post_save, sender=RouteStop)
@receiver(post_delete, sender=RouteStop)
def invalidate_geometry_after_route_stop_change(sender, instance, **kwargs):
    Route.objects.filter(pk=instance.route_id).update(
        geometry=None,
        geometry_updated_at=None,
    )

@receiver(post_save, sender=FeeVerification)
def handle_fee_verification(sender, instance, created, **kwargs):
    if instance.is_verified:
        try:
            registration = SemesterRegistration.objects.get(
                student=instance.student,
                semester=instance.semester
            )

            # Avoid duplicate allocation
            if not registration.seatallocation_set.exists():
                allocate_seat_for_student(registration)

        except SemesterRegistration.DoesNotExist:
            pass

@receiver(post_save, sender=BusLocationPing)
def check_bus_geofence(sender, instance, created, **kwargs):
    if not created:
        return
    assignment = RouteAssignment.objects.filter(bus=instance.bus, is_active=True).first()
    if not assignment:
        return

    off_route, distance = is_off_route(instance.latitude, instance.longitude, assignment.route)
    instance.distance_from_route_m = distance
    instance.save(update_fields=["distance_from_route_m"])

    bus = instance.bus
    if off_route and not bus.is_off_route:
        for admin in User.objects.filter(is_staff=True):
            Notification.objects.create(
                user=admin, type="alert",
                title=f"Bus {bus.bus_number} is off route",
                message=f"Currently {distance:.0f}m from its assigned route ({assignment.route.name}).",
            )
        bus.is_off_route = True
        bus.last_off_route_alert_at = timezone.now()
        bus.save(update_fields=["is_off_route", "last_off_route_alert_at"])
    elif not off_route and bus.is_off_route:
        bus.is_off_route = False
        bus.save(update_fields=["is_off_route"])
