"use client";

import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { ServiceType } from "@/types/database";

const SERVICES: { value: ServiceType; label: string }[] = [
  { value: "roof_replacement", label: "Roofing" },
  { value: "siding", label: "Siding" },
  { value: "deck_construction", label: "Decks" },
  { value: "composite_deck", label: "Composite Decks" },
  { value: "gutters", label: "Gutters" },
  { value: "windows", label: "Windows" },
];

export default function SearchControls() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [zip, setZip] = useState(searchParams.get("zip") ?? "");
  const [locating, setLocating] = useState(false);
  const [zipSearching, setZipSearching] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  const activeService = searchParams.get("service");

  function pushParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function toggleService(value: string) {
    pushParams({ service: activeService === value ? null : value });
  }

  async function submitZip(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = zip.trim();
    if (!trimmed) {
      pushParams({ zip: null, lat: null, lng: null });
      return;
    }

    setZipSearching(true);
    setLocError(null);
    try {
      // Geocode the ZIP so results sort by real distance, not just an exact
      // match against a job's own ZIP — falls back to exact-match if the
      // free geocoder can't find it.
      const res = await fetch(`/api/geocode-zip?zip=${encodeURIComponent(trimmed)}`);
      const json = await res.json();
      if (res.ok) {
        pushParams({ lat: String(json.lat), lng: String(json.lng), zip: trimmed });
      } else {
        pushParams({ zip: trimmed, lat: null, lng: null });
      }
    } catch {
      pushParams({ zip: trimmed, lat: null, lng: null });
    } finally {
      setZipSearching(false);
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocError("Your browser doesn't support location — try the ZIP search instead.");
      return;
    }
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        pushParams({
          lat: String(pos.coords.latitude),
          lng: String(pos.coords.longitude),
          zip: null,
        });
      },
      () => {
        setLocating(false);
        setLocError("Couldn't get your location — check your browser's permission, or use ZIP search.");
      },
      { timeout: 8000 }
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => pushParams({ service: null })}
          className={`rounded-full border px-3 py-1 text-sm ${
            !activeService
              ? "border-brand-accent bg-brand-accent text-white"
              : "border-slate-300 text-slate-700"
          }`}
        >
          All services
        </button>
        {SERVICES.map((s) => (
          <button
            key={s.value}
            onClick={() => toggleService(s.value)}
            className={`rounded-full border px-3 py-1 text-sm ${
              activeService === s.value
                ? "border-brand-accent bg-brand-accent text-white"
                : "border-slate-300 text-slate-700"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={submitZip} className="flex gap-2">
          <input
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            placeholder="Enter ZIP code"
            className="w-32 rounded border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={zipSearching}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            {zipSearching ? "Searching…" : "Search"}
          </button>
        </form>

        <button
          onClick={useMyLocation}
          disabled={locating}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50"
        >
          {locating ? "Locating…" : "Use my location"}
        </button>
      </div>

      {locError && <p className="text-sm text-red-600">{locError}</p>}
    </div>
  );
}
