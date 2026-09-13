import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateText } from "@/lib/ai";

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
  const supabase = createAdminClient();
  const { data: review, error } = await supabase
    .from("reviews")
    .select("homeowner, rating, review")
    .eq("id", params.id)
    .single();

  if (error || !review) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  try {
    const reply = (
      await generateText(buildPrompt(review.homeowner, review.rating, review.review), { maxTokens: 300 })
    ).trim();
    return NextResponse.json({ reply });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Generation failed" },
      { status: 500 }
    );
  }
}
