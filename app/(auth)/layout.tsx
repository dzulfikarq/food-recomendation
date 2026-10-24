import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, UtensilsCrossed } from "lucide-react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="relative grid min-h-screen bg-white lg:grid-cols-[.95fr_1.05fr]">
      <section className="relative hidden overflow-hidden bg-soft p-12 lg:flex lg:flex-col lg:justify-between xl:p-16">
        <Link href="/" className="relative z-10 flex w-fit items-center gap-2.5 text-lg font-extrabold tracking-tight text-gray-950"><span className="grid size-10 place-items-center rounded-xl bg-primary text-white"><UtensilsCrossed size={20} aria-hidden="true" /></span> Food<span className="-ml-2 text-primary">Rec</span></Link>
        <div className="relative z-10 max-w-lg pb-8">
          <span className="text-xs font-bold uppercase tracking-[.18em] text-primary">SELERA PUNYA CERITA</span>
          <h1 className="mt-5 text-5xl font-extrabold leading-tight tracking-[-.045em] text-gray-950 xl:text-6xl">Setiap pilihan bantu kita <span className="text-primary">lebih mengenal selera.</span></h1>
          <p className="mt-5 max-w-md text-base leading-7 text-secondary">FoodRec menghubungkan preferensi makanan dengan pendekatan rekomendasi berbasis pola rating.</p>
        </div>
        <div className="absolute -right-28 top-1/4 size-96 rounded-full border border-orange-200" />
        <div className="absolute -right-16 top-[30%] size-72 rounded-full border border-dashed border-orange-300" />
        <div className="absolute -bottom-28 -left-24 size-80 rounded-full bg-orange-100/70 blur-2xl" />
        <span className="relative z-10 text-xs text-secondary">© {new Date().getFullYear()} FoodRec</span>
      </section>
      <section className="flex min-h-screen flex-col px-5 py-6 sm:px-10 lg:px-12 xl:px-20">
        <div className="flex justify-between lg:justify-end">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-950 lg:hidden"><UtensilsCrossed size={18} className="text-primary" aria-hidden="true" /> FoodRec</Link>
          <Link href="/" className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-50 hover:text-gray-900"><ArrowLeft size={16} aria-hidden="true" /> Beranda</Link>
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">{children}</div>
        <p className="m-0 pb-2 text-center text-xs text-gray-400">Akun FoodRec dilindungi dengan autentikasi berbasis sesi.</p>
      </section>
    </main>
  );
}
