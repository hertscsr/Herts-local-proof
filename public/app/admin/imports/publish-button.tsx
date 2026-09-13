"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PublishButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function publish() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Publish failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        onClick={publish}
        disabled={saving}
        className="rounded bg-brand-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {saving ? "Publishing…" : "Publish"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
