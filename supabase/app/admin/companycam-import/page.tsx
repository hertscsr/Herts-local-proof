import { redirect } from "next/navigation";

// This page's tool got folded into /admin/imports directly — "pull in a new
// job" and "add photos to an existing one" both live there now, right next
// to the jobs they affect. This redirect just covers anyone with the old
// link bookmarked.
export default function CompanyCamImportRedirect() {
  redirect("/admin/imports");
}
