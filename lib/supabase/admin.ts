import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only admin client using the service role key — bypasses RLS.
 *
 * IMPORTANT: this must never be imported into anything that ships to the
 * browser. It exists so the admin API routes (create/update/publish a
 * project, upload a photo) can write to the database before real staff
 * authentication is wired up. Once login is built, these routes should
 * check the caller's session/role and use the regular RLS-scoped client
 * instead of reaching for this admin bypass on every request.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
