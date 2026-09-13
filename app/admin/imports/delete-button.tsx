"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteButton({ projectId, label }: { projectId: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!confirm(`Delete "${label}"? This can't be undone — its photos go with it.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Delete failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        onClick={remove}
        disabled={busy}
        className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        {busy ? "Deleting…" : "Delete"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
