"use client";

import { useState } from "react";
import ManualImportClient from "./manual-import-client";

/**
 * Per-row entry point into the same CompanyCam search-and-pick tool, but
 * scoped to this one project — so fixing "this job is missing photos" is a
 * click on the row itself instead of a trip to a separate manual-import page
 * where you then have to find this same job again in a dropdown.
 */
export default function AddPhotosButton({ projectId, label }: { projectId: string; label: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="w-full">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        {open ? "Hide CompanyCam search" : "Add photos from CompanyCam"}
      </button>

      {open && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <ManualImportClient draftProjects={[]} fixedTarget={{ id: projectId, label }} onImported={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
