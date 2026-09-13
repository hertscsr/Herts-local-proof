"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/track-event";

/** Fires once per page load — renders nothing. */
export default function TrackPageView({ projectId }: { projectId: string }) {
  useEffect(() => {
    trackEvent("page_view", projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
