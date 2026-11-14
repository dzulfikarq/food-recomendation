import Link from "next/link";
import { Image as ImageIcon, ArrowUpRight } from "lucide-react";
import { Badge, Card } from "@/components/ui";

export type RecommendationFood = {
  id: number;
  name: string;
  category: string | null;
  description: string | null;
  imageUrl: string | null;
};

export function RecommendationCard({ food, rank }: { food: RecommendationFood; rank: number }) {
  return <Link href={`/foods/${food.id}`} className="group flex h-full rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
    <Card className="flex h-full flex-1 flex-col overflow-hidden transition-shadow group-hover:shadow-md">
      <div className="grid h-44 place-items-center bg-gradient-to-br from-orange-50 via-amber-50 to-orange-100 sm:h-48">
        {food.imageUrl ? <img src={food.imageUrl} alt={food.name} className="size-full object-cover" loading="lazy" /> : <span className="flex flex-col items-center gap-3 text-center text-xs font-semibold text-orange-900/60"><span className="grid size-16 place-items-center rounded-2xl border border-orange-100 bg-white/80 text-orange-500 shadow-sm"><ImageIcon size={30} strokeWidth={1.5} aria-hidden="true" /></span>Foto belum tersedia</span>}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center justify-between gap-3"><Badge>Rank #{rank}</Badge><Badge className="bg-gray-100 text-gray-700 capitalize">{food.category ?? "Resep"}</Badge></div>
        <h2 className="mb-0 mt-3 flex min-h-14 items-start gap-2 text-lg font-bold tracking-tight text-gray-950"><span className="line-clamp-2 min-w-0 flex-1 capitalize">{food.name}</span><ArrowUpRight size={18} className="mt-1 shrink-0 text-gray-400 transition group-hover:text-primary" aria-hidden="true" /></h2>
        <p className="mb-0 mt-2 line-clamp-4 min-h-20 text-sm leading-5 text-secondary capitalize">{food.description || "Lihat detail makanan dan berikan rating."}</p>
        <span className="mt-auto inline-flex min-h-9 items-center pt-4 text-xs font-bold text-primary">Lihat detail makanan</span>
      </div>
    </Card>
  </Link>;
}
