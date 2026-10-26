import Link from "next/link";
import { Image as ImageIcon, ArrowUpRight } from "lucide-react";
import { Badge, Card } from "@/components/ui";

export type RecommendationFood = {
  id: number;
  name: string;
  category: string;
  description: string | null;
  imageUrl: string | null;
};

export function RecommendationCard({ food, rank }: { food: RecommendationFood; rank: number }) {
  return <Link href={`/foods/${food.id}`} className="group block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
    <Card className="h-full overflow-hidden transition-shadow group-hover:shadow-md">
      <div className="grid h-48 place-items-center bg-soft">
        {food.imageUrl ? <img src={food.imageUrl} alt={food.name} className="size-full object-cover" loading="lazy" /> : <ImageIcon size={42} strokeWidth={1.3} className="text-orange-300" aria-hidden="true" />}
      </div>
      <div className="p-5">
        <div className="flex items-center justify-between gap-3"><Badge>Rank #{rank}</Badge><Badge className="bg-gray-100 text-gray-700">{food.category}</Badge></div>
        <h2 className="mb-0 mt-3 flex items-start justify-between gap-2 text-lg font-bold tracking-tight text-gray-950">{food.name}<ArrowUpRight size={18} className="mt-1 shrink-0 text-gray-400 transition group-hover:text-primary" aria-hidden="true" /></h2>
        <p className="mb-0 mt-2 min-h-10 text-sm leading-5 text-secondary">{food.description || "Lihat detail makanan dan berikan rating."}</p>
        <span className="mt-4 inline-flex text-xs font-bold text-primary">Lihat detail makanan</span>
      </div>
    </Card>
  </Link>;
}
