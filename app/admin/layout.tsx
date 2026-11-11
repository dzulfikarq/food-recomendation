import type { ReactNode } from "react";
import Link from "next/link";
import { ShieldCheck, UtensilsCrossed } from "lucide-react";
import { AdminNavigation } from "@/components/admin/admin-navigation";
import { LogoutButton } from "@/components/site/logout-button";
import { requireAdmin } from "@/lib/authz";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="min-h-screen bg-gray-50 md:flex">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-border bg-white md:flex">
        <Link href="/" className="flex h-[76px] items-center gap-2.5 border-b border-border px-7 text-lg font-extrabold tracking-tight text-gray-950"><span className="grid size-10 place-items-center rounded-xl bg-primary text-white"><UtensilsCrossed size={20} aria-hidden="true" /></span>Food<span className="-ml-2 text-primary">Rec</span></Link>
        <div className="px-4 py-5">
          <p className="px-3 text-[10px] font-bold uppercase tracking-[.18em] text-gray-600">WORKSPACE</p>
          <AdminNavigation />
        </div>
        <div className="mt-auto border-t border-border p-4">
          <Link href="/" className="mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-50"><ShieldCheck size={15} aria-hidden="true" /> Lihat situs publik</Link>
          <div className="flex items-center justify-between gap-2 rounded-xl bg-gray-50 p-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-gray-900">{admin.name}</p><p className="truncate text-xs text-gray-500">Administrator</p></div><LogoutButton /></div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex min-h-[76px] items-center justify-between border-b border-border bg-white px-5 sm:px-8">
          <div><p className="m-0 text-xs font-semibold uppercase tracking-widest text-primary">FOODREC ADMIN</p><p className="m-0 mt-1 text-sm font-semibold text-gray-800">Ruang kerja administrator</p></div>
          <div className="flex items-center gap-3"><span className="hidden text-sm font-semibold text-gray-700 sm:inline">{admin.name}</span><div className="grid size-9 place-items-center rounded-full bg-orange-100 text-sm font-bold text-orange-900" aria-label={`Akun ${admin.name}`}>{admin.name.charAt(0).toUpperCase()}</div><span className="md:hidden"><LogoutButton /></span></div>
        </header>
        <AdminNavigation mobile />
        <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">{children}</main>
      </div>
    </div>
  );
}
