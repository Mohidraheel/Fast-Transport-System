from math import radians, sin, cos, sqrt, atan2
from .models import RouteStop

EARTH_RADIUS_M = 6371000
OFF_ROUTE_THRESHOLD_M = 1000  # 1km


def haversine_m(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(lambda v: radians(float(v)), (lat1, lon1, lat2, lon2))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return EARTH_RADIUS_M * c


def min_distance_to_route(lat, lon, route):
    """Shortest distance from a point to any stop on the given route."""
    stops = [rs.stop for rs in RouteStop.objects.filter(route=route).select_related("stop")]
    if not stops:
        return None
    return min(haversine_m(lat, lon, s.latitude, s.longitude) for s in stops)


def is_off_route(lat, lon, route, threshold=OFF_ROUTE_THRESHOLD_M):
    dist = min_distance_to_route(lat, lon, route)
    if dist is None:
        return False, None
    return dist > threshold, dist