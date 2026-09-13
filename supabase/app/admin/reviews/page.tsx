import { createAdminClient } from "@/lib/supabase/admin";
import ReviewRow from "./review-row";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const supabase = createAdminClient();

  const { data: reviews } = await supabase
    .from("reviews")
    .select("*")
    .order("date", { ascending: false });

  const { data: projects } = await supabase
    .from("projects")
    .select("id, customer_name, city, state")
    .order("created_at", { ascending: false });

  const unmatched = (reviews ?? []).filter((r) => !r.project_id);
  const rest = (reviews ?? []).filter((r) => r.project_id);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold text-brand">Reviews</h1>
      <p className="mt-2 text-sm text-slate-600">
        Google reviews come in through a sync, get matched to a job site when possible, and sit
        here for you to review, assign, and draft a reply for — nothing shows on the public site
        until you check &quot;Show on website.&quot; Posting a reply back to Google isn&apos;t
        automatic yet — save your reply here and it&apos;ll go out on the next sync.
      </p>

      {unmatched.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-amber-700">
            Needs a job site assigned ({unmatched.length})
          </h2>
          <div className="mt-3 space-y-4">
            {unmatched.map((r) => (
              <ReviewRow key={r.id} review={r} projects={projects ?? []} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-lg font-semibold">All reviews</h2>
        <div className="mt-3 space-y-4">
          {rest.map((r) => (
            <ReviewRow key={r.id} review={r} projects={projects ?? []} />
          ))}
          {(!reviews || reviews.length === 0) && (
            <p className="text-sm text-slate-500">
              No reviews yet. Once your Google Business Profile is connected, ask for a sync to
              pull them in.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
