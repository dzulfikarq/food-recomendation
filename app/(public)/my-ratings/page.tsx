import type { Metadata } from "next";
import { Suspense } from "react";
import { ArrowLeft, ArrowRight, Star, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { FoodCard } from "@/components/foods/food-card";
import { FoodGridSkeleton } from "@/components/foods/food-grid-skeleton";
import { Container, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { myRatingsQuerySchema } from "@/lib/food/schemas";
import { prisma } from "@/lib/prisma";
import { testPrototypeAutomationEnabled } from "@/lib/recommendations/test-prototype";

export const metadata: Metadata = { title: "Rating Saya" };

export default async function MyRatingsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser();
  const prototypeEnabled = testPrototypeAutomationEnabled();

  return <Container className="py-10 sm:py-14">
    <PageHeader eyebrow="PREFERENSI SAYA" title="Rating Saya" description={prototypeEnabled
      ? "Semua rating tersimpan di akunmu. Saat rating disimpan, Python UBCF memproses rekomendasi pada prototipe lokal; status hasil tampil di halaman Rekomendasi."
      : "Semua rating tersimpan di akunmu. Pilih rating makanan aktif untuk mengubahnya; perubahan tidak langsung membuat rekomendasi baru."} />
    <Suspense fallback={<FoodGridSkeleton count={6} />}>
      <RatingsList userId={Number(user.id)} searchParams={searchParams} />
    </Suspense>
  </Container>;
}

async function RatingsList({ userId, searchParams }: { userId: number; searchParams: Promise<{ page?: string }> }) {
  const query = myRatingsQuerySchema.safeParse(await searchParams);
  const pagination = query.success ? query.data : myRatingsQuerySchema.parse({});
  const [ratings, total, summary] = await Promise.all([
    prisma.rating.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      select: { rating: true, updatedAt: true, food: { select: { id: true, foodCode: true, name: true, description: true, category: true, taste: true, origin: true, imageUrl: true, isActive: true } } }
    }),
    prisma.rating.count({ where: { userId } }),
    prisma.rating.aggregate({ where: { userId }, _avg: { rating: true } })
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pagination.pageSize));
  const averageRating = summary._avg.rating === null
    ? null
    : new Intl.NumberFormat("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(summary._avg.rating);

  return <>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p className="m-0 text-sm text-secondary"><strong className="text-gray-900">{total}</strong> rating tersimpan{averageRating && <> <span aria-hidden="true">·</span> Rata-rata <strong className="text-gray-900">{averageRating}/5</strong></>}</p><Link href="/foods" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50"><UtensilsCrossed size={15} aria-hidden="true" /> Kembali ke katalog</Link></div>
    {ratings.length ? <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3">{ratings.map(({ food, rating }) => <FoodCard key={food.id} food={{ ...food, rating }} canRate={food.isActive} role="USER" />)}</div> : <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-border bg-white px-6 text-center"><div><Star className="mx-auto size-9 text-orange-300" aria-hidden="true" /><h2 className="mb-0 mt-3 text-lg font-bold text-gray-900">Belum ada rating</h2><p className="mb-0 mt-1 text-sm text-secondary">Nilai makanan yang kamu kenal untuk menyimpan preferensimu.</p><Link href="/foods" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white hover:bg-primary-hover">Jelajahi makanan <ArrowRight size={15} aria-hidden="true" /></Link></div></div>}
    {totalPages > 1 && <nav aria-label="Pagination rating" className="mt-7 flex justify-end gap-2"><Link href={`/my-ratings?page=${Math.max(1, pagination.page - 1)}`} aria-disabled={pagination.page <= 1} tabIndex={pagination.page <= 1 ? -1 : undefined} className={`inline-flex min-h-10 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold ${pagination.page <= 1 ? "pointer-events-none text-gray-300" : "text-gray-700 hover:bg-gray-50"}`}><ArrowLeft size={14} aria-hidden="true" /> Sebelumnya</Link><Link href={`/my-ratings?page=${Math.min(totalPages, pagination.page + 1)}`} aria-disabled={pagination.page >= totalPages} tabIndex={pagination.page >= totalPages ? -1 : undefined} className={`inline-flex min-h-10 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold ${pagination.page >= totalPages ? "pointer-events-none text-gray-300" : "text-gray-700 hover:bg-gray-50"}`}>Berikutnya <ArrowRight size={14} aria-hidden="true" /></Link></nav>}
  </>;
}
