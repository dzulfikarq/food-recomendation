import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Image as ImageIcon, MapPin } from "lucide-react";
import { FoodRatingControl } from "@/components/foods/food-rating-control";
import { Badge, Container } from "@/components/ui";
import { getSession } from "@/lib/authz";
import { parseFoodId } from "@/lib/food/http";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const id = parseFoodId((await params).id);
  if (!id) return { title: "Makanan tidak ditemukan" };
  const food = await prisma.food.findFirst({ where: { id, isActive: true }, select: { name: true } });
  return { title: food?.name ?? "Makanan tidak ditemukan" };
}

export default async function FoodDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = parseFoodId((await params).id);
  if (!id) notFound();
  const [food, session] = await Promise.all([
    prisma.food.findFirst({ where: { id, isActive: true }, select: { id: true, name: true, description: true, category: true, taste: true, origin: true, imageUrl: true } }),
    getSession()
  ]);
  if (!food) notFound();
  const userId = session?.user.role === "USER" ? Number(session.user.id) : null;
  const rating = userId ? await prisma.rating.findUnique({ where: { userId_foodId: { userId, foodId: food.id } }, select: { rating: true } }) : null;

  return <Container className="py-10 sm:py-14">
    <Link href="/foods" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-primary"><ArrowLeft size={15} aria-hidden="true" /> Kembali ke katalog</Link>
    <article className="grid overflow-hidden rounded-3xl border border-border bg-white shadow-sm lg:grid-cols-2">
      <div className="grid min-h-64 place-items-center bg-soft sm:min-h-96">{food.imageUrl ? <img src={food.imageUrl} alt={food.name} className="size-full max-h-[560px] object-cover" /> : <ImageIcon size={54} strokeWidth={1.2} className="text-orange-300" aria-hidden="true" />}</div>
      <div className="flex flex-col p-6 sm:p-9"><Badge className="w-fit">{food.category}</Badge><h1 className="mb-0 mt-4 text-3xl font-bold tracking-tight text-gray-950">{food.name}</h1><p className="mb-0 mt-4 text-sm leading-7 text-secondary">{food.description || `${food.taste} · ${food.origin}`}</p><p className="mb-0 mt-5 flex items-center gap-2 text-sm text-gray-600"><MapPin size={16} aria-hidden="true" />{food.origin}<span className="text-gray-300">·</span>{food.taste}</p><div className="mt-auto border-t border-border pt-6"><h2 className="mb-3 text-base font-bold text-gray-900">Rating kamu</h2><FoodRatingControl foodId={food.id} foodName={food.name} currentRating={rating?.rating ?? null} canRate={session?.user.role === "USER"} role={session?.user.role ?? null} /></div></div>
    </article>
  </Container>;
}
