import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Search, UtensilsCrossed } from "lucide-react";
import { Container, PageHeader, SelectField } from "@/components/ui";
import { FoodCard } from "@/components/foods/food-card";
import { getSession } from "@/lib/authz";
import { FOOD_CATEGORIES } from "@/lib/food/constants";
import { publicFoodQuerySchema } from "@/lib/food/schemas";
import { listPublicFoods } from "@/lib/food/service";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Jelajahi Makanan" };

function toSearchParams(input: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value) && value[0]) params.set(key, value[0]);
  }
  return params;
}

export default async function FoodsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toSearchParams(await searchParams);
  const query = publicFoodQuerySchema.safeParse(Object.fromEntries(params));
  const filters = query.success ? query.data : publicFoodQuerySchema.parse({});
  const session = await getSession();
  const userId = session?.user.role === "USER" ? Number(session.user.id) : null;
  const [catalog, ratingCounts] = await Promise.all([
    listPublicFoods(filters, userId),
    userId !== null ? Promise.all([
      prisma.food.count({ where: { isActive: true } }),
      prisma.rating.count({ where: { userId, food: { isActive: true } } })
    ]) : Promise.resolve(null)
  ]);
  const { foods, pagination } = catalog;
  const activeFoodCount = ratingCounts?.[0] ?? 0;
  const ratedFoodCount = Math.min(ratingCounts?.[1] ?? 0, activeFoodCount);
  const ratingProgress = activeFoodCount ? Math.round((ratedFoodCount / activeFoodCount) * 100) : 0;
  const ratings = userId && foods.length
    ? await prisma.rating.findMany({ where: { userId, foodId: { in: foods.map((food) => food.id) } }, select: { foodId: true, rating: true } })
    : [];
  const ratingsByFood = new Map(ratings.map(({ foodId, rating }) => [foodId, rating]));

  function pageHref(page: number) {
    const next = new URLSearchParams();
    if (filters.search) next.set("search", filters.search);
    if (filters.category) next.set("category", filters.category);
    if (filters.tag) next.set("tag", filters.tag);
    if (filters.ratingStatus !== "all") next.set("ratingStatus", filters.ratingStatus);
    if (filters.sort !== "newest") next.set("sort", filters.sort);
    next.set("page", String(page));
    return `/foods?${next.toString()}`;
  }

  return (
    <Container className="py-10 sm:py-14">
      <PageHeader eyebrow="JELAJAHI" title="Katalog Makanan" description="Temukan makanan yang menarik perhatianmu. Beri rating hanya pada makanan yang kamu kenal." />
      {!query.success && <p role="alert" className="mb-4 rounded-xl border border-orange-200 bg-soft px-4 py-3 text-sm text-orange-900">Filter tidak valid; menampilkan katalog terbaru.</p>}
      {userId !== null && <section aria-labelledby="rating-progress-title" className="mb-5 rounded-2xl border border-orange-100 bg-soft px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="rating-progress-title" className="mb-0 text-sm font-bold text-gray-900">Progres penilaian</h2>
            <p className="mb-0 mt-1 text-sm text-secondary">{activeFoodCount ? `${ratedFoodCount} dari ${activeFoodCount} makanan aktif dinilai` : "Belum ada makanan aktif untuk dinilai."}</p>
          </div>
          {activeFoodCount > 0 && <span className="text-sm font-bold text-orange-800">{ratingProgress}%</span>}
        </div>
        {activeFoodCount > 0 && <div role="progressbar" aria-label="Progres penilaian makanan aktif" aria-valuemin={0} aria-valuemax={activeFoodCount} aria-valuenow={ratedFoodCount} aria-valuetext={`${ratedFoodCount} dari ${activeFoodCount} makanan aktif dinilai`} className="mt-3 h-2 overflow-hidden rounded-full bg-white">
          <span className="block h-full rounded-full bg-primary" style={{ width: `${ratingProgress}%` }} />
        </div>}
        <p className="mb-0 mt-2 text-xs text-secondary">Ringkasan saja, bukan target. Nilai hanya makanan yang kamu kenal.</p>
      </section>}
      <form action="/foods" method="get" className="mb-6 grid gap-3 rounded-2xl border border-border bg-white p-4 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_170px_170px_190px_170px_auto] lg:items-end">
        <label className="space-y-1.5"><span className="block text-sm font-semibold text-gray-800">Cari makanan</span><span className="flex min-h-12 items-center gap-2 rounded-xl border border-border px-3"><Search size={16} className="text-gray-400" aria-hidden="true" /><input name="search" defaultValue={filters.search} maxLength={120} placeholder="Nama atau Food Code" className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none" /></span></label>
        <SelectField name="category" label="Kategori" defaultValue={filters.category ?? ""}><option value="">Semua kategori</option>{FOOD_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</SelectField>
        <label className="space-y-1.5"><span className="block text-sm font-semibold text-gray-800">Tag resep</span><input name="tag" defaultValue={filters.tag ?? ""} maxLength={80} placeholder="Contoh: easy" className="min-h-12 w-full rounded-xl border border-border px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-orange-100" /></label>
        {userId && <SelectField name="ratingStatus" label="Status rating" defaultValue={filters.ratingStatus}><option value="all">Semua makanan</option><option value="unrated">Belum dinilai</option><option value="rated">Sudah dinilai</option></SelectField>}
        <SelectField name="sort" label="Urutkan" defaultValue={filters.sort}><option value="newest">Terbaru</option><option value="oldest">Terlama</option><option value="name-asc">Nama A–Z</option><option value="name-desc">Nama Z–A</option></SelectField>
        <div className="flex gap-2"><button type="submit" className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white hover:bg-primary-hover"><Search size={16} aria-hidden="true" /> Cari</button>{(filters.search || filters.category || filters.tag || filters.ratingStatus !== "all" || filters.sort !== "newest") && <Link href="/foods" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50">Reset</Link>}</div>
      </form>

      <div className="mb-4 flex items-center justify-between"><p className="m-0 text-sm text-secondary">{pagination.total} makanan aktif</p><p className="m-0 text-xs text-secondary">Halaman {pagination.page}/{pagination.totalPages}</p></div>
      {foods.length ? <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3">{foods.map((food) => <FoodCard key={food.id} food={{ ...food, rating: ratingsByFood.get(food.id) ?? null }} canRate={session?.user.role === "USER"} role={session?.user.role ?? null} />)}</div> : <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-border bg-white px-6 text-center"><div><UtensilsCrossed className="mx-auto size-9 text-orange-300" aria-hidden="true" /><h2 className="mb-0 mt-3 text-lg font-bold text-gray-900">{pagination.total === 0 && !filters.search && !filters.category && !filters.tag && filters.ratingStatus === "all" ? "Belum ada makanan aktif" : "Tidak menemukan makanan"}</h2><p className="mb-0 mt-1 text-sm text-secondary">{pagination.total === 0 && !filters.search && !filters.category && !filters.tag && filters.ratingStatus === "all" ? "Katalog akan tampil setelah admin menambahkan makanan." : "Coba ubah kata pencarian atau filter. Kamu tidak perlu menilai makanan yang belum dikenal."}</p>{(filters.search || filters.category || filters.tag || filters.ratingStatus !== "all") && <Link href="/foods" className="mt-4 inline-flex min-h-10 items-center rounded-xl border border-border px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50">Hapus filter</Link>}</div></div>}

      {pagination.totalPages > 1 && <nav aria-label="Pagination katalog" className="mt-7 flex justify-end gap-2"><a href={pageHref(Math.max(1, pagination.page - 1))} aria-disabled={pagination.page <= 1} tabIndex={pagination.page <= 1 ? -1 : undefined} className={`inline-flex min-h-10 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold ${pagination.page <= 1 ? "pointer-events-none text-gray-300" : "text-gray-700 hover:bg-gray-50"}`}><ArrowLeft size={14} aria-hidden="true" /> Sebelumnya</a><a href={pageHref(Math.min(pagination.totalPages, pagination.page + 1))} aria-disabled={pagination.page >= pagination.totalPages} tabIndex={pagination.page >= pagination.totalPages ? -1 : undefined} className={`inline-flex min-h-10 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold ${pagination.page >= pagination.totalPages ? "pointer-events-none text-gray-300" : "text-gray-700 hover:bg-gray-50"}`}>Berikutnya <ArrowRight size={14} aria-hidden="true" /></a></nav>}
    </Container>
  );
}
