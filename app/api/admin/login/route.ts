import { NextRequest, NextResponse } from "next/server";
import { checkPassword, createSessionToken, ADMIN_COOKIE_NAME, ADMIN_SESSION_MAX_AGE_SECONDS } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  let valid: boolean;
  try {
    valid = checkPassword(body.password ?? "");
  } catch (e) {
    // ADMIN_PASSWORD not set — a config problem, not a wrong-password problem.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Login is not configured" },
      { status: 500 }
    );
  }

  if (!valid) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const token = await createSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
