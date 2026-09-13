"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Project, FaqItem } from "@/types/database";

interface Props {
  project: Project;
}

export default function EditProjectForm({ project }: Props) {
  const router = useRouter();
  const [fields, setFields] = useState({
    page_title: project.page_title ?? "",
    h1: project.h1 ?? "",
    meta_description: project.meta_description ?? "",
    introduction: project.introduction ?? "",
    project_challenge: project.project_challenge ?? "",
    solution: project.solution ?? "",
    materials_used: project.materials_used ?? "",
  });
  const [faq, setFaq] = useState<FaqItem[]>(project.faq ?? []);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  function update(key: keyof typeof fields, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    setSavedMsg(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/generate-content`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Generation failed");
      const c = json.content;
      setFields({
        page_title: c.page_title ?? "",
        h1: c.h1 ?? "",
        meta_description: c.meta_description ?? "",
        introduction: c.introduction ?? "",
        project_challenge: c.project_challenge ?? "",
        solution: c.solution ?? "",
        materials_used: c.materials_used ?? "",
      });
      setFaq(Array.isArray(c.faq) ? c.faq : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, faq }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setSavedMsg("Saved.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 space-y-5">
      <button
        onClick={generate}
        disabled={generating}
        className="rounded bg-brand-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {generating ? "Generating…" : "Generate with AI"}
      </button>
      <p className="text-xs text-slate-500">
        Drafts the fields below from the project&apos;s service type, location, and materials.
        Read it over and fix anything before saving — it&apos;s a first draft, not final copy.
      </p>

      <Field label="Page title" value={fields.page_title} onChange={(v) => update("page_title", v)} />
      <Field label="H1 (headline)" value={fields.h1} onChange={(v) => update("h1", v)} />
      <Field
        label="Meta description"
        value={fields.meta_description}
        onChange={(v) => update("meta_description", v)}
      />
      <TextArea
        label="Introduction"
        value={fields.introduction}
        onChange={(v) => update("introduction", v)}
      />
      <TextArea
        label="The Challenge"
        value={fields.project_challenge}
        onChange={(v) => update("project_challenge", v)}
      />
      <TextArea label="The Solution" value={fields.solution} onChange={(v) => update("solution", v)} />
      <TextArea
        label="Materials Used"
        value={fields.materials_used}
        onChange={(v) => update("materials_used", v)}
      />

      <div>
        <label className="block text-sm font-medium text-slate-700">FAQ</label>
        <div className="mt-2 space-y-3">
          {faq.map((item, i) => (
            <div key={i} className="rounded border border-slate-200 p-3">
              <input
                value={item.question}
                onChange={(e) => {
                  const next = [...faq];
                  next[i] = { ...next[i], question: e.target.value };
                  setFaq(next);
                }}
                placeholder="Question"
                className="w-full rounded border border-slate-300 px-2 py-1 text-sm font-medium"
              />
              <textarea
                value={item.answer}
                onChange={(e) => {
                  const next = [...faq];
                  next[i] = { ...next[i], answer: e.target.value };
                  setFaq(next);
                }}
                placeholder="Answer"
                rows={2}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
              />
              <button
                onClick={() => setFaq(faq.filter((_, idx) => idx !== i))}
                className="mt-1 text-xs text-red-600 underline"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            onClick={() => setFaq([...faq, { question: "", answer: "" }])}
            className="text-sm text-brand-accent underline"
          >
            + Add question
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {savedMsg && <p className="text-sm text-green-700">{savedMsg}</p>}

      <button
        onClick={save}
        disabled={saving}
        className="rounded bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
      />
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
      />
    </div>
  );
}
