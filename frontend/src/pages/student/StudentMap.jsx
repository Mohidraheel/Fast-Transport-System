import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import PageShell, { PageTitle } from "../../components/PageShell";
import { Banner } from "../../components/ui";
import { colors, fonts, radius } from "../../theme";
import { useBreakpoint } from "../../utils/useBreakpoint";
import api from "../../services/api";

const POLL_INTERVAL_MS = 8000;
const INCIDENT_POLL_INTERVAL_MS = 30000;
const incidentColor = (severity) => (
  severity === "high" ? "#EF4444" : severity === "medium" ? "#F97316" : "#F59E0B"
);

async function fetchRoadRoute(stops) {
  const coords = stops.map(s => `${s.lng},${s.lat}`).join(";");
  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`
    );
    const data = await res.json();
    if (data.code === "Ok" && data.routes.length > 0) {
      return data.routes[0].geometry.coordinates;
    }
  } catch (e) {
    console.warn("OSRM routing failed, falling back to straight lines:", e);
  }
  return stops.map(s => [s.lng, s.lat]);
}

function incidentGeoJSON(incidents) {
  const earthRadius = 6371000;
  return { type: "FeatureCollection", features: incidents.map((incident) => {
    const points = [];
    const latitudeRadians = (Number(incident.latitude) * Math.PI) / 180;
    const latitudeOffset = (Number(incident.radius_meters) / earthRadius) * (180 / Math.PI);
    const longitudeOffset = latitudeOffset / Math.cos(latitudeRadians);
    for (let index = 0; index <= 64; index += 1) {
      const angle = (index / 64) * 2 * Math.PI;
      points.push([Number(incident.longitude) + longitudeOffset * Math.sin(angle), Number(incident.latitude) + latitudeOffset * Math.cos(angle)]);
    }
    return { type: "Feature", properties: { color: incidentColor(incident.severity), incidentType: incident.incident_type_display, severity: incident.severity, occurredAt: incident.occurred_at, description: incident.description || "" }, geometry: { type: "Polygon", coordinates: [points] } };
  }) };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

export default function StudentMap() {
  const mapContainer = useRef(null);
  const mapRef       = useRef(null);
  const busMarkerRef = useRef(null);
  const markerElRef  = useRef(null);
  const pollRef      = useRef(null);
  const isMobile     = useBreakpoint(768);

  const [trackingData, setTrackingData] = useState(null);
  const [liveData, setLiveData]         = useState(null);
  const [error, setError]               = useState("");
  const [lastUpdated, setLastUpdated]   = useState(null);
  const [isStale, setIsStale]           = useState(false);
  const [incidents, setIncidents]       = useState([]);

  // 1. Load route metadata once
  useEffect(() => {
    api.get("/api/student/bus-tracking/")
      .then(res => setTrackingData(res.data))
      .catch(err => setError(err.response?.data?.detail || "Failed to load route data"));
  }, []);

  // 2. Poll live GPS
  const fetchLiveLocation = useCallback(() => {
    api.get("/api/student/live-location/")
      .then(res => {
        if (res.data?.lat && res.data?.lng) {
          setLiveData(res.data);
          setLastUpdated(new Date());
          setIsStale(false);
        }
      })
      .catch(() => setIsStale(true));
  }, []);

  useEffect(() => {
    fetchLiveLocation();
    pollRef.current = setInterval(fetchLiveLocation, POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [fetchLiveLocation]);

  // 2b. Poll approved incidents
  const fetchIncidents = useCallback(() => {
    api.get("/api/incidents/approved/")
      .then(res => setIncidents(Array.isArray(res.data) ? res.data : []))
      .catch(err => console.error("Failed to load incidents:", err));
  }, []);

  useEffect(() => {
    fetchIncidents();
    const interval = setInterval(fetchIncidents, INCIDENT_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchIncidents]);

  // 3. Init map ONCE on mount
  useEffect(() => {
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [67.0847, 24.9215],
      zoom: 12,
    });

    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      const busEl = document.createElement("div");
      busEl.style.cssText = `width: 36px; height: 36px;
      background: #c42828; border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.5);
      display: none; align-items: center;
      justify-content: center; font-size: 18px;
      cursor: pointer;`;
      busEl.innerHTML = "🚌";
      markerElRef.current = busEl;
      busMarkerRef.current = new maplibregl.Marker({ element: busEl, anchor: "center" })
        .setLngLat([67.0847, 24.9215])
        .addTo(map);

      // Add incidents source & layers
      map.addSource("incidents", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] }
      });
      map.addLayer({
        id: "incidents-fill",
        type: "fill",
        source: "incidents",
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": 0.4
        }
      });
      map.addLayer({
        id: "incidents-outline",
        type: "line",
        source: "incidents",
        paint: {
          "line-color": ["get", "color"],
          "line-width": 2
        }
      });

      // Incident Popups
      map.on("click", "incidents-fill", (e) => {
        if (!e.features || !e.features[0]) return;
        const props = e.features[0].properties;
        const html = `
          <div style="font-family: sans-serif; font-size: 13px;">
            <strong style="color: ${props.color}; font-size: 14px;">
              ${escapeHtml(props.incidentType)}
            </strong>
            <br/><span style="color: #666;">Occurred:</span> ${new Date(props.occurredAt).toLocaleString()}
            <br/><span style="color: #666;">Severity:</span> <span style="text-transform: capitalize;">${escapeHtml(props.severity)}</span>
            ${props.description ? `<div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #eee;">${escapeHtml(props.description)}</div>` : ""}
          </div>
        `;
        new maplibregl.Popup({ closeButton: false })
          .setLngLat(e.lngLat)
          .setHTML(html)
          .addTo(map);
      });

      map.on("mouseenter", "incidents-fill", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "incidents-fill", () => {
        map.getCanvas().style.cursor = "";
      });
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // 4. Populate route + stops when trackingData loads
  useEffect(() => {
    if (!trackingData || !mapRef.current) return;

    const validStops = (trackingData.stops || []).filter(s => s.lat && s.lng);
    if (!validStops.length) return;

    const map = mapRef.current;

    const populateMap = async () => {
      if (!map.isStyleLoaded()) {
        map.once("load", () => populateMap());
        return;
      }

      // Draw road-following route
      const routeCoords = await fetchRoadRoute(validStops);
      if (map.getSource("route")) {
        map.getSource("route").setData({
          type: "Feature",
          geometry: { type: "LineString", coordinates: routeCoords },
        });
      } else {
        map.addSource("route", {
          type: "geojson",
          data: {
            type: "Feature",
            geometry: { type: "LineString", coordinates: routeCoords },
          },
        });
        map.addLayer({
          id: "route-line", type: "line", source: "route",
          paint: { "line-color": "#3B82F6", "line-width": 4, "line-opacity": 0.85 },
          layout: { "line-join": "round", "line-cap": "round" },
        });
      }

      // Fit map to show all stops
      const bounds = validStops.reduce(
        (b, s) => b.extend([s.lng, s.lat]),
        new maplibregl.LngLatBounds(
          [validStops[0].lng, validStops[0].lat],
          [validStops[0].lng, validStops[0].lat]
        )
      );
      map.fitBounds(bounds, { padding: isMobile ? 30 : 60, maxZoom: 14 });

      // Add stop markers
      validStops.forEach(stop => {
        const isStudentStop = stop.name === trackingData.student_stop_name;
        const el = document.createElement("div");
        el.style.cssText = `
          width: ${isStudentStop ? "18px" : "12px"};
          height: ${isStudentStop ? "18px" : "12px"};
          border-radius: 50%;
          background: ${isStudentStop ? "#F59E0B" : "#6B7280"};
          border: 2px solid white;
          box-shadow: 0 1px 4px rgba(0,0,0,0.5);
          cursor: pointer;
        `;
        new maplibregl.Marker({ element: el })
          .setLngLat([stop.lng, stop.lat])
          .setPopup(
            new maplibregl.Popup({ offset: 12 }).setHTML(
              `<strong>${stop.name}</strong>
              ${stop.morning_eta ? `<br/>🕐 Morning ETA: ${stop.morning_eta}` : ""}
              ${isStudentStop ? "<br/><em style='color:#F59E0B'>📍 Your stop</em>" : ""}`
            )
          )
          .addTo(map);
      });
    };

    populateMap();
  }, [trackingData]);

  // 5. Move bus marker on every GPS update
  useEffect(() => {
    if (!liveData || !busMarkerRef.current || !mapRef.current) return;
    const { lat, lng, heading } = liveData;
    if (!lat || !lng) return;

    if (markerElRef.current) {
      markerElRef.current.style.display = "flex";
      if (heading) markerElRef.current.style.transform = `rotate(${heading}deg)`;
    }
    busMarkerRef.current.setLngLat([lng, lat]);
  }, [liveData]);

  // 6. Update incidents GeoJSON
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    
    const updateIncidents = () => {
      const src = map.getSource("incidents");
      if (src) {
        src.setData(incidentGeoJSON(incidents));
      }
    };

    if (map.isStyleLoaded()) {
      updateIncidents();
    } else {
      map.once("load", updateIncidents);
    }
  }, [incidents]);

  const timeSince = (date) => {
    if (!date) return "—";
    const secs = Math.floor((new Date() - date) / 1000);
    if (secs < 60) return `${secs}s ago`;
    return `${Math.floor(secs / 60)}m ago`;
  };

  const speedLabel = () => {
    if (!liveData) return "Waiting for GPS...";
    if (liveData.ignition === false) return "🔴 Ignition OFF";
    if (liveData.speed === 0) return "🟡 Idling";
    return `🟢 ${liveData.speed} km/h`;
  };

  return (
    <PageShell role="student" title="Live Bus Tracking">
      <PageTitle sub="Real-time GPS tracking for your assigned bus.">Live Bus Tracking</PageTitle>

      {error && <Banner variant="danger">{error}</Banner>}

      {isStale && (
        <Banner variant="warning">
          GPS signal lost or bus is offline. Showing last known position.
        </Banner>
      )}

      {/* Info cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile
          ? "repeat(auto-fit, minmax(130px, 1fr))"
          : "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 12, marginBottom: 16,
      }}>
        <InfoCard label="Route"       value={trackingData?.route_name ?? "—"} />
        <InfoCard label="Bus"         value={liveData?.bus_number ?? trackingData?.bus?.bus_number ?? "—"} />
        <InfoCard label="Driver"      value={liveData?.driver_name ?? trackingData?.bus?.driver_name ?? "—"} />
        <InfoCard label="Speed"       value={speedLabel()} accent={liveData?.speed > 0} />
        <InfoCard label="GPS Updated" value={timeSince(lastUpdated)} warning={isStale} />
      </div>

      {/* Map */}
      <div style={{
        position: "relative",
        height: isMobile ? "calc(100vh - 380px)" : 520,
        minHeight: 280,
        borderRadius: 12,
        border: `1px solid ${colors.borderLight}`,
        overflow: "hidden",
      }}>
        <div
          ref={mapContainer}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12 }}
        />
        {!trackingData && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.8)", borderRadius: 12, zIndex: 10 }}>
            <div style={{
              width: "28px", height: "28px", borderRadius: "50%",
              border: `3px solid ${colors.borderLight}`,
              borderTopColor: colors.accent,
              animation: "spin 0.7s linear infinite",
            }} />
          </div>
        )}
      </div>

      <p style={{ fontSize: 12, color: colors.textMuted, marginTop: 8 }}>
        🟡 Your stop &nbsp;·&nbsp; ⚫ Other stops &nbsp;·&nbsp; 🔵 Route &nbsp;·&nbsp; 🚌 Live bus position (updates every 8s)
      </p>
    </PageShell>
  );
}

function InfoCard({ label, value, accent, warning }) {
  return (
    <div style={{
      background: "#fff",
      border: warning ? "1px solid #fcd34d" : `1px solid ${colors.borderLight}`,
      borderRadius: radius.lg,
      padding: "12px 16px",
      boxShadow: "0 1px 3px rgba(11,45,66,0.06)",
    }}>
      <div style={{ fontSize: 11, color: colors.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{
        fontSize: 15, fontWeight: 600,
        color: accent ? colors.successText : warning ? colors.warningText : colors.textPrimary,
        wordBreak: "break-word",
      }}>
        {value}
      </div>
    </div>
  );
}