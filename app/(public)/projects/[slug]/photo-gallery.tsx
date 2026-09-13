"use client";

import { useRef } from "react";
import { trackEvent } from "@/lib/track-event";

interface Photo {
  id: string;
  url: string;
  phase: string;
  alt_text_final: string | null;
  alt_text_auto: string | null;
}

const PHASE_LABELS: Record<string, string> = {
  before: "Before",
  during: "During",
  after: "After",
};

export default function PhotoGallery({ photos, projectId }: { photos: Photo[]; projectId: string }) {
  const tracked = useRef(false);

  function onFirstInteraction() {
    if (tracked.current) return;
    tracked.current = true;
    trackEvent("gallery_view", projectId);
  }

  return (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3" onClick={onFirstInteraction}>
      {photos.map((photo) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={photo.id}
          src={photo.url}
          alt={photo.alt_text_final ?? photo.alt_text_auto ?? `${PHASE_LABELS[photo.phase] ?? ""} photo`}
          loading="lazy"
          className="aspect-square w-full cursor-pointer rounded-lg object-cover"
        />
      ))}
    </div>
  );
}
