"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Nukes every CompanyCam-imported project (published or not) to start
 * clean. Deliberately harder to hit than the per-row Delete button — this
 * takes down published pages too, so it asks the admin to type a phrase
 * rather than just confirming a dialog.
 */
export default function ClearAllButton({ count }: { count: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  if (count === 0) return null;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/clear-imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE ALL" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Clear failed");
      setResult(`Deleted ${json.deletedProjects} project(s) and ${json.deletedPhotoFiles} photo file(s).`);
      setOpen(false);
      setTyped("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Clear failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div>
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          Clear all imports ({count})
        </button>
        {result && <p className="mt-1 text-xs text-emerald-700">{result}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-red-300 bg-red-50 p-4">
      <p className="text-sm font-semibold text-red-800">
        This deletes all {count} imported project(s) — including any that are published — and their
        photos. This cannot be undone.
      </p>
      <p className="mt-2 text-sm text-red-700">
        Type <span className="font-mono font-bold">DELETE ALL</span> to confirm:
      </p>
      <div className="mt-2 flex gap-2">
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="rounded border border-red-300 px-3 py-1.5 text-sm"
          placeholder="DELETE ALL"
        />
        <button
          onClick={run}
          disabled={typed !== "DELETE ALL" || busy}
          className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? "Deleting…" : "Confirm delete"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setTyped("");
            setError(null);
          }}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
        >
          Cancel
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
