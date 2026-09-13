import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Best-effort match of an incoming Google review to one of your job sites,
 * so it can be geotagged and shown on that project's page. There's no
 * shared ID between Google reviews and CompanyCam/LocalProof projects, so
 * this guesses from what's actually available: the reviewer's name against
 * the project's customer_name, optionally narrowed by how close the review
 * date is to the job's completion date.
 *
 * Deliberately conservative — a wrong match puts someone else's review on
 * a stranger's job page, which is worse than leaving it unmatched for a
 * human to assign in /admin/reviews. Only returns a match on a fairly
 * confident name match.
 */
export async function matchReviewToProject(
  supabase: SupabaseClient,
  homeowner: string,
  reviewDate: string
): Promise<{ projectId: string | null; status: "matched" | "unmatched" }> {
  const normalizedName = homeowner.trim().toLowerCase();
  if (!normalizedName) return { projectId: null, status: "unmatched" };

  // Pull a reasonably small candidate set — published or draft projects
  // whose customer_name shares a token with the reviewer's name.
  const firstToken = normalizedName.split(/\s+/)[0];
  const { data: candidates } = await supabase
    .from("projects")
    .select("id, customer_name, completion_date")
    .ilike("customer_name", `%${firstToken}%`);

  if (!candidates || candidates.length === 0) {
    return { projectId: null, status: "unmatched" };
  }

  // Exact (case-insensitive) full-name match wins outright.
  const exact = candidates.find((c) => c.customer_name?.trim().toLowerCase() === normalizedName);
  if (exact) return { projectId: exact.id, status: "matched" };

  // Otherwise, if there's exactly one candidate sharing that name token and
  // its completion date is within 6 months of the review, call it a match.
  // More than one candidate is too ambiguous to guess — leave unmatched.
  if (candidates.length === 1 && candidates[0].completion_date) {
    const days =
      Math.abs(new Date(reviewDate).getTime() - new Date(candidates[0].completion_date).getTime()) /
      (1000 * 60 * 60 * 24);
    if (days <= 180) {
      return { projectId: candidates[0].id, status: "matched" };
    }
  }

  return { projectId: null, status: "unmatched" };
}
