import { Image as ImageIcon, MapPin } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { FoodRatingControl } from "@/components/foods/food-rating-control";

export type PublicFoodCardData = {
  id: number;
  foodCode: string;
  name: string;
  description: string | null;
  category: string;
  taste: string;
  origin: string;
  imageUrl: string | null;
  isActive?: boolean;
  rating?: number | null;
};

export function FoodCard({ food, canRate, role }: { food: PublicFoodCardData; canRate: boolean; role: "USER" | "ADMIN" | null }) {
  return (
    <Card className="overflow-hidden">
      <div className="grid h-44 place-items-center bg-soft sm:h-48">
        {food.imageUrl ? <img src={food.imageUrl} alt={food.name} className="size-full object-cover" loading="lazy" /> : <ImageIcon size={42} strokeWidth={1.3} className="text-orange-300" aria-hidden="true" />}
      </div>
      <div className="p-5">
        <div className="flex items-center justify-between gap-3"><Badge>{food.category}</Badge>{food.isActive === false && <Badge className="bg-gray-100 text-gray-600">Nonaktif</Badge>}</div>
        <h2 className="mb-0 mt-3 text-lg font-bold tracking-tight text-gray-950">{food.name}</h2>
        <p className="mb-0 mt-2 min-h-10 text-sm leading-5 text-secondary">{food.description || `${food.taste} · ${food.origin}`}</p>
        <p className="mb-0 mt-3 flex items-center gap-1.5 text-xs text-gray-500"><MapPin size={14} aria-hidden="true" />{food.origin}<span className="mx-1 text-gray-300">·</span>{food.taste}</p>
        {food.isActive === false ? <div className="mt-4 border-t border-border pt-4"><p className="mb-1 text-xs font-semibold text-gray-700">Rating kamu: {food.rating ?? "Belum ada"}{food.rating ? "/5" : ""}</p><p className="mb-0 text-xs text-secondary">Makanan nonaktif; rating tidak dapat diubah.</p></div> : <div className="mt-4"><FoodRatingControl foodId={food.id} foodName={food.name} currentRating={food.rating ?? null} canRate={canRate} role={role} /></div>}
      </div>
    </Card>
  );
}
