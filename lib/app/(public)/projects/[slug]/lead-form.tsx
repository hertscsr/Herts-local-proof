"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/track-event";

interface Props {
  projectId: string;
  serviceType: string;
}

export default function LeadForm({ projectId, serviceType }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [zip, setZip] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    trackEvent("cta_click", projectId);
    try {
      const params = new URLSearchParams(window.location.search);
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          email: email || null,
          zip: zip || null,
          service: serviceType,
          project_id_that_generated_lead: projectId,
          page_url: window.location.href,
          utm_source: params.get("utm_source"),
          utm_medium: params.get("utm_medium"),
          utm_campaign: params.get("utm_campaign"),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong — try again");
      trackEvent("lead_submit", projectId);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong — try again");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
        <p className="font-medium text-green-800">Thanks — we&apos;ll be in touch shortly.</p>
        {process.env.NEXT_PUBLIC_BUSINESS_PHONE && (
          <p className="mt-1 text-sm text-green-700">
            Need it faster? Call us directly at{" "}
            <a href={`tel:${process.env.NEXT_PUBLIC_BUSINESS_PHONE}`} className="underline">
              {process.env.NEXT_PUBLIC_BUSINESS_PHONE}
            </a>
            .
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-slate-50 p-6">
      <h2 className="text-lg font-semibold text-brand">Like what you see? Get a free estimate.</h2>
      <p className="mt-1 text-sm text-slate-600">
        Same crew, same materials, same result — for your place.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Your name"
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          type="tel"
          placeholder="Phone number"
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="Email (optional)"
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          value={zip}
          onChange={(e) => setZip(e.target.value)}
          placeholder="ZIP code (optional)"
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="mt-4 w-full rounded bg-brand-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 sm:w-auto"
      >
        {submitting ? "Sending…" : "Get My Free Estimate"}
      </button>
    </form>
  );
}
