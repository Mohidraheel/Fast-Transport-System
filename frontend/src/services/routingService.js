import { previewRouteGeometry } from "./transportService";

export async function routeGeometry(stops) {
  const coordinates = stops
    .map((stop) => [Number(stop.longitude ?? stop.lng), Number(stop.latitude ?? stop.lat)])
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));

  if (coordinates.length < 2) {
    return { type: "LineString", coordinates };
  }

  try {
    const stopIds = stops.map((stop) => Number(stop.id)).filter(Number.isFinite);
    if (stopIds.length === stops.length) {
      const response = await previewRouteGeometry(stopIds);
      if (response.data?.geometry?.coordinates?.length) {
        return response.data.geometry;
      }
    }
  } catch (error) {
    console.warn("Server route preview unavailable; using ordered stop line.", error);
  }

  return { type: "LineString", coordinates };
}
