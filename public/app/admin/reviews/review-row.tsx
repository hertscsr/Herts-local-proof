"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Review } from "@/types/database";

interface ProjectOption {
  id: string;
  customer_name: string;
  city: string;
  state: string;
}

export default function ReviewRow({
  review,
  projects,
}: {
  review: Review;
  projects: ProjectOption[];
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(review.project_id ?? "");
  const [approved, setApproved] = useState(review.approved_for_website);
  const [replyText, setReplyText] = useState(review.reply_text ?? "");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/reviews/${review.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function generateReply() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/reviews/${review.id}/generate-reply`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Generation failed");
      setReplyText(json.reply);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="rounded border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <div className="font-medium">{review.homeowner}</div>
        <div className="text-amber-500">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</div>
      </div>
      <p className="mt-1 text-sm text-slate-600">{review.review}</p>
      <div className="mt-1 text-xs text-slate-400">
        {review.date} · {review.source}
        {review.match_status === "matched" && " · auto-matched, double check"}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <select
          value={projectId}
          onChange={(e) => {
            setProjectId(e.target.value);
            patch({ project_id: e.target.value });
          }}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
        >
          <option value="">— no job site assigned —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.customer_name} — {p.city}, {p.state}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={approved}
            onChange={(e) => {
              setApproved(e.target.checked);
              patch({ approved_for_website: e.target.checked });
            }}
            disabled={!projectId}
          />
          Show on website
        </label>
      </div>

      <div className="mt-3">
        <label className="block text-sm font-medium text-slate-700">Reply</label>
        <textarea
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          rows={2}
          placeholder="No reply drafted yet"
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
        />
        <div className="mt-2 flex gap-2">
          <button
            onClick={generateReply}
            disabled={generating}
            className="rounded border border-slate-300 px-3 py-1 text-xs font-medium disabled:opacity-50"
          >
            {generating ? "Generating…" : "Generate reply with AI"}
          </button>
          <button
            onClick={() => patch({ reply_text: replyText })}
            disabled={saving}
            className="rounded bg-brand-accent px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save reply"}
          </button>
        </div>
        {review.reply_posted_at && (
          <p className="mt-1 text-xs text-green-700">Posted to Google {review.reply_posted_at}</p>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
