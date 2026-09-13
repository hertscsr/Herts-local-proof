"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-reads this project's CompanyCam labels right now and fixes the service
 * type if a label matches — covers the case where the label got added or
 * corrected in CompanyCam after this job was already imported, which the
 * automatic import never hears about on its own.
 */
export default function ResyncServiceTypeButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/resync-service-type`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Re-check failed");
      if (json.updated) {
        setMessage(json.changed ? "Fixed — refreshing…" : "Already correct.");
        router.refresh();
      } else {
        setMessage(
          json.reason === "no matching CompanyCam label found yet"
            ? "Still no matching label in CompanyCam — add one there first."
            : "This job isn't linked to a CompanyCam project."
        );
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Re-check failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        onClick={run}
        disabled={loading}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {loading ? "Checking…" : "Re-check type from CompanyCam"}
      </button>
      {message && <p className="text-xs text-slate-500">{message}</p>}
    </div>
  );
}
