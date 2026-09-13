import type { Project, FaqItem } from "@/types/database";
import { generateText } from "@/lib/ai";

/**
 * Uses Claude to draft the "story" content for a project page (introduction,
 * challenge, solution, materials used, and a short FAQ) from what's already
 * on the project row — service type, address, manufacturer/product, and
 * whatever description came over from CompanyCam. This is a FIRST DRAFT
 * only: nothing here gets saved automatically. It always comes back to the
 * admin editor screen for a human to read, fix, and explicitly save before
 * it can be published.
 *
 * Doesn't look at the actual photos (no vision call) — keeps this fast,
 * cheap, and reliable. The written content stays generic-but-accurate
 * (service type + location + materials), which is normally enough for a
 * page like this; if you want photo-specific detail, add it by hand after
 * generating.
 */

export interface GeneratedContent {
  page_title: string;
  h1: string;
  meta_description: string;
  introduction: string;
  project_challenge: string;
  solution: string;
  materials_used: string;
  faq: FaqItem[];
}

function buildPrompt(project: Project): string {
  const service = project.service_type?.replace(/_/g, " ") ?? "roofing";
  const location = [project.city, project.state].filter(Boolean).join(", ");
  const materialLine = [project.manufacturer, project.product, project.product_line, project.product_color]
    .filter(Boolean)
    .join(" ");

  return `You are writing website content for Herts Roofing & Construction, a licensed roofing/siding/decking contractor, describing one completed customer project for their local-SEO project gallery.

Project facts (use only these — do not invent specifics like exact dates, prices, or homeowner names):
- Service: ${service}
- Location: ${location || "New Jersey"}
- Materials/product: ${materialLine || "not specified"}
- Raw notes from the field team (may be empty or messy): ${project.project_description ?? "(none provided)"}

Write plain, direct, non-salesy contractor copy — a homeowner reading this should recognize their own situation, not feel marketed at. No AI-sounding filler words (delve, boast, robust, tapestry, testament, underscore, pivotal, meticulous, elevate), no em dashes, no exclamation points, no generic superlatives ("top-notch", "unparalleled"). Short sentences. Write like a person who actually did the work is describing it.

Return ONLY a JSON object, no markdown fences, no commentary, matching exactly this shape:
{
  "page_title": "under 60 characters, includes the service and location",
  "h1": "a short human headline for the page, under 70 characters",
  "meta_description": "under 155 characters, plain description for search results",
  "introduction": "2-3 sentences setting up who the homeowner was and what they needed",
  "project_challenge": "2-4 sentences on the specific problem found on this job (weather damage, old materials failing, code issues, whatever fits the service type — keep it plausible and generic to the service, don't invent specifics not in the facts above)",
  "solution": "2-4 sentences on what Herts did and why, mentioning the materials/product if given",
  "materials_used": "1-2 sentences naming the materials/product used",
  "faq": [
    {"question": "a real question a homeowner in this situation would ask", "answer": "a 1-2 sentence direct answer"},
    {"question": "a second, different question", "answer": "a 1-2 sentence direct answer"},
    {"question": "a third, different question", "answer": "a 1-2 sentence direct answer"}
  ]
}`;
}

export async function generateProjectContent(project: Project): Promise<GeneratedContent> {
  const raw = await generateText(buildPrompt(project), { maxTokens: 1500, json: true });

  // Strip stray markdown fences just in case the model adds them anyway.
  const cleaned = raw.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();

  let parsed: GeneratedContent;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Couldn't parse the generated content as JSON — try again.");
  }

  return parsed;
}
