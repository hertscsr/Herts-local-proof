import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface Params {
  params: { id: string };
}

function buildPrompt(homeowner: string, rating: number, review: string): string {
  const tone =
    rating >= 4
      ? "Thank them specifically for what they mentioned. Warm, not gushing."
      : rating === 3
      ? "Acknowledge what fell short, thank them for the feedback, invite them to call the office directly to make it right."
      : "Take it seriously without being defensive. Acknowledge the specific issue, apologize plainly, invite them to call the office directly so it can actually get fixed. Never argue with the substance of the complaint in a public reply.";

  return `Write a short public reply from Herts Roofing & Construction to this Google review. ${tone}

Reviewer: ${homeowner}
Rating: ${rating}/5
Review: "${review}"

Rules: under 500 characters. No AI-sounding filler (delve, boast, robust, testament, elevate, unparalleled). No exclamation points unless the review has one first. Sign off naturally, not "Sincerely, Herts Roofing & Construction Team" — something like "- Herts Roofing & Construction" is enough. Return ONLY the reply text, nothing else — no quotes, no preamble.`;
}

/**
 * POST /api/reviews/:id/generate-reply — drafts a reply with Claude.
 * Returns the draft only; saving it (PATCH /api/reviews/:id) and any
 * posting back to Google are separate, deliberate steps — see the reviews
 * admin page.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });
  }

  const supabase = createAdminClient();
  const { data: review, error } = await supabase
    .from("reviews")
    .select("homeowner, rating, review")
    .eq("id", params.id)
    .single();

  if (error || !review) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 300,
      messages: [{ role: "user", content: buildPrompt(review.homeowner, review.rating, review.review) }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json({ error: `Claude API error: ${text.slice(0, 300)}` }, { status: 500 });
  }

  const data = await res.json();
  const reply = (data.content?.[0]?.text ?? "").trim();

  return NextResponse.json({ reply });
}
