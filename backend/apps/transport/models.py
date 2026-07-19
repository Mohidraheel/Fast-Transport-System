from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
from django.conf import settings
import random
import string


class StudentProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    roll_number = models.CharField(max_length=20, unique=True)
    department = models.CharField(max_length=10, default="N/A")
    batch = models.CharField(max_length=10, default="N/A")
    phone = models.CharField(max_length=20, default="N/A")
    address = models.TextField(default="N/A")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.roll_number} ({self.user.username})"


class Semester(models.Model):
    name = models.CharField(max_length=50, default="N/A")
    year = models.IntegerField(default=2026)
    term = models.CharField(max_length=10, default="N/A")
    start_date = models.DateField(default=timezone.now)
    end_date = models.DateField(default=timezone.now)
    is_active = models.BooleanField(default=False)
    registration_open = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} {self.year}"


class Route(models.Model):
    name = models.CharField(max_length=100, default="N/A")
    description = models.TextField(default="No description")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class Stop(models.Model):
    name = models.CharField(max_length=100, default="N/A")
    latitude = models.DecimalField(max_digits=9, decimal_places=6, default=0.0)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, default=0.0)
    address = models.TextField(default="N/A")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class RouteStop(models.Model):
    route = models.ForeignKey(Route, on_delete=models.CASCADE)
    stop = models.ForeignKey(Stop, on_delete=models.CASCADE)
    stop_order = models.IntegerField(default=1)
    morning_eta = models.TimeField(null=True, blank=True)
    evening_eta = models.TimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.route.name} - {self.stop.name} ({self.stop_order})"

class Bus(models.Model):
    bus_number = models.CharField(max_length=20, default="N/A")
    capacity = models.IntegerField(default=0)
    model = models.CharField(max_length=100, default="N/A")
    tracker_token = models.CharField(max_length=50, blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_off_route = models.BooleanField(default=False)              # <- new
    last_off_route_alert_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.bus_number

class Driver(models.Model):
    name = models.CharField(max_length=150, default="N/A")
    cnic = models.CharField(max_length=15, default="N/A")
    license_no = models.CharField(max_length=30, default="N/A")
    phone = models.CharField(max_length=20, default="N/A")
    address = models.TextField(default="N/A")
    is_available = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

class RouteAssignment(models.Model):
    route = models.ForeignKey(Route, on_delete=models.CASCADE)
    bus = models.ForeignKey(Bus, on_delete=models.CASCADE)
    driver = models.ForeignKey(Driver, on_delete=models.CASCADE)
    semester = models.ForeignKey(Semester, on_delete=models.CASCADE)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.route.name} - {self.bus.bus_number} - {self.driver.name}"

class SemesterRegistration(models.Model):
    student = models.ForeignKey(StudentProfile, on_delete=models.CASCADE)
    semester = models.ForeignKey(Semester, on_delete=models.CASCADE)
    route = models.ForeignKey(Route, on_delete=models.CASCADE)
    stop = models.ForeignKey(Stop, on_delete=models.CASCADE)
    status = models.CharField(max_length=20, default="Pending")
    registered_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.student.roll_number} - {self.semester.name}"
    
class TransportRegistration(models.Model):
    STATUS_CHOICES = [
        ("Pending", "Pending"),
        ("Approved", "Approved"),
        ("payment_submitted", "Payment Submitted"),
        ("Rejected", "Rejected"),
    ]

    student = models.ForeignKey(StudentProfile, on_delete=models.CASCADE)
    semester = models.ForeignKey(Semester, on_delete=models.CASCADE)
    stop = models.ForeignKey(Stop, on_delete=models.CASCADE)

    # Route will be auto-assigned
    route = models.ForeignKey(Route, on_delete=models.SET_NULL, null=True, blank=True)

    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="Pending")

    fee_amount = models.DecimalField(max_digits=8, decimal_places=0, default=5000)
    is_paid = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

class SeatAllocation(models.Model):
    registration = models.ForeignKey(SemesterRegistration, on_delete=models.CASCADE)
    route_assignment = models.ForeignKey(RouteAssignment, on_delete=models.CASCADE)
    seat_number = models.IntegerField(default=1)
    allocated_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Seat {self.seat_number} - {self.registration.student.roll_number}"

class Waitlist(models.Model):
    registration = models.ForeignKey(SemesterRegistration, on_delete=models.CASCADE)
    position = models.IntegerField(default=1)
    added_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.registration.student.roll_number} - Position {self.position}"

class FeeVerification(models.Model):
    student = models.ForeignKey(StudentProfile, on_delete=models.CASCADE)
    semester = models.ForeignKey(Semester, on_delete=models.CASCADE)
    amount = models.DecimalField(max_digits=10, decimal_places=0, default=0.0)
    is_verified = models.BooleanField(default=False)
    verified_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    challan_number = models.CharField(max_length=50, default="N/A")
    verified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.student.roll_number} - {self.semester.name}"

class Challan(models.Model):
    registration = models.OneToOneField(
        "TransportRegistration",
        on_delete=models.CASCADE,
        related_name="challan"
    )
    student = models.ForeignKey("StudentProfile", on_delete=models.CASCADE)

    amount = models.DecimalField(max_digits=10, decimal_places=0)

    status = models.CharField(
        max_length=20,
        choices=[
            ("unpaid", "Unpaid"),
            ("paid", "Paid"),
        ],
        default="unpaid"
    )

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Challan {self.id} - {self.student}"

class Complaint(models.Model):
    submitted_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name="complaints_submitted")
    semester = models.ForeignKey(Semester, on_delete=models.SET_NULL, null=True, blank=True)
    route = models.ForeignKey(Route, on_delete=models.SET_NULL, null=True, blank=True)
    category = models.CharField(max_length=20, default="General")
    subject = models.CharField(max_length=200, default="N/A")
    description = models.TextField(default="N/A")
    status = models.CharField(max_length=15, default="Pending")
    priority = models.CharField(max_length=10, default="Normal")
    admin_response = models.TextField(default="N/A")
    resolved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="complaints_resolved")
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.subject} ({self.submitted_by.username})"

class RouteChangeRequest(models.Model):
    registration = models.ForeignKey(SemesterRegistration, on_delete=models.CASCADE)
    current_route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name="current_routes")
    requested_route = models.ForeignKey(Route, on_delete=models.SET_NULL, related_name="requested_routes", null=True, blank=True)
    requested_stop = models.ForeignKey(Stop, on_delete=models.CASCADE)
    status = models.CharField(max_length=20, default="Pending")
    admin_remarks = models.TextField(default="N/A")
    requested_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.registration.student.roll_number} - {self.current_route.name} -> {self.requested_route.name}"

class MaintenanceSchedule(models.Model):
    bus = models.ForeignKey(Bus, on_delete=models.CASCADE)
    maintenance_type = models.CharField(max_length=50, default="General")
    description = models.TextField(default="N/A")
    scheduled_date = models.DateField(default=timezone.now)
    completed_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=15, default="Pending")
    cost = models.DecimalField(max_digits=10, decimal_places=2, default=0.0)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.bus.bus_number} - {self.maintenance_type}"


class Notification(models.Model):
    NOTIFICATION_TYPES = [
        ('info', 'Info'),
        ('warning', 'Warning'),
        ('alert', 'Alert'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notifications")
    title = models.CharField(max_length=200, default="N/A")
    message = models.TextField(default="N/A")
    type = models.CharField(max_length=15, choices=NOTIFICATION_TYPES, default='info')
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username} - {self.title}"

class OTPVerification(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="otp_verification")
    otp = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)
 
    def is_valid(self):
        return not self.is_used and timezone.now() < self.expires_at
 
    def __str__(self):
        return f"OTP for {self.user.username}"
 
class BusLocationPing(models.Model):
    bus = models.ForeignKey(Bus, on_delete=models.CASCADE, related_name="location_pings")
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    distance_from_route_m = models.FloatField(null=True, blank=True)
    recorded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.bus.bus_number} @ {self.recorded_at}"