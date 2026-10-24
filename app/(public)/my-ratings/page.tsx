import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, Star } from "lucide-react";
import Link from "next/link";
import { FoodCard } from "@/components/foods/food-card";
import { Container, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { myRatingsQuerySchema } from "@/lib/food/schemas";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Rating Saya" };

export default async function MyRatingsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser();
  const query = myRatingsQuerySchema.safeParse(await searchParams);
  const pagination = query.success ? query.data : myRatingsQuerySchema.parse({});
  const userId = Number(user.id);
  const [ratings, total] = await Promise.all([
    prisma.rating.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      select: { rating: true, updatedAt: true, food: { select: { id: true, foodCode: true, name: true, description: true, category: true, taste: true, origin: true, imageUrl: true, isActive: true } } }
    }),
    prisma.rating.count({ where: { userId } })
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pagination.pageSize));

  return (
    <Container className="py-10 sm:py-14">
      <PageHeader eyebrow="PREFERENSI SAYA" title="Rating Saya" description="Riwayat rating pribadi tersimpan pada akun kamu. Rating berikutnya akan memperbarui nilai untuk makanan yang sama." />
      <p className="mb-5 text-sm text-secondary">{total} rating tersimpan</p>
      {ratings.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{ratings.map(({ food, rating }) => <FoodCard key={food.id} food={{ ...food, rating }} canRate={food.isActive} role="USER" />)}</div> : <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-border bg-white px-6 text-center"><div><Star className="mx-auto size-9 text-orange-300" aria-hidden="true" /><h2 className="mb-0 mt-3 text-lg font-bold text-gray-900">Belum ada rating</h2><p className="mb-0 mt-1 text-sm text-secondary">Beri rating pada makanan aktif untuk membangun profil selera.</p><Link href="/foods" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white hover:bg-primary-hover">Jelajahi makanan <ArrowRight size={15} aria-hidden="true" /></Link></div></div>}
      {totalPages > 1 && <nav aria-label="Pagination rating" className="mt-7 flex justify-end gap-2"><Link href={`/my-ratings?page=${Math.max(1, pagination.page - 1)}`} aria-disabled={pagination.page <= 1} className={`inline-flex min-h-10 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold ${pagination.page <= 1 ? "pointer-events-none text-gray-300" : "text-gray-700 hover:bg-gray-50"}`}><ArrowLeft size={14} aria-hidden="true" /> Sebelumnya</Link><Link href={`/my-ratings?page=${Math.min(totalPages, pagination.page + 1)}`} aria-disabled={pagination.page >= totalPages} className={`inline-flex min-h-10 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold ${pagination.page >= totalPages ? "pointer-events-none text-gray-300" : "text-gray-700 hover:bg-gray-50"}`}>Berikutnya <ArrowRight size={14} aria-hidden="true" /></Link></nav>}
    </Container>
  );
}
