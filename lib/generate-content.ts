import type { Project, FaqItem } from "@/types/database";
import { generateText } from "@/lib/ai";
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

interface ServiceConfig {
  label: string;
  pageNoun: string;
  instructions: string;
}

const SERVICE_CONFIG: Record<string, ServiceConfig> = {
  roof_replacement: {
    label: "Roof Replacement",
    pageNoun: "roof replacement",
    instructions:
      "Write only about roof replacement work supported by the project facts. Do not mention decks, siding, gutters, windows, chimneys, or storm damage unless the project notes explicitly say they were part of this job.",
  },

  roof_repair: {
    label: "Roof Repair",
    pageNoun: "roof repair",
    instructions:
      "Focus specifically on roof repair. Do not describe this as a complete roof replacement unless the project facts say the entire roof was replaced.",
  },

  storm_damage: {
    label: "Storm Damage Restoration",
    pageNoun: "storm damage restoration project",
    instructions:
      "Focus on storm restoration. Only mention wind, hail, fallen trees, insurance claims, or specific storm damage when explicitly supported by the project facts.",
  },

  siding: {
    label: "Siding Installation",
    pageNoun: "siding project",
    instructions:
      "The entire page must focus on siding. Do not describe this as a roofing project. Do not invent siding damage, house wrap, insulation, manufacturer, or product specifications.",
  },

  gutters: {
    label: "Gutter Installation",
    pageNoun: "gutter project",
    instructions:
      "The entire page must focus on gutters. Do not turn this into a roofing project. Do not invent gutter sizes, gutter guards, drainage problems, or downspout configurations.",
  },

  windows: {
    label: "Window Installation",
    pageNoun: "window project",
    instructions:
      "The entire page must focus on window installation or replacement. Do not write a roofing page. Do not invent window brands, efficiency ratings, glass packages, or damage.",
  },

  deck_construction: {
    label: "Deck Construction",
    pageNoun: "deck construction project",
    instructions:
      "The entire page must focus on deck construction. The title, H1, introduction, challenge, solution, materials, and FAQs must be about the deck. Do not mention roofing, shingles, roof leaks, ventilation, flashing, or roof replacement unless explicitly included in the project facts.",
  },

  composite_deck: {
    label: "Composite Deck Installation",
    pageNoun: "composite deck project",
    instructions:
      "The entire page must focus on the composite deck. Use the manufacturer, product line, and color only when provided. Do not describe this as a roofing project and do not invent a decking manufacturer.",
  },

  chimney: {
    label: "Chimney Project",
    pageNoun: "chimney project",
    instructions:
      "Keep the entire page focused on the chimney work described in the project facts. Do not turn it into a general roofing page or invent masonry damage, leaks, flashing failures, or chimney components.",
  },
};

function getServiceConfig(
  serviceType: string | null | undefined
): ServiceConfig {
  if (!serviceType) {
    return {
      label: "Service Not Confirmed",
      pageNoun: "construction project",
      instructions:
        "The service type has not been confirmed. Do not assume this is roofing. Use only the supplied project facts and keep the wording neutral.",
    };
  }

  return (
    SERVICE_CONFIG[serviceType] ?? {
      label: serviceType.replace(/_/g, " "),
      pageNoun: serviceType.replace(/_/g, " "),
      instructions: `Use "${serviceType.replace(
        /_/g,
        " "
      )}" as the primary subject of the page. Do not automatically describe the project as roofing.`,
    }
  );
}

function buildPrompt(project: Project): string {
  const service = getServiceConfig(project.service_type);

  const location = [project.city, project.state]
    .filter(Boolean)
    .join(", ");

  const materials = [
    project.manufacturer,
    project.product,
    project.product_line,
    project.product_color,
  ]
    .filter(Boolean)
    .join(" ");

  const notes =
    project.project_description?.trim() || "(none provided)";

  return `
You are writing a completed-project page for Herts Roofing & Construction.

IMPORTANT:
Herts Roofing & Construction performs multiple exterior construction services.
The word "Roofing" in the company name DOES NOT mean every project is a roofing project.

CONFIRMED SERVICE TYPE:
${service.label}

PRIMARY SUBJECT:
${service.pageNoun}

SERVICE-SPECIFIC RULE:
${service.instructions}

PROJECT FACTS:

Service:
${service.label}

Location:
${location || "Location not specified"}

Materials / manufacturer / product:
${materials || "Not specified"}

Field notes:
${notes}

ACCURACY RULES:

Use ONLY information supported by the project facts above.

Never invent:
- damage
- roof leaks
- storms
- hail
- wind damage
- deterioration
- structural problems
- code violations
- permit issues
- materials
- manufacturers
- product lines
- warranties
- customer quotes
- reviews
- prices
- dates
- homeowner names
- project outcomes

If information is unavailable, keep the wording general.

Do NOT invent a problem just to make the Project Challenge section interesting.

SERVICE CONSISTENCY:

Every section must remain focused on "${service.label}".

The page title, H1, meta description, introduction, challenge, solution,
materials and FAQs must all match the confirmed service type.

If this is Deck Construction, write a DECK page.
If this is Composite Deck Installation, write a COMPOSITE DECK page.
If this is Siding Installation, write a SIDING page.
If this is Gutter Installation, write a GUTTER page.
If this is Window Installation, write a WINDOW page.
Only write roofing content when the confirmed service is actually roofing.

WRITING STYLE:

Write like a contractor describing a real completed project.

Use:
- plain English
- short sentences
- homeowner-friendly explanations
- natural contractor terminology
- factual descriptions

Avoid:
- AI filler
- exaggerated sales language
- keyword stuffing
- exclamation points
- em dashes
- top-notch
- unparalleled
- meticulous
- elevate
- delve
- robust
- testament

LOCAL SEO:

Naturally include the service and location in the page title and H1.
Do not create fake location information.

OUTPUT:

Return ONLY valid JSON.
No Markdown.
No code fences.
No commentary.

Use exactly this structure:

{
  "page_title": "under 60 characters, focused on ${service.label} and the location",
  "h1": "human project headline under 70 characters focused on ${service.label}",
  "meta_description": "under 155 characters describing this ${service.label} project",
  "introduction": "2-3 sentences introducing this ${service.pageNoun}",
  "project_challenge": "2-4 sentences describing the situation using only known facts",
  "solution": "2-4 sentences describing what Herts did for this ${service.pageNoun}",
  "materials_used": "1-2 sentences describing known materials or stating that specific material details were not provided",
  "faq": [
    {
      "question": "a homeowner question specifically about ${service.label}",
      "answer": "1-2 sentence factual answer"
    },
    {
      "question": "a second homeowner question specifically about ${service.label}",
      "answer": "1-2 sentence factual answer"
    },
    {
      "question": "a third homeowner question specifically about ${service.label}",
      "answer": "1-2 sentence factual answer"
    }
  ]
}
`.trim();
}

export async function generateProjectContent(
  project: Project
): Promise<GeneratedContent> {
  const raw = await generateText(buildPrompt(project), {
    maxTokens: 1500,
    json: true,
  });

  const cleaned = raw
    .trim()
    .replace(/^```(json)?/i, "")
    .replace(/```$/, "")
    .trim();

  try {
    return JSON.parse(cleaned) as GeneratedContent;
  } catch {
    throw new Error(
      "Couldn't parse the generated content as JSON. Please try again."
    );
  }
}