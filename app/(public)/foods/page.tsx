import type { Metadata } from "next";
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
  const [{ foods, pagination }, session] = await Promise.all([listPublicFoods(filters), getSession()]);
  const userId = session?.user.role === "USER" ? Number(session.user.id) : null;
  const ratings = userId && foods.length
    ? await prisma.rating.findMany({ where: { userId, foodId: { in: foods.map((food) => food.id) } }, select: { foodId: true, rating: true } })
    : [];
  const ratingsByFood = new Map(ratings.map(({ foodId, rating }) => [foodId, rating]));

  function pageHref(page: number) {
    const next = new URLSearchParams();
    if (filters.search) next.set("search", filters.search);
    if (filters.category) next.set("category", filters.category);
    if (filters.sort !== "newest") next.set("sort", filters.sort);
    next.set("page", String(page));
    return `/foods?${next.toString()}`;
  }

  return (
    <Container className="py-10 sm:py-14">
      <PageHeader eyebrow="JELAJAHI" title="Katalog Makanan" description="Lihat katalog makanan yang aktif. Rating tersedia untuk pengguna yang sudah masuk sebagai USER." />
      {!query.success && <p role="alert" className="mb-4 rounded-xl border border-orange-200 bg-soft px-4 py-3 text-sm text-orange-900">Filter tidak valid; menampilkan katalog terbaru.</p>}
      <form action="/foods" method="get" className="mb-6 grid gap-3 rounded-2xl border border-border bg-white p-4 sm:grid-cols-[minmax(220px,1fr)_220px_180px_auto] sm:items-end">
        <label className="space-y-1.5"><span className="block text-sm font-semibold text-gray-800">Cari makanan</span><span className="flex min-h-12 items-center gap-2 rounded-xl border border-border px-3"><Search size={16} className="text-gray-400" aria-hidden="true" /><input name="search" defaultValue={filters.search} maxLength={120} placeholder="Nama atau Food Code" className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none" /></span></label>
        <SelectField name="category" label="Kategori" defaultValue={filters.category ?? ""}><option value="">Semua kategori</option>{FOOD_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</SelectField>
        <SelectField name="sort" label="Urutkan" defaultValue={filters.sort}><option value="newest">Terbaru</option><option value="oldest">Terlama</option><option value="name-asc">Nama A–Z</option><option value="name-desc">Nama Z–A</option></SelectField>
        <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white hover:bg-primary-hover"><Search size={16} aria-hidden="true" /> Cari</button>
      </form>

      <div className="mb-4 flex items-center justify-between"><p className="m-0 text-sm text-secondary">{pagination.total} makanan aktif</p><p className="m-0 text-xs text-secondary">Halaman {pagination.page}/{pagination.totalPages}</p></div>
      {foods.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{foods.map((food) => <FoodCard key={food.id} food={{ ...food, rating: ratingsByFood.get(food.id) ?? null }} canRate={session?.user.role === "USER"} role={session?.user.role ?? null} />)}</div> : <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-border bg-white px-6 text-center"><div><UtensilsCrossed className="mx-auto size-9 text-orange-300" aria-hidden="true" /><h2 className="mb-0 mt-3 text-lg font-bold text-gray-900">Belum ada makanan aktif</h2><p className="mb-0 mt-1 text-sm text-secondary">Katalog akan tampil setelah admin menambahkan makanan.</p></div></div>}

      {pagination.totalPages > 1 && <nav aria-label="Pagination katalog" className="mt-7 flex justify-end gap-2"><a href={pageHref(Math.max(1, pagination.page - 1))} aria-disabled={pagination.page <= 1} className={`inline-flex min-h-10 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold ${pagination.page <= 1 ? "pointer-events-none text-gray-300" : "text-gray-700 hover:bg-gray-50"}`}><ArrowLeft size={14} aria-hidden="true" /> Sebelumnya</a><a href={pageHref(Math.min(pagination.totalPages, pagination.page + 1))} aria-disabled={pagination.page >= pagination.totalPages} className={`inline-flex min-h-10 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold ${pagination.page >= pagination.totalPages ? "pointer-events-none text-gray-300" : "text-gray-700 hover:bg-gray-50"}`}>Berikutnya <ArrowRight size={14} aria-hidden="true" /></a></nav>}
    </Container>
  );
}
