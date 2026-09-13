import LogoutButton from "./logout-button";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-slate-600">Herts Admin</span>
          <a href="/admin/dashboard" className="text-sm text-slate-500 hover:text-slate-700">
            Dashboard
          </a>
          <a href="/admin/imports" className="text-sm text-slate-500 hover:text-slate-700">
            Imports
          </a>
          <a href="/admin/reviews" className="text-sm text-slate-500 hover:text-slate-700">
            Reviews
          </a>
        </div>
        <LogoutButton />
      </div>
      {children}
    </div>
  );
}
