"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STEPS = [
  "Customer",
  "Service",
  "Products",
  "Project Details",
  "Photos",
  "Project Story",
  "SEO",
  "Publish",
] as const;

type UploadedPhoto = { phase: string; url: string; fileName: string };

export default function NewProjectPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);

  const update = (key: string, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  /** Step 0 → 1: creates the draft row so every later step has an id to save against. */
  async function createDraft() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to create project");
      setProjectId(json.project.id);
      setStep(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  /** Steps 1-6 → next: saves whatever fields belong to that step onto the draft row. */
  async function saveStepAndAdvance(fields: string[]) {
    if (!projectId) return;
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, string> = {};
      for (const key of fields) if (form[key] !== undefined) payload[key] = form[key];

      if (Object.keys(payload).length > 0) {
        const res = await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to save");
      }
      setStep((s) => Math.min(STEPS.length - 1, s + 1));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function uploadPhoto(file: File, phase: string) {
    if (!projectId) return;
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("phase", phase);
      const res = await fetch(`/api/projects/${projectId}/photos`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      setPhotos((p) => [...p, { phase, url: json.url, fileName: file.name }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!projectId) return;
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
      setPublishedSlug(json.project.slug);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setSaving(false);
    }
  }

  if (publishedSlug) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-brand">Published</h1>
        <p className="mt-4 text-slate-600">
          The project is live. Give search engines a few minutes to a few
          days to actually index it — publishing doesn&apos;t mean instant
          rankings.
        </p>
        <a
          href={`/projects/${publishedSlug}`}
          className="mt-6 inline-block rounded bg-brand px-6 py-3 text-white"
        >
          View the live page
        </a>
        <div className="mt-4">
          <button
            onClick={() => router.push("/admin/dashboard")}
            className="text-sm text-slate-500 underline"
          >
            Back to dashboard
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold text-brand">New Project</h1>

      <ol className="mt-6 flex flex-wrap gap-2 text-sm">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`rounded px-3 py-1 ${
              i === step ? "bg-brand text-white" : "bg-slate-100 text-slate-500"
            }`}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {error && (
        <div className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-8 space-y-4">
        {step === 0 && (
          <div className="space-y-3">
            <Field label="Customer Name" onChange={(v) => update("customer_name", v)} />
            <Field label="Street Address (kept private)" onChange={(v) => update("street_address_private", v)} />
            <Field label="City" onChange={(v) => update("city", v)} />
            <Field label="State" onChange={(v) => update("state", v)} />
            <Field label="ZIP" onChange={(v) => update("zip", v)} />
            <Field label="Phone" onChange={(v) => update("customer_phone", v)} />
            <Field label="Email" onChange={(v) => update("customer_email", v)} />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <label className="block text-sm font-medium">Service Type</label>
            <select
              className="w-full rounded border border-slate-300 p-2"
              defaultValue="roof_replacement"
              onChange={(e) => update("service_type", e.target.value)}
            >
              {[
                ["roof_replacement", "Roof Replacement"],
                ["roof_repair", "Roof Repair"],
                ["storm_damage", "Storm Damage"],
                ["siding", "Siding"],
                ["gutters", "Gutters"],
                ["windows", "Windows"],
                ["deck_construction", "Deck Construction"],
                ["composite_deck", "Composite Deck"],
                ["chimney", "Chimney"],
              ].map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <Field label="Manufacturer" onChange={(v) => update("manufacturer", v)} />
            <Field label="Collection" onChange={(v) => update("product_line", v)} />
            <Field label="Product" onChange={(v) => update("product", v)} />
            <Field label="Color" onChange={(v) => update("product_color", v)} />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <Field label="Completion Date" type="date" onChange={(v) => update("completion_date", v)} />
            <Field label="Salesperson" onChange={(v) => update("sales_rep", v)} />
            <Field label="Project Manager" onChange={(v) => update("project_manager", v)} />
            <TextArea label="Scope / Problems Discovered" onChange={(v) => update("problems_discovered", v)} />
            <TextArea label="Work Performed" onChange={(v) => update("work_performed", v)} />
            <TextArea label="Special Features" onChange={(v) => update("special_features", v)} />
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Upload before / during / after photos. They upload immediately
              to storage — you&apos;ll see a thumbnail confirm below.
            </p>
            {["before", "during", "after"].map((phase) => (
              <div key={phase}>
                <label className="block text-sm font-medium capitalize">{phase}</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadPhoto(file, phase);
                  }}
                  className="mt-1 text-sm"
                />
              </div>
            ))}
            {photos.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                {photos.map((p, i) => (
                  <li key={i}>✓ {p.phase}: {p.fileName}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Write the homeowner-facing story. Keep it plain — this is what
              shows on the public page, not internal notes.
            </p>
            <Field label="Page Title" onChange={(v) => update("page_title", v)} />
            <Field label="H1 Heading" onChange={(v) => update("h1", v)} />
            <TextArea label="Introduction" onChange={(v) => update("introduction", v)} />
            <TextArea label="The Challenge" onChange={(v) => update("project_challenge", v)} />
            <TextArea label="The Solution" onChange={(v) => update("solution", v)} />
            <TextArea label="Materials Used" onChange={(v) => update("materials_used", v)} />
          </div>
        )}

        {step === 6 && (
          <div className="space-y-3">
            <Field label="SEO Title" onChange={(v) => update("seo_title", v)} />
            <TextArea label="Meta Description" onChange={(v) => update("meta_description", v)} />
            <Field label="Target Keyword" onChange={(v) => update("target_keyword", v)} />
          </div>
        )}

        {step === 7 && (
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              Publishing will geocode the address, generate an approximate
              public map pin (never the real address), assign the final URL
              slug, and make the page live and crawlable.
            </p>
            <button
              onClick={publish}
              disabled={saving}
              className="rounded bg-brand-accent px-6 py-3 font-medium text-white disabled:opacity-50"
            >
              {saving ? "Publishing…" : "Publish"}
            </button>
          </div>
        )}
      </div>

      {step < STEPS.length - 1 && (
        <div className="mt-10 flex justify-between">
          <button
            disabled={step === 0 || saving}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="rounded border border-slate-300 px-4 py-2 text-sm disabled:opacity-40"
          >
            Back
          </button>
          <button
            disabled={saving}
            onClick={() => {
              if (step === 0) return createDraft();
              const fieldsByStep: Record<number, string[]> = {
                1: ["service_type"],
                2: ["manufacturer", "product_line", "product", "product_color"],
                3: ["completion_date", "sales_rep", "project_manager", "problems_discovered", "work_performed", "special_features"],
                4: [],
                5: ["page_title", "h1", "introduction", "project_challenge", "solution", "materials_used"],
                6: ["seo_title", "meta_description", "target_keyword"],
              };
              return saveStepAndAdvance(fieldsByStep[step] ?? []);
            }}
            className="rounded bg-brand px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Next"}
          </button>
        </div>
      )}
    </main>
  );
}

function Field({
  label,
  type = "text",
  onChange,
}: {
  label: string;
  type?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium">{label}</label>
      <input
        type={type}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border border-slate-300 p-2"
      />
    </div>
  );
}

function TextArea({
  label,
  onChange,
}: {
  label: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium">{label}</label>
      <textarea
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="mt-1 w-full rounded border border-slate-300 p-2"
      />
    </div>
  );
}
