import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { resolveMapLocation } from "../../services/transportService";

const KARACHI_CENTER = [67.0847, 24.9215];
const KARACHI_BOUNDS = {
  latitude: { min: 24.4, max: 25.4 },
  longitude: { min: 66.5, max: 67.8 },
};

const toSafeCoordinate = (value, axis) => {
  if (value === "" || value === null || value === undefined) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;

  if (axis === "latitude") {
    if (numeric < -90 || numeric > 90) return null;
    return Math.min(90, Math.max(-90, numeric));
  }

  if (numeric < -180 || numeric > 180) return null;
  return Math.min(180, Math.max(-180, numeric));
};

export default function StopLocationPicker({ latitude, longitude, onChange, height = 260 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const changeRef = useRef(onChange);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [lookupMessage, setLookupMessage] = useState("");

  useEffect(() => {
    changeRef.current = onChange;
  }, [onChange]);

  const applyLocation = (location) => {
    changeRef.current({
      latitude: Number(location.latitude).toFixed(6),
      longitude: Number(location.longitude).toFixed(6),
      ...(location.label ? { address: location.label } : {}),
      ...(location.provider_place_id ? { provider_place_id: location.provider_place_id, location_source: "geocoder" } : {}),
    });
  };

  const reverseLookup = async (lngLat) => {
    try {
      const response = await resolveMapLocation({ action: "reverse", latitude: lngLat.lat, longitude: lngLat.lng });
      if (response.data.results?.[0]) applyLocation(response.data.results[0]);
    } catch {
      setLookupMessage("Pin saved; address lookup is temporarily unavailable.");
    }
  };

  const updatePosition = (lngLat) => {
    changeRef.current({ latitude: lngLat.lat.toFixed(6), longitude: lngLat.lng.toFixed(6) });
    reverseLookup(lngLat);
  };

  useEffect(() => {
    if (mapRef.current) return undefined;
    const map = new maplibregl.Map({ container: containerRef.current, style: "https://tiles.openfreemap.org/styles/liberty", center: KARACHI_CENTER, zoom: 11 });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.on("click", (event) => updatePosition(event.lngLat));
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
  }, []);

  useEffect(() => {
    const lat = toSafeCoordinate(latitude, "latitude");
    const lng = toSafeCoordinate(longitude, "longitude");
    const map = mapRef.current;
    if (!map) return;

    if (lat === null || lng === null) {
      map.flyTo({ center: KARACHI_CENTER, zoom: 11, duration: 300 });
      return;
    }

    const clampedLat = Math.min(KARACHI_BOUNDS.latitude.max, Math.max(KARACHI_BOUNDS.latitude.min, lat));
    const clampedLng = Math.min(KARACHI_BOUNDS.longitude.max, Math.max(KARACHI_BOUNDS.longitude.min, lng));
    const position = [clampedLng, clampedLat];

    if (!markerRef.current) {
      const marker = new maplibregl.Marker({ color: "#c42828", draggable: true }).setLngLat(position).addTo(map);
      marker.on("dragend", () => updatePosition(marker.getLngLat()));
      markerRef.current = marker;
    } else {
      markerRef.current.setLngLat(position);
    }
    map.flyTo({ center: position, zoom: Math.max(map.getZoom(), 14), duration: 350 });
  }, [latitude, longitude]);

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        changeRef.current({ latitude: coords.latitude.toFixed(6), longitude: coords.longitude.toFixed(6), location_source: "browser_gps", location_accuracy_m: Math.round(coords.accuracy) });
        reverseLookup({ lat: coords.latitude, lng: coords.longitude });
      },
      () => setLookupMessage("Browser location could not be accessed."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const search = async (event) => {
    event?.preventDefault?.();
    if (query.trim().length < 3) return;
    setLookupMessage("Searching…");
    try {
      const response = await resolveMapLocation({ action: "search", query });
      setResults(response.data.results || []);
      setLookupMessage(response.data.results?.length ? "Select a matching location." : "No matching locations found.");
    } catch (error) {
      setResults([]);
      setLookupMessage(error.response?.data?.detail || "Location search is unavailable. You can place the pin manually.");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void search(event);
            }
          }}
          placeholder="Search Karachi landmark or address"
          style={{ flex: 1, minWidth: 0, border: "1px solid #cbd5e1", borderRadius: 7, padding: "8px 10px" }}
          aria-label="Search for a stop location"
        />
        <button type="button" onClick={() => void search()} style={{ border: 0, borderRadius: 7, padding: "8px 12px", background: "#1976b9", color: "#fff", cursor: "pointer" }}>Search</button>
      </div>
      {results.length > 0 && (
        <div style={{ maxHeight: 120, overflowY: "auto", marginBottom: 8, border: "1px solid #dbe3ea", borderRadius: 7 }}>
          {results.map((result) => <button type="button" key={result.provider_place_id || `${result.latitude}-${result.longitude}`} onClick={() => { applyLocation(result); setResults([]); setLookupMessage("Location selected."); }} style={{ width: "100%", textAlign: "left", border: 0, borderBottom: "1px solid #edf2f7", background: "#fff", padding: "8px 10px", fontSize: 12, cursor: "pointer" }}>{result.label}</button>)}
        </div>
      )}
      <div ref={containerRef} style={{ height, borderRadius: 10, overflow: "hidden", border: "1px solid #dbe3ea" }} aria-label="Stop location picker map" />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 8, fontSize: 12, color: "#64748b" }}>
        <span>Click the map or drag the pin to set the stop location.</span>
        <button type="button" onClick={useMyLocation} style={{ border: 0, background: "transparent", color: "#1976b9", cursor: "pointer", fontWeight: 600 }}>Use my location</button>
      </div>
      {lookupMessage && <div style={{ color: "#64748b", fontSize: 12, marginTop: 5 }}>{lookupMessage}</div>}
    </div>
  );
}
