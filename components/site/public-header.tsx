import Link from "next/link";
import { ArrowRight, House, LockKeyhole, Sparkles, Star, UtensilsCrossed } from "lucide-react";
import { getSession } from "@/lib/authz";
import { ButtonLink } from "@/components/ui";
import { LogoutButton } from "@/components/site/logout-button";

export async function PublicHeader() {
  const session = await getSession();
  const ratingHref = session?.user.role === "USER" ? "/my-ratings" : "/login";
  const showRatings = session?.user.role !== "ADMIN";

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur">
      <div className="mx-auto flex min-h-[76px] max-w-7xl items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-lg text-lg font-extrabold tracking-tight text-gray-950 focus-visible:outline-2 focus-visible:outline-primary" aria-label="FoodRec beranda">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-white"><UtensilsCrossed size={20} aria-hidden="true" /></span>
          Food<span className="-ml-2 text-primary">Rec</span>
        </Link>

        <nav aria-label="Navigasi utama" className="hidden items-center gap-5 lg:flex">
          <Link href="/" className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"><House size={16} aria-hidden="true" /> Beranda</Link>
          <Link href="/foods" className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"><UtensilsCrossed size={16} aria-hidden="true" /> Jelajahi makanan</Link>
          {showRatings && <Link href={ratingHref} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"><Star size={16} aria-hidden="true" /> Rating saya</Link>}
          <span aria-disabled="true" title="Segera hadir" className="inline-flex cursor-not-allowed items-center gap-2 px-2 py-2 text-sm text-gray-400"><Sparkles size={16} aria-hidden="true" /> Rekomendasi <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium">Segera hadir</span></span>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {session ? (
            <>
              {session.user.role === "ADMIN" && <Link href="/admin" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-accent hover:bg-green-50 sm:inline">Panel Admin</Link>}
              <span className="hidden max-w-36 truncate text-sm font-semibold text-gray-700 md:inline">{session.user.name}</span>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 sm:inline-flex sm:items-center sm:gap-2"><LockKeyhole size={15} aria-hidden="true" /> Masuk</Link>
              <ButtonLink href="/register" className="min-h-10 px-4">Daftar <ArrowRight size={15} aria-hidden="true" /></ButtonLink>
            </>
          )}
        </div>
      </div>
      <nav aria-label="Navigasi cepat" className="flex gap-2 overflow-x-auto border-t border-border px-5 py-2 lg:hidden">
        <Link href="/" className="shrink-0 rounded-lg bg-soft px-3 py-1.5 text-xs font-semibold text-orange-900">Beranda</Link>
        <Link href="/foods" className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">Jelajahi makanan</Link>
        {showRatings && <Link href={ratingHref} className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">Rating saya</Link>}
        <span aria-disabled="true" className="shrink-0 rounded-lg px-3 py-1.5 text-xs text-gray-400">Rekomendasi · Segera hadir</span>
      </nav>
    </header>
  );
}
