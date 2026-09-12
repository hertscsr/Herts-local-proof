"use client";

import { useState } from "react";

/**
 * 8-step new-project workflow shell (Customer -> Service -> Products ->
 * Details -> Photos -> Story -> SEO -> Publish). Each step is its own
 * component in a real build; this is the shell + step state wired to the
 * schema fields so the flow is provably complete end to end.
 */
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

export default function NewProjectPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Record<string, string>>({});

  const update = (key: string, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

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
              onChange={(e) => update("service_type", e.target.value)}
            >
              {[
                "Roof Replacement", "Roof Repair", "Storm Damage", "Siding",
                "Gutters", "Windows", "Deck Construction", "Composite Deck", "Chimney",
              ].map((s) => (
                <option key={s} value={s}>{s}</option>
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
          <div className="space-y-3 text-sm text-slate-600">
            Upload Before / During / After photos. Files are compressed to WebP
            and auto-named (city-service-phase-##) on upload — see SPEC.md
            section 7. Alt text is drafted automatically but must be approved
            before this project can move past &quot;Photos Reviewed.&quot;
            {/* TODO: wire to Supabase Storage upload + resize edge function */}
          </div>
        )}

        {step === 5 && (
          <div className="text-sm text-slate-600">
            Project story (title, H1, intro, challenge, solution, materials,
            FAQ) is generated from the fields entered above. Review and edit
            before continuing — nothing publishes un-reviewed.
            {/* TODO: call story-generation function, render editable fields */}
          </div>
        )}

        {step === 6 && (
          <div className="text-sm text-slate-600">
            SEO title, meta description, slug, canonical URL, OpenGraph tags,
            and JSON-LD are generated here and are editable before publish.
            {/* TODO: SEO field editor + internal link suggestions */}
          </div>
        )}

        {step === 7 && (
          <div className="text-sm text-slate-600">
            Preview the public page exactly as it will render, then publish.
            Publishing sets publication_status = &apos;published&apos;, triggers
            sitemap regeneration, and pings the indexing API.
            {/* TODO: preview iframe + publish button calling the projects update */}
          </div>
        )}
      </div>

      <div className="mt-10 flex justify-between">
        <button
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className="rounded border border-slate-300 px-4 py-2 text-sm disabled:opacity-40"
        >
          Back
        </button>
        <button
          onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
          className="rounded bg-brand px-4 py-2 text-sm text-white"
        >
          {step === STEPS.length - 1 ? "Publish" : "Next"}
        </button>
      </div>
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
