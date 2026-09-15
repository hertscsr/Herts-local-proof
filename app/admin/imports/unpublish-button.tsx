"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UnpublishButton({
  projectId,
}: {
  projectId: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unpublish() {
    if (saving) return;

    const confirmed = window.confirm(
      "Pull this project off the public site? Nothing will be deleted."
    );

    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "unpublish",
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          json.error ?? `Unpublish failed (${res.status})`
        );
      }

      /*
       * Request the Imports route again after Supabase has been
       * updated so the Published badge/button cannot remain stale.
       */
      router.replace("/admin/imports?unpublished=1");
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unpublish failed"
      );
      setSaving(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={unpublish}
        disabled={saving}
        className="rounded border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Unpublishing..." : "Unpublish"}
      </button>

      {error && (
        <p className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}