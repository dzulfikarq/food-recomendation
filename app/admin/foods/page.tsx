import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CirclePlus, FileUp, Image as ImageIcon } from "lucide-react";
import { Alert, Badge, ButtonLink, Card, Container, PageHeader } from "@/components/ui";
import { FoodListFilters } from "@/components/admin/foods/food-list-filters";
import { FoodRowActions } from "@/components/admin/foods/food-row-actions";
import { foodListQuerySchema } from "@/lib/food/schemas";
import { listFoods } from "@/lib/food/service";

export const metadata: Metadata = { title: "Kelola Makanan" };

const notices: Record<string, string> = {
  created: "Makanan berhasil ditambahkan.",
  updated: "Perubahan makanan berhasil disimpan."
};

function toSearchParams(input: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value) && value[0]) params.set(key, value[0]);
  }
  return params;
}

export default async function FoodManagementPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toSearchParams(await searchParams);
  const parsed = foodListQuerySchema.safeParse(Object.fromEntries(params));
  const query = parsed.success ? parsed.data : foodListQuerySchema.parse({});
  const { foods, pagination, filters } = await listFoods(query);
  const notice = params.get("notice");
  const filtersApplied = Boolean(filters.search || filters.status !== "all" || filters.category);

  function pageHref(page: number) {
    const next = new URLSearchParams();
    if (filters.search) next.set("search", filters.search);
    if (filters.status !== "all") next.set("status", filters.status);
    if (filters.category) next.set("category", filters.category);
    if (filters.sort !== "newest") next.set("sort", filters.sort);
    next.set("page", String(page));
    return `/admin/foods?${next.toString()}`;
  }

  return (
    <Container className="!max-w-none !px-0">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader eyebrow="FOOD MANAGEMENT" title="Kelola Makanan" description="Kelola katalog makanan yang tersedia pada aplikasi FoodRec." />
        <div className="mb-8 flex flex-wrap gap-2">
          <ButtonLink href="/admin/foods/import" variant="secondary"><FileUp size={16} aria-hidden="true" /> Impor CSV</ButtonLink>
          <ButtonLink href="/admin/foods/new"><CirclePlus size={16} aria-hidden="true" /> Tambah Makanan</ButtonLink>
        </div>
      </div>

      {notice && notices[notice] && <Alert variant="info" className="mb-5">{notices[notice]}</Alert>}
      {!parsed.success && <Alert className="mb-5">Filter tidak valid. Menampilkan data terbaru.</Alert>}

      <FoodListFilters search={filters.search} status={filters.status} category={filters.category} sort={filters.sort} />

      <div className="mb-3 mt-6 flex items-center justify-between gap-3">
        <p className="m-0 text-sm text-secondary">{pagination.total} makanan ditemukan</p>
        <p className="m-0 hidden text-xs text-secondary sm:block">Halaman {pagination.page} dari {pagination.totalPages}</p>
      </div>

      {foods.length === 0 ? (
        <Card className="grid min-h-72 place-items-center p-8 text-center">
          <div><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-soft text-primary"><ImageIcon size={25} aria-hidden="true" /></span><h2 className="mb-0 mt-4 text-lg font-bold text-gray-950">{filtersApplied ? "Tidak ada makanan yang cocok" : "Katalog makanan masih kosong"}</h2><p className="mb-0 mt-2 max-w-sm text-sm leading-6 text-secondary">{filtersApplied ? "Ubah kata pencarian atau filter untuk melihat makanan lain." : "Tambahkan makanan pertama agar katalog tersedia untuk pengguna."}</p>{filtersApplied ? <Link href="/admin/foods" className="mt-5 inline-flex min-h-10 items-center font-semibold text-primary hover:underline">Hapus filter</Link> : <ButtonLink href="/admin/foods/new" className="mt-5"><CirclePlus size={16} aria-hidden="true" /> Tambah Makanan</ButtonLink>}</div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] border-collapse text-left">
              <thead className="bg-gray-50 text-xs font-bold uppercase tracking-wide text-gray-500">
                <tr><th className="px-5 py-4">Foto</th><th className="px-4 py-4">Food Code</th><th className="px-4 py-4">Nama Makanan</th><th className="px-4 py-4">Kategori</th><th className="px-4 py-4">Status</th><th className="px-4 py-4">Dibuat</th><th className="px-4 py-4 text-right">Aksi</th></tr>
              </thead>
              <tbody className="divide-y divide-border text-sm">
                {foods.map((food) => {
                  const hasHistory = Boolean(food.firstUsedAt || food._count.ratings || food._count.recommendations);
                  return (
                    <tr key={food.id} className="transition hover:bg-gray-50/70">
                      <td className="px-5 py-3"><div className="grid size-12 place-items-center overflow-hidden rounded-xl border border-border bg-soft">{food.imageUrl ? <img src={food.imageUrl} alt={food.name} className="size-full object-cover" /> : <ImageIcon size={19} className="text-orange-400" aria-hidden="true" />}</div></td>
                      <td className="px-4 py-3"><code className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">{food.foodCode}</code></td>
                      <td className="max-w-64 px-4 py-3"><p className="m-0 truncate font-semibold text-gray-900">{food.name}</p><p className="m-0 mt-1 truncate text-xs text-secondary">{food.origin}</p></td>
                      <td className="px-4 py-3 text-gray-700">{food.category}</td>
                      <td className="px-4 py-3"><Badge className={food.isActive ? "bg-green-50 text-green-800" : "bg-gray-100 text-gray-600"}>{food.isActive ? "Aktif" : "Nonaktif"}</Badge></td>
                      <td className="px-4 py-3 text-xs text-secondary">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(food.createdAt)}</td>
                      <td className="px-4 py-3 text-right"><FoodRowActions id={food.id} name={food.name} isActive={food.isActive} hasHistory={hasHistory} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="m-0 text-xs text-secondary">Menampilkan {foods.length} dari {pagination.total} makanan · maksimum {pagination.pageSize} per halaman</p>
            <div className="flex items-center justify-end gap-2">
              <Link aria-disabled={pagination.page <= 1} href={pageHref(Math.max(1, pagination.page - 1))} className={`inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold ${pagination.page <= 1 ? "pointer-events-none text-gray-300" : "text-gray-700 hover:bg-gray-50"}`}><ArrowLeft size={14} aria-hidden="true" /> Sebelumnya</Link>
              <span className="px-2 text-xs text-secondary">{pagination.page}/{pagination.totalPages}</span>
              <Link aria-disabled={pagination.page >= pagination.totalPages} href={pageHref(Math.min(pagination.totalPages, pagination.page + 1))} className={`inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold ${pagination.page >= pagination.totalPages ? "pointer-events-none text-gray-300" : "text-gray-700 hover:bg-gray-50"}`}>Berikutnya <ArrowRight size={14} aria-hidden="true" /></Link>
            </div>
          </div>
        </Card>
      )}
    </Container>
  );
}
