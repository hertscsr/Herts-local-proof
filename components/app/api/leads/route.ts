import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/** Public lead-capture endpoint — "Get a Free Estimate" forms post here. */
export async function POST(req: NextRequest) {
  const body = await req.json();

  const { name, phone, email, zip, service, project_id_that_generated_lead, page_url, utm_source, utm_medium, utm_campaign } = body;

  if (!name || !phone) {
    return NextResponse.json({ error: "Name and phone are required." }, { status: 400 });
  }

  const supabase = createClient();
  const { error } = await supabase.from("leads").insert({
    name,
    phone,
    email,
    zip,
    service,
    project_id_that_generated_lead,
    page_url,
    utm_source,
    utm_medium,
    utm_campaign,
    source: "website",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
