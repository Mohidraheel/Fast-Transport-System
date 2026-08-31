from django.contrib.auth.models import User
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .models import CrimeRiskZone, ExternalCrimeEvent
from .crime_risk import calculate_risk, parse_feed_events, zone_id_for


class CrimeRiskPureTests(SimpleTestCase):
    def test_geojson_point_is_normalized_and_mapped_to_stable_cell(self):
        payload = {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [67.0847, 24.9215]},
                "properties": {
                    "record_id": "crime-1",
                    "offense": "Mobile Snatching",
                    "incident_date": "2026-08-31T08:00:00Z",
                    "incident_offense_severity": 6,
                },
            }],
        }
        events = parse_feed_events(payload, source_name="test")
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["source_event_id"], "crime-1")
        self.assertEqual(zone_id_for(events[0]["latitude"], events[0]["longitude"]), "grid-64-76")

    def test_invalid_records_are_ignored(self):
        self.assertEqual(parse_feed_events([{"properties": {"category": "Robbery"}}]), [])


class CrimeRiskApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="risk-student", password="pass")
        CrimeRiskZone.objects.create(
            zone_id="grid-64-76",
            geometry={"type": "Polygon", "coordinates": [[[67.08, 24.92], [67.09, 24.92], [67.09, 24.93], [67.08, 24.93], [67.08, 24.92]]]},
            min_latitude=24.92,
            min_longitude=67.08,
            max_latitude=24.93,
            max_longitude=67.09,
            current_score=73,
            current_level="very_high",
            confidence="medium",
        )

    def test_map_endpoint_returns_only_aggregated_scored_zones(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/crime-risk/zones/?bbox=67.08,24.92,67.10,24.94")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["features"][0]["properties"]["current_level"], "very_high")
        self.assertNotIn("source_event_id", response.data["features"][0]["properties"])

    def test_map_endpoint_requires_authentication(self):
        response = self.client.get("/api/crime-risk/zones/")
        self.assertEqual(response.status_code, 401)


class CrimeRiskScoringTests(TestCase):
    @override_settings(CRIME_RISK_BBOX="24.90,67.08,24.91,67.09", CRIME_RISK_CELL_DEGREES=0.005)
    def test_external_event_changes_only_its_generated_zone(self):
        CrimeRiskZone.objects.create(
            zone_id="grid-0-0",
            geometry={"type": "Polygon", "coordinates": [[[67.08, 24.90], [67.085, 24.90], [67.085, 24.905], [67.08, 24.905], [67.08, 24.90]]]},
            min_latitude=24.90,
            min_longitude=67.08,
            max_latitude=24.905,
            max_longitude=67.085,
        )
        ExternalCrimeEvent.objects.create(
            source_event_id="source-1",
            category="Robbery",
            severity=8,
            latitude=24.902,
            longitude=67.082,
            occurred_at=timezone.now(),
        )
        calculate_risk()
        zone = CrimeRiskZone.objects.get(zone_id="grid-0-0")
        self.assertEqual(zone.current_level, "high")
        self.assertGreater(zone.current_score, 45)
