import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, ADMIN_COOKIE_NAME } from "@/lib/admin-auth";

/**
 * Gatekeeper for everything under /admin and the admin-only write APIs.
 * Left alone on purpose: /api/leads (public contact form), /api/sitemap
 * (public), /api/companycam/webhook (its own ?secret= check, hit by
 * CompanyCam's servers directly — a login cookie makes no sense there).
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Let the login page and its own API through, or there's no way to log in.
  // /api/reviews/import has its own shared-secret check (same pattern as
  // the CompanyCam webhook) since it's meant to be called by an automated
  // sync, not a logged-in browser — see that route for details.
  if (
    pathname === "/admin/login" ||
    pathname === "/api/admin/login" ||
    pathname === "/api/reviews/import"
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const authed = await verifySessionToken(token);

  if (authed) {
    return NextResponse.next();
  }

  // API routes get a plain 401 (whatever admin UI called them can show an
  // error); page routes get redirected to the login form.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/admin/login", req.url);
  loginUrl.searchParams.set("redirect", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/projects",
    "/api/projects/:path*",
    "/api/companycam/import",
    "/api/companycam/search",
    "/api/companycam/cc-photos",
    "/api/companycam/manual-import",
    "/api/admin/clear-imports",
    "/api/reviews/:path*",
  ],
};
