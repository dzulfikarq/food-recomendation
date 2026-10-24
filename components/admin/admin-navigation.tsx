"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ClipboardList, LayoutDashboard, UtensilsCrossed } from "lucide-react";
import { Badge } from "@/components/ui";

const laterItems = [
  { label: "Pemrosesan rekomendasi", icon: ClipboardList }
];

export function AdminNavigation({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  const dashboardActive = pathname === "/admin";
  const foodsActive = pathname.startsWith("/admin/foods");
  const ratingsActive = pathname.startsWith("/admin/ratings");

  if (mobile) {
    return (
      <nav aria-label="Navigasi admin mobile" className="flex gap-2 overflow-x-auto border-b border-border bg-white px-4 py-2 md:hidden">
        <Link href="/admin" aria-current={dashboardActive ? "page" : undefined} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold ${dashboardActive ? "bg-soft text-orange-950" : "text-gray-600 hover:bg-gray-50"}`}>Dashboard</Link>
        <Link href="/admin/foods" aria-current={foodsActive ? "page" : undefined} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold ${foodsActive ? "bg-soft text-orange-950" : "text-gray-600 hover:bg-gray-50"}`}><UtensilsCrossed size={14} aria-hidden="true" /> Kelola Makanan</Link>
        <Link href="/admin/ratings" aria-current={ratingsActive ? "page" : undefined} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold ${ratingsActive ? "bg-soft text-orange-950" : "text-gray-600 hover:bg-gray-50"}`}><BarChart3 size={14} aria-hidden="true" /> Data Rating</Link>
        {laterItems.map(({ label }) => <span key={label} aria-disabled="true" className="shrink-0 rounded-lg px-3 py-2 text-xs text-gray-400">{label} · Nanti</span>)}
      </nav>
    );
  }

  return (
    <nav aria-label="Navigasi admin" className="mt-3 space-y-1">
      <Link href="/admin" aria-current={dashboardActive ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-bold ${dashboardActive ? "bg-soft text-orange-950" : "text-gray-600 hover:bg-gray-50"}`}><LayoutDashboard size={17} aria-hidden="true" /> Dashboard</Link>
      <Link href="/admin/foods" aria-current={foodsActive ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold ${foodsActive ? "bg-soft text-orange-950" : "text-gray-600 hover:bg-gray-50"}`}><UtensilsCrossed size={17} aria-hidden="true" /> Kelola Makanan</Link>
      <Link href="/admin/ratings" aria-current={ratingsActive ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold ${ratingsActive ? "bg-soft text-orange-950" : "text-gray-600 hover:bg-gray-50"}`}><BarChart3 size={17} aria-hidden="true" /> Data Rating</Link>
      {laterItems.map(({ label, icon: Icon }) => <span key={label} aria-disabled="true" title="Segera hadir" className="flex min-h-11 cursor-not-allowed items-center justify-between rounded-xl px-3 text-sm text-gray-400"><span className="flex items-center gap-3"><Icon size={17} aria-hidden="true" />{label}</span><Badge className="bg-gray-100 px-2 py-0.5 text-[9px] text-gray-500">Nanti</Badge></span>)}
    </nav>
  );
}
