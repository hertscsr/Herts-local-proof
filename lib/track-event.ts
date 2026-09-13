"use client";

import { createClient } from "@/lib/supabase/browser";

export type TrackedEventType = "page_view" | "gallery_view" | "cta_click" | "lead_submit" | "map_pin_click";

const SESSION_KEY = "lp_visitor_session";

/** One id per browser tab session — good enough to group a visitor's events into a funnel. */
function getVisitorSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    // sessionStorage unavailable (private browsing, etc.) — fall back to a
    // one-off id; that event just won't group with others from this visit.
    return crypto.randomUUID();
  }
}

/**
 * Fire-and-forget analytics event, written straight to Supabase from the
 * browser (RLS allows anon insert on `events`, nothing else). Never throws —
 * a tracking failure should never block or break the page for a visitor.
 */
export function trackEvent(eventType: TrackedEventType, projectId?: string | null) {
  try {
    const supabase = createClient();
    supabase
      .from("events")
      .insert({
        visitor_session: getVisitorSessionId(),
        page: typeof window !== "undefined" ? window.location.pathname : "",
        project_id: projectId ?? null,
        event_type: eventType,
      })
      .then(() => {});
  } catch {
    // best-effort only
  }
}
