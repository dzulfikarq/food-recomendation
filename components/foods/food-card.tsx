import { Image as ImageIcon, MapPin } from "lucide-react";
import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { FoodRatingControl } from "@/components/foods/food-rating-control";

export type PublicFoodCardData = {
  id: number;
  foodCode: string;
  name: string;
  description: string | null;
  category: string | null;
  taste: string | null;
  origin: string | null;
  imageUrl: string | null;
  minutes?: number | null;
  tags?: string[];
  isActive?: boolean;
  rating?: number | null;
};

export function FoodCard({ food, canRate, role }: { food: PublicFoodCardData; canRate: boolean; role: "USER" | "ADMIN" | null }) {
  return (
    <Card className="overflow-hidden">
      <div className="grid h-44 place-items-center bg-gradient-to-br from-orange-50 via-amber-50 to-orange-100 sm:h-48">
        <Link href={`/foods/${food.id}`} tabIndex={food.isActive === false ? -1 : undefined} aria-hidden={food.isActive === false ? true : undefined} className={`grid size-full place-items-center ${food.isActive === false ? "pointer-events-none" : "focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-primary"}`} aria-label={`Lihat detail ${food.name}`}>
          {food.imageUrl ? <img src={food.imageUrl} alt={food.name} className="size-full object-cover" loading="lazy" /> : <span className="flex flex-col items-center gap-3 text-center text-xs font-semibold text-orange-900/60"><span className="grid size-16 place-items-center rounded-2xl border border-orange-100 bg-white/80 text-orange-500 shadow-sm"><ImageIcon size={30} strokeWidth={1.5} aria-hidden="true" /></span>Foto belum tersedia</span>}
        </Link>
      </div>
      <div className="p-5">
        <div className="flex items-center justify-between gap-3"><Badge>{food.category ?? "Resep"}</Badge>{food.isActive === false && <Badge className="bg-gray-100 text-gray-600">Nonaktif</Badge>}</div>
        <h2 className="mb-0 mt-3 text-lg font-bold tracking-tight text-gray-950">{food.isActive === false ? food.name : <Link href={`/foods/${food.id}`} className="rounded-sm hover:text-primary focus-visible:outline-2 focus-visible:outline-primary">{food.name}</Link>}</h2>
        <p className="mb-0 mt-2 min-h-10 text-sm leading-5 text-secondary">{food.description || "Lihat bahan dan langkah resep."}</p>
        {(food.origin || food.taste || food.minutes) && <p className="mb-0 mt-3 flex items-center gap-1.5 text-xs text-gray-500">{food.origin && <><MapPin size={14} aria-hidden="true" />{food.origin}</>}{food.taste && <span>{food.origin ? " · " : ""}{food.taste}</span>}{food.minutes ? <span>{food.origin || food.taste ? " · " : ""}{food.minutes} menit</span> : null}</p>}
        {food.tags && food.tags.length > 0 && <p className="mb-0 mt-3 line-clamp-1 text-xs text-gray-500">{food.tags.slice(0, 3).join(" · ")}</p>}
        {food.isActive === false ? <div className="mt-4 border-t border-border pt-4"><p className="mb-1 text-xs font-semibold text-gray-700">Rating kamu: {food.rating ?? "Belum ada"}{food.rating ? "/5" : ""}</p><p className="mb-0 text-xs text-secondary">Makanan nonaktif; rating tidak dapat diubah.</p></div> : <div className="mt-4"><FoodRatingControl foodId={food.id} foodName={food.name} currentRating={food.rating ?? null} canRate={canRate} role={role} /></div>}
        {food.isActive !== false && <Link href={`/foods/${food.id}`} className="mt-3 inline-flex min-h-9 items-center text-xs font-bold text-primary hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-primary">Lihat detail makanan →</Link>}
      </div>
    </Card>
  );
}
