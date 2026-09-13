"use client";

import { useState } from "react";
import ManualImportClient from "./manual-import-client";

interface DraftProject {
  id: string;
  customer_name: string;
  city: string;
  state: string;
}

/**
 * Bridges the old separate "/admin/companycam-import" page into this one —
 * pulling in a brand-new job (one CompanyCam project has no matching row
 * here at all yet) and adding photos to an already-imported job (see
 * add-photos-button.tsx on each row below) are now both just CompanyCam
 * search + pick-photos, in one place, instead of two different pages.
 */
export default function PullInJobPanel({ draftProjects }: { draftProjects: DraftProject[] }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Pull in a job from CompanyCam
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Pull in a job from CompanyCam</h2>
        <button onClick={() => setOpen(false)} className="text-sm text-slate-500 underline">
          Close
        </button>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Use this when a job never got tagged &quot;Hertsworks&quot; in CompanyCam, or the automatic
        import missed it entirely.
      </p>
      <ManualImportClient draftProjects={draftProjects} />
    </div>
  );
}
