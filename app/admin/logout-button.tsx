"use client";

import { useRouter, usePathname } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  const pathname = usePathname();

  if (pathname === "/admin/login") return null;

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <button onClick={logout} className="text-sm text-slate-500 underline hover:text-slate-700">
      Log out
    </button>
  );
}
