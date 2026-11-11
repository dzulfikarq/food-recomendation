"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpenCheck, ClipboardList, LayoutDashboard, UtensilsCrossed } from "lucide-react";

export function AdminNavigation({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  const dashboardActive = pathname === "/admin";
  const foodsActive = pathname.startsWith("/admin/foods");
  const ratingsActive = pathname.startsWith("/admin/ratings");
  const recommendationsActive = pathname.startsWith("/admin/recommendations");
  const researchActive = pathname.startsWith("/admin/research");

  if (mobile) {
    return (
      <nav aria-label="Navigasi admin mobile" className="flex gap-2 overflow-x-auto border-b border-border bg-white px-4 py-2 md:hidden">
        <Link href="/admin" aria-current={dashboardActive ? "page" : undefined} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold ${dashboardActive ? "bg-soft text-orange-950" : "text-gray-600 hover:bg-gray-50"}`}>Dashboard</Link>
        <Link href="/admin/foods" aria-current={foodsActive ? "page" : undefined} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold ${foodsActive ? "bg-soft text-orange-950" : "text-gray-600 hover:bg-gray-50"}`}><UtensilsCrossed size={14} aria-hidden="true" /> Kelola Makanan</Link>
        <Link href="/admin/ratings" aria-current={ratingsActive ? "page" : undefined} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold ${ratingsActive ? "bg-soft text-orange-950" : "text-gray-600 hover:bg-gray-50"}`}><BarChart3 size={14} aria-hidden="true" /> Data Rating</Link>
        <Link href="/admin/research" aria-current={researchActive ? "page" : undefined} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold ${researchActive ? "bg-soft text-orange-950" : "text-gray-600 hover:bg-gray-50"}`}><BookOpenCheck size={14} aria-hidden="true" /> Penelitian</Link>
        <Link href="/admin/recommendations" aria-current={recommendationsActive ? "page" : undefined} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold ${recommendationsActive ? "bg-soft text-orange-950" : "text-gray-600 hover:bg-gray-50"}`}><ClipboardList size={14} aria-hidden="true" /> Pemrosesan Rekomendasi</Link>
      </nav>
    );
  }

  return (
    <nav aria-label="Navigasi admin" className="mt-3 space-y-1">
      <Link href="/admin" aria-current={dashboardActive ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-bold ${dashboardActive ? "bg-soft text-orange-950" : "text-gray-600 hover:bg-gray-50"}`}><LayoutDashboard size={17} aria-hidden="true" /> Dashboard</Link>
      <Link href="/admin/foods" aria-current={foodsActive ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold ${foodsActive ? "bg-soft text-orange-950" : "text-gray-600 hover:bg-gray-50"}`}><UtensilsCrossed size={17} aria-hidden="true" /> Kelola Makanan</Link>
      <Link href="/admin/ratings" aria-current={ratingsActive ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold ${ratingsActive ? "bg-soft text-orange-950" : "text-gray-600 hover:bg-gray-50"}`}><BarChart3 size={17} aria-hidden="true" /> Data Rating</Link>
      <Link href="/admin/research" aria-current={researchActive ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold ${researchActive ? "bg-soft text-orange-950" : "text-gray-600 hover:bg-gray-50"}`}><BookOpenCheck size={17} aria-hidden="true" /> Pengumpulan Penelitian</Link>
      <Link href="/admin/recommendations" aria-current={recommendationsActive ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold ${recommendationsActive ? "bg-soft text-orange-950" : "text-gray-600 hover:bg-gray-50"}`}><ClipboardList size={17} aria-hidden="true" /> Pemrosesan Rekomendasi</Link>
    </nav>
  );
}
