"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { trackEvent } from "@/lib/track-event";

// Leaflet's default marker icons reference image files by a path that
// doesn't resolve under Next.js's bundler — point them at the CDN copies
// instead so pins actually render.
const markerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export interface MapProject {
  id: string;
  slug: string;
  city: string | null;
  state: string | null;
  service_type: string | null;
  latitude_public: number | null;
  longitude_public: number | null;
}

/** Recenters/refits the map whenever the project list changes (e.g. after a filter). */
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 12);
    } else {
      map.fitBounds(points, { padding: [30, 30] });
    }
  }, [map, points]);
  return null;
}

export default function ProjectMap({ projects }: { projects: MapProject[] }) {
  const pins = projects.filter(
    (p): p is MapProject & { latitude_public: number; longitude_public: number } =>
      p.latitude_public != null && p.longitude_public != null
  );

  const points: [number, number][] = pins.map((p) => [p.latitude_public, p.longitude_public]);
  const center: [number, number] = points[0] ?? [40.5, -74.6]; // roughly central NJ fallback

  if (pins.length === 0) {
    return (
      <div className="mt-6 flex h-[400px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500">
        No mapped projects to show yet.
      </div>
    );
  }

  return (
    <div className="mt-6 h-[400px] overflow-hidden rounded-lg border border-slate-200">
      <MapContainer center={center} zoom={11} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={points} />
        {pins.map((p) => (
          <Marker
            key={p.id}
            position={[p.latitude_public, p.longitude_public]}
            icon={markerIcon}
            eventHandlers={{ click: () => trackEvent("map_pin_click", p.id) }}
          >
            <Popup>
              <a href={`/projects/${p.slug}`} className="font-medium text-brand-accent underline">
                {p.service_type?.replace(/_/g, " ")} — {p.city}, {p.state}
              </a>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
