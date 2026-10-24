import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";
import { FOOD_CATEGORIES } from "@/lib/food/constants";
import { Button, SelectField } from "@/components/ui";

type Props = { search: string; status: string; category?: string; sort: string };

export function FoodListFilters({ search, status, category, sort }: Props) {
  return (
    <form action="/admin/foods" method="get" className="grid gap-3 rounded-2xl border border-border bg-white p-4 md:grid-cols-[minmax(220px,1.5fr)_repeat(3,minmax(145px,1fr))_auto_auto] md:items-end">
      <label className="space-y-1.5">
        <span className="block text-sm font-semibold text-gray-800">Cari makanan</span>
        <span className="flex min-h-12 items-center gap-2 rounded-xl border border-border px-3.5 focus-within:border-primary focus-within:ring-4 focus-within:ring-orange-100">
          <Search size={16} className="shrink-0 text-gray-400" aria-hidden="true" />
          <input name="search" defaultValue={search} maxLength={120} placeholder="Nama atau food code" className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-gray-400" />
        </span>
      </label>
      <SelectField name="status" label="Status" defaultValue={status}>
        <option value="all">Semua status</option><option value="active">Aktif</option><option value="inactive">Nonaktif</option>
      </SelectField>
      <SelectField name="category" label="Kategori" defaultValue={category ?? ""}>
        <option value="">Semua kategori</option>{FOOD_CATEGORIES.map((value) => <option value={value} key={value}>{value}</option>)}
      </SelectField>
      <SelectField name="sort" label="Urutkan" defaultValue={sort}>
        <option value="newest">Terbaru</option><option value="oldest">Terlama</option><option value="name-asc">Nama A–Z</option><option value="name-desc">Nama Z–A</option>
      </SelectField>
      <Button type="submit" className="min-h-12"><SlidersHorizontal size={16} aria-hidden="true" /> Filter</Button>
      <Link href="/admin/foods" className="inline-flex min-h-12 items-center justify-center rounded-xl px-3 text-sm font-semibold text-gray-600 hover:bg-gray-50">Reset</Link>
    </form>
  );
}
