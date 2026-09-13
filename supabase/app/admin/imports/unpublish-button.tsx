"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UnpublishButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unpublish() {
    if (!confirm("Pull this project off the public site? It'll go back to draft — nothing is deleted.")) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unpublish" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Unpublish failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unpublish failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        onClick={unpublish}
        disabled={saving}
        className="rounded border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50"
      >
        {saving ? "Unpublishing…" : "Unpublish"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
