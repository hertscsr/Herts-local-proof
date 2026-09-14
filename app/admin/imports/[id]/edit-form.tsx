"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Project, FaqItem, ServiceType } from "@/types/database";

interface Props {
  project: Project;
}

const SERVICE_TYPES: { value: ServiceType; label: string }[] = [
  { value: "roof_replacement", label: "Roof Replacement" },
  { value: "roof_repair", label: "Roof Repair" },
  { value: "storm_damage", label: "Storm Damage" },
  { value: "siding", label: "Siding" },
  { value: "gutters", label: "Gutters" },
  { value: "windows", label: "Windows" },
  { value: "deck_construction", label: "Deck Construction" },
  { value: "composite_deck", label: "Composite Deck" },
  { value: "chimney", label: "Chimney" },
];

export default function EditProjectForm({ project }: Props) {
  const router = useRouter();

  const [serviceType, setServiceType] = useState<ServiceType | "">(
    project.service_type ?? ""
  );

  const [basics, setBasics] = useState({
    customer_name: project.customer_name ?? "",
    city: project.city ?? "",
    state: project.state ?? "",
  });

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
  const [message, setMessage] = useState<string | null>(null);

  function update(key: keyof typeof fields, value: string) {
    setFields((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function generate() {
    setError(null);
    setMessage(null);

    if (!serviceType) {
      setError("Select a service type before generating content.");
      return;
    }

    setGenerating(true);

    try {
      const res = await fetch(
        `/api/projects/${project.id}/generate-content`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            service_type: serviceType,
            customer_name: basics.customer_name,
            city: basics.city,
            state: basics.state,
          }),
        }
      );

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          json.error ?? `Generation failed (${res.status})`
        );
      }

      const content = json.content;

      if (!content) {
        throw new Error("AI did not return project content.");
      }

      setFields({
        page_title: content.page_title ?? "",
        h1: content.h1 ?? "",
        meta_description: content.meta_description ?? "",
        introduction: content.introduction ?? "",
        project_challenge: content.project_challenge ?? "",
        solution: content.solution ?? "",
        materials_used: content.materials_used ?? "",
      });

      setFaq(Array.isArray(content.faq) ? content.faq : []);

      const selectedService = SERVICE_TYPES.find(
        (item) => item.value === serviceType
      );

      setMessage(
        `AI draft generated for ${
          selectedService?.label ?? serviceType
        }. Review it before saving.`
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Generation failed"
      );
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      if (!serviceType) {
        setError(
          "Pick a service type before saving. The project cannot be published without one."
        );
        setSaving(false);
        return;
      }

      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...basics,
          ...fields,
          faq,
          service_type: serviceType,
          service_confirmed: true,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          json.error ?? `Save failed (${res.status})`
        );
      }

      router.push("/admin/imports?saved=1");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaving(false);
    }
  }

  const selectedServiceLabel = SERVICE_TYPES.find(
    (item) => item.value === serviceType
  )?.label;

  return (
    <div className="mt-6 space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Project name
          </label>

          <input
            value={basics.customer_name}
            onChange={(e) =>
              setBasics((current) => ({
                ...current,
                customer_name: e.target.value,
              }))
            }
            placeholder="e.g. Smith Deck Construction"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">
            City
          </label>

          <input
            value={basics.city}
            onChange={(e) =>
              setBasics((current) => ({
                ...current,
                city: e.target.value,
              }))
            }
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">
            State
          </label>

          <input
            value={basics.state}
            onChange={(e) =>
              setBasics((current) => ({
                ...current,
                state: e.target.value,
              }))
            }
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <p className="-mt-3 text-xs text-slate-500">
        CompanyCam fills these fields automatically. You can correct them
        before generating or saving.
      </p>

      <div>
        <label className="block text-sm font-medium text-slate-700">
          Service type
        </label>

        <select
          value={serviceType}
          onChange={(e) => {
            setServiceType(e.target.value as ServiceType | "");
            setMessage(null);
            setError(null);
          }}
          className={`mt-1 w-full rounded border bg-white px-3 py-2 text-sm ${
            serviceType ? "border-slate-300" : "border-red-400"
          }`}
        >
          <option value="">— Select a service type —</option>

          {SERVICE_TYPES.map((service) => (
            <option key={service.value} value={service.value}>
              {service.label}
            </option>
          ))}
        </select>

        <p className="mt-1 text-xs text-slate-500">
          {serviceType
            ? `AI generation will use "${selectedServiceLabel}" as the project service.`
            : "Select the correct service before generating content."}
        </p>
      </div>

      <div className="rounded border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={generate}
            disabled={generating || !serviceType}
            className="rounded bg-brand-accent px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating ? "Generating…" : "Generate with AI"}
          </button>

          {serviceType && (
            <span className="text-sm font-medium text-slate-700">
              Generating as: {selectedServiceLabel}
            </span>
          )}
        </div>

        <p className="mt-2 text-xs text-slate-500">
          AI uses the service type, project name, city and state currently
          shown above. You do not need to save before generating.
        </p>
      </div>

      <Field
        label="Page title"
        value={fields.page_title}
        onChange={(value) => update("page_title", value)}
      />

      <Field
        label="H1 (headline)"
        value={fields.h1}
        onChange={(value) => update("h1", value)}
      />

      <Field
        label="Meta description"
        value={fields.meta_description}
        onChange={(value) => update("meta_description", value)}
      />

      <TextArea
        label="Introduction"
        value={fields.introduction}
        onChange={(value) => update("introduction", value)}
      />

      <TextArea
        label="The Challenge"
        value={fields.project_challenge}
        onChange={(value) => update("project_challenge", value)}
      />

      <TextArea
        label="The Solution"
        value={fields.solution}
        onChange={(value) => update("solution", value)}
      />

      <TextArea
        label="Materials Used"
        value={fields.materials_used}
        onChange={(value) => update("materials_used", value)}
      />

      <div>
        <label className="block text-sm font-medium text-slate-700">
          FAQ
        </label>

        <div className="mt-2 space-y-3">
          {faq.map((item, index) => (
            <div
              key={index}
              className="rounded border border-slate-200 p-3"
            >
              <input
                value={item.question}
                onChange={(e) => {
                  const next = [...faq];

                  next[index] = {
                    ...next[index],
                    question: e.target.value,
                  };

                  setFaq(next);
                }}
                placeholder="Question"
                className="w-full rounded border border-slate-300 px-2 py-1 text-sm font-medium"
              />

              <textarea
                value={item.answer}
                onChange={(e) => {
                  const next = [...faq];

                  next[index] = {
                    ...next[index],
                    answer: e.target.value,
                  };

                  setFaq(next);
                }}
                placeholder="Answer"
                rows={2}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
              />

              <button
                type="button"
                onClick={() =>
                  setFaq(
                    faq.filter((_, currentIndex) => currentIndex !== index)
                  )
                }
                className="mt-1 text-xs text-red-600 underline"
              >
                Remove
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() =>
              setFaq([
                ...faq,
                {
                  question: "",
                  answer: "",
                },
              ])
            }
            className="text-sm text-brand-accent underline"
          >
            + Add question
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {message && (
        <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">
          {message}
        </p>
      )}

      <button
        type="button"
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
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">
        {label}
      </label>

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
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">
        {label}
      </label>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
      />
    </div>
  );
}