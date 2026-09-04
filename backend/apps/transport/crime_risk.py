"""Automated reported-crime risk pipeline.

This module intentionally has no dependency on Incident. It accepts a
server-side, licensed/official GeoJSON feed and turns it into stable grid
zones for MapLibre. A missing feed produces unclassified zones instead of
inventing crime levels.
"""

from collections import Counter, defaultdict
from datetime import timedelta, timezone as dt_timezone
import math

import requests
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from .models import CrimeRiskSnapshot, CrimeRiskZone, ExternalCrimeEvent


ALGORITHM_VERSION = "v1"
CATEGORY_WEIGHTS = {
    "homicide": 10.0,
    "murder": 10.0,
    "kidnapping": 10.0,
    "armed robbery": 9.0,
    "robbery": 8.0,
    "dacoity": 8.0,
    "vehicle snatching": 8.0,
    "car snatching": 8.0,
    "mobile snatching": 6.0,
    "snatching": 6.0,
    "assault": 6.0,
    "extortion": 6.0,
    "vehicle theft": 4.0,
    "burglary": 4.0,
    "theft": 3.0,
}


def _setting_bbox():
    value = getattr(settings, "CRIME_RISK_BBOX", (24.60, 66.70, 25.35, 67.50))
    if isinstance(value, str):
        value = tuple(float(part.strip()) for part in value.split(","))
    if len(value) != 4:
        raise ValueError("CRIME_RISK_BBOX must be min_lat,min_lng,max_lat,max_lng")
    return tuple(float(part) for part in value)


def _cell_size():
    return float(getattr(settings, "CRIME_RISK_CELL_DEGREES", 0.005))


def zone_id_for(latitude, longitude):
    min_lat, min_lng, _, _ = _setting_bbox()
    size = _cell_size()
    row = math.floor((float(latitude) - min_lat) / size)
    col = math.floor((float(longitude) - min_lng) / size)
    return f"grid-{row}-{col}"


def _zone_geometry(min_lat, min_lng, max_lat, max_lng):
    ring = [
        [min_lng, min_lat],
        [max_lng, min_lat],
        [max_lng, max_lat],
        [min_lng, max_lat],
        [min_lng, min_lat],
    ]
    return {"type": "Polygon", "coordinates": [ring]}


def iter_zone_specs():
    """Yield deterministic grid cells for the configured Karachi extent."""
    min_lat, min_lng, max_lat, max_lng = _setting_bbox()
    size = _cell_size()
    rows = math.ceil((max_lat - min_lat) / size)
    cols = math.ceil((max_lng - min_lng) / size)
    if rows * cols > 100000:
        raise ValueError("Crime-risk grid is too large; increase CRIME_RISK_CELL_DEGREES")
    for row in range(rows):
        cell_min_lat = min_lat + row * size
        cell_max_lat = min(cell_min_lat + size, max_lat)
        for col in range(cols):
            cell_min_lng = min_lng + col * size
            cell_max_lng = min(cell_min_lng + size, max_lng)
            yield {
                "zone_id": f"grid-{row}-{col}",
                "geometry": _zone_geometry(cell_min_lat, cell_min_lng, cell_max_lat, cell_max_lng),
                "min_latitude": cell_min_lat,
                "min_longitude": cell_min_lng,
                "max_latitude": cell_max_lat,
                "max_longitude": cell_max_lng,
            }


@transaction.atomic
def rebuild_zones():
    """Replace generated cells while retaining no manually authored geometry."""
    specs = list(iter_zone_specs())
    existing = {zone.zone_id: zone for zone in CrimeRiskZone.objects.all()}
    seen = set()
    for spec in specs:
        zone = existing.get(spec["zone_id"])
        if zone:
            for key, value in spec.items():
                setattr(zone, key, value)
            zone.algorithm_version = ALGORITHM_VERSION
            zone.is_active = True
            zone.save(update_fields=[*spec.keys(), "algorithm_version", "is_active", "updated_at"])
        else:
            CrimeRiskZone.objects.create(algorithm_version=ALGORITHM_VERSION, **spec)
        seen.add(spec["zone_id"])
    CrimeRiskZone.objects.exclude(zone_id__in=seen).delete()
    return len(specs)


def _event_value(properties, *names):
    for name in names:
        value = properties.get(name)
        if value not in (None, ""):
            return value
    return None


def parse_feed_events(payload, source_name="external"):
    """Parse a small, provider-neutral GeoJSON/list response."""
    if isinstance(payload, dict) and payload.get("type") == "FeatureCollection":
        records = payload.get("features", [])
    elif isinstance(payload, dict):
        records = payload.get("events", payload.get("data", []))
    else:
        records = payload
    if not isinstance(records, list):
        raise ValueError("Crime feed must contain a list of events/features")

    parsed = []
    for record in records:
        properties = record.get("properties", {}) if isinstance(record, dict) else {}
        geometry = record.get("geometry", {}) if isinstance(record, dict) else {}
        coordinates = geometry.get("coordinates", []) if isinstance(geometry, dict) else []
        longitude = _event_value(properties, "longitude", "lng", "lon")
        latitude = _event_value(properties, "latitude", "lat")
        if geometry.get("type") == "Point" and len(coordinates) >= 2:
            longitude, latitude = coordinates[:2]
        occurred = _event_value(properties, "occurred_at", "occurredAt", "incident_date", "date")
        event_id = _event_value(properties, "source_event_id", "event_id", "record_id", "id")
        category = _event_value(properties, "category", "offense", "crime_type", "type")
        if not event_id or not category or latitude is None or longitude is None or not occurred:
            continue
        try:
            latitude = float(latitude)
            longitude = float(longitude)
            occurred = parse_datetime(str(occurred).replace("Z", "+00:00"))
        except (TypeError, ValueError):
            continue
        if occurred is None:
            continue
        if timezone.is_naive(occurred):
            occurred = timezone.make_aware(occurred, timezone=dt_timezone.utc)
        if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
            continue
        min_lat, min_lng, max_lat, max_lng = _setting_bbox()
        if not min_lat <= latitude <= max_lat or not min_lng <= longitude <= max_lng:
            continue
        severity = _event_value(properties, "severity", "incident_offense_severity") or 5
        try:
            severity = max(1, min(10, int(severity)))
        except (TypeError, ValueError):
            severity = 5
        updated = _event_value(properties, "updated_at", "updatedAt")
        updated = parse_datetime(str(updated).replace("Z", "+00:00")) if updated else None
        if updated is not None and timezone.is_naive(updated):
            updated = timezone.make_aware(updated, timezone=dt_timezone.utc)
        precision = _event_value(properties, "location_precision_m", "precision_m")
        try:
            precision = max(0, int(precision)) if precision is not None else None
        except (TypeError, ValueError):
            precision = None
        parsed.append({
            "source_event_id": str(event_id)[:180],
            "source_name": source_name[:120],
            "category": str(category)[:80],
            "severity": severity,
            "latitude": latitude,
            "longitude": longitude,
            "location_precision_m": precision,
            "occurred_at": occurred,
            "source_updated_at": updated,
        })
    return parsed


def upsert_feed_events(payload, source_name="external"):
    events = parse_feed_events(payload, source_name)
    for data in events:
        source_event_id = data.pop("source_event_id")
        ExternalCrimeEvent.objects.update_or_create(
            source_event_id=source_event_id,
            defaults=data,
        )
    return len(events)


def refresh_feed(url=None, token=None, source_name="external"):
    url = url or getattr(settings, "CRIME_RISK_FEED_URL", "")
    if not url:
        return 0
    headers = {"Accept": "application/json"}
    token = token or getattr(settings, "CRIME_RISK_FEED_TOKEN", "")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    response = requests.get(url, headers=headers, timeout=15)
    response.raise_for_status()
    return upsert_feed_events(response.json(), source_name=source_name)


def _category_weight(category):
    normalized = " ".join(str(category).lower().replace("_", " ").split())
    for key, weight in CATEGORY_WEIGHTS.items():
        if key in normalized:
            return weight
    return 1.0


def _risk_level(score):
    if score is None:
        return "unclassified"
    if score < 20:
        return "low"
    if score < 45:
        return "elevated"
    if score < 70:
        return "high"
    return "very_high"


def _confidence(event_count):
    if not event_count:
        return "none"
    if event_count < 3:
        return "low"
    if event_count < 10:
        return "medium"
    return "high"


@transaction.atomic
def calculate_risk(period_days=None):
    period_days = int(period_days or getattr(settings, "CRIME_RISK_WINDOW_DAYS", 90))
    now = timezone.now()
    cutoff = now - timedelta(days=period_days)
    events = ExternalCrimeEvent.objects.filter(occurred_at__gte=cutoff, occurred_at__lte=now)
    contributions = defaultdict(float)
    counts = Counter()
    categories = defaultdict(Counter)
    newest_source_update = None
    for event in events.iterator():
        zone_id = zone_id_for(event.latitude, event.longitude)
        weight = _category_weight(event.category) * (max(1, min(10, event.severity)) / 5)
        age_days = max(0.0, (now - event.occurred_at).total_seconds() / 86400)
        contributions[zone_id] += weight * math.exp(-age_days / 45.0)
        counts[zone_id] += 1
        categories[zone_id][event.category] += 1
        if event.source_updated_at and (newest_source_update is None or event.source_updated_at > newest_source_update):
            newest_source_update = event.source_updated_at

    updated = 0
    for zone in CrimeRiskZone.objects.filter(is_active=True).iterator():
        count = counts[zone.zone_id]
        score = None if not count else min(100.0, round(22 * math.log1p(contributions[zone.zone_id]), 2))
        zone.current_score = score
        zone.current_level = _risk_level(score)
        zone.confidence = _confidence(count)
        zone.source_updated_at = newest_source_update
        zone.algorithm_version = ALGORITHM_VERSION
        zone.save(update_fields=["current_score", "current_level", "confidence", "source_updated_at", "algorithm_version", "updated_at"])
        if count:
            CrimeRiskSnapshot.objects.create(
                zone=zone,
                period_days=period_days,
                score=score,
                level=zone.current_level,
                confidence=zone.confidence,
                event_count=count,
                category_breakdown=dict(categories[zone.zone_id]),
                algorithm_version=ALGORITHM_VERSION,
            )
        updated += 1
    return updated
