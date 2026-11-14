import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock3, Image as ImageIcon, MapPin, Sparkles, Star } from "lucide-react";
import { FoodRatingControl } from "@/components/foods/food-rating-control";
import { Badge, Container } from "@/components/ui";
import { getSession } from "@/lib/authz";
import { parseFoodId } from "@/lib/food/http";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

const nutritionLabels = ["Kalori", "Lemak total (%DV)", "Gula (%DV)", "Natrium (%DV)", "Protein (%DV)", "Lemak jenuh (%DV)", "Karbohidrat (%DV)"];

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function numbers(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number" && Number.isFinite(item)) : [];
}

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
    prisma.food.findFirst({ where: { id, isActive: true }, select: {
      id: true, name: true, description: true, category: true, taste: true, origin: true, imageUrl: true,
      sourceDataset: true, sourceId: true, sourceVersion: true, minutes: true, submittedAt: true, nSteps: true, nIngredients: true,
      tags: true, nutrition: true, steps: true, ingredients: true
    } }),
    getSession()
  ]);
  if (!food) notFound();
  const userId = session?.user.role === "USER" ? Number(session.user.id) : null;
  const rating = userId ? await prisma.rating.findUnique({ where: { userId_foodId: { userId, foodId: food.id } }, select: { rating: true } }) : null;
  const tags = strings(food.tags);
  const ingredients = strings(food.ingredients);
  const steps = strings(food.steps);
  const nutrition = numbers(food.nutrition);

  return <Container className="py-8 sm:py-10">
    <Link href="/foods" className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-white px-4 text-sm font-semibold text-gray-600 transition hover:border-orange-200 hover:bg-orange-50 hover:text-primary"><ArrowLeft size={15} aria-hidden="true" /> Kembali ke katalog</Link>
    <article className="grid overflow-hidden rounded-3xl border border-border bg-white shadow-sm lg:grid-cols-2">
      <div className="grid min-h-72 place-items-center bg-gradient-to-br from-orange-50 via-amber-50 to-orange-100 sm:min-h-[28rem]">{food.imageUrl ? <img src={food.imageUrl} alt={food.name} className="size-full max-h-[560px] object-cover" /> : <div className="flex flex-col items-center gap-4 text-center text-sm font-semibold text-orange-900/60"><span className="grid size-20 place-items-center rounded-3xl border border-orange-100 bg-white/80 text-orange-500 shadow-sm"><ImageIcon size={38} strokeWidth={1.5} aria-hidden="true" /></span>Foto belum tersedia</div>}</div>
      <div className="flex min-w-0 flex-col p-6 sm:p-8 lg:p-9">
        <Badge className="w-fit capitalize">{food.category ?? "Resep"}</Badge>
        <h1 className="mb-0 mt-4 break-words text-3xl font-bold leading-tight tracking-tight text-gray-950 capitalize sm:text-4xl">{food.name}</h1>
        <p className="mb-0 mt-4 whitespace-pre-line text-sm leading-7 text-secondary capitalize">{food.description || "Deskripsi belum tersedia."}</p>
        {food.sourceDataset === "FOODCOM" && food.sourceId && <p className="mb-0 mt-4 rounded-xl bg-gray-50 px-3.5 py-2.5 text-xs leading-5 text-gray-600">Sumber <span className="font-semibold text-gray-800">Food.com</span> · Resep #{food.sourceId}{food.sourceVersion ? <> · <span className="capitalize">{food.sourceVersion}</span></> : ""}</p>}
        {(food.minutes || food.origin || food.taste || food.submittedAt) && <dl className="mb-0 mt-5 grid gap-2.5 sm:grid-cols-2">
          {food.minutes ? <div className="rounded-xl border border-orange-100/80 bg-orange-50/50 p-3"><dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500"><Clock3 size={14} aria-hidden="true" /> Waktu</dt><dd className="mb-0 mt-1 text-sm font-semibold text-gray-900">{food.minutes} menit</dd></div> : null}
          {food.origin ? <div className="rounded-xl border border-border bg-gray-50/70 p-3"><dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500"><MapPin size={14} aria-hidden="true" /> Asal</dt><dd className="mb-0 mt-1 text-sm font-semibold text-gray-900 capitalize">{food.origin}</dd></div> : null}
          {food.taste ? <div className="rounded-xl border border-border bg-gray-50/70 p-3"><dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500"><Sparkles size={14} aria-hidden="true" /> Rasa</dt><dd className="mb-0 mt-1 text-sm font-semibold text-gray-900 capitalize">{food.taste}</dd></div> : null}
          {food.submittedAt ? <div className="rounded-xl border border-border bg-gray-50/70 p-3"><dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500"><CalendarDays size={14} aria-hidden="true" /> Tanggal sumber</dt><dd className="mb-0 mt-1 text-sm font-semibold text-gray-900">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "UTC" }).format(food.submittedAt)}</dd></div> : null}
        </dl>}
        {tags.length > 0 && <div className="mt-5"><p className="mb-2 text-xs font-semibold text-gray-700">Tag resep</p><div className="flex flex-wrap gap-2" aria-label="Tag resep">{tags.slice(0, 12).map((tag) => <Badge key={tag} className="bg-orange-50 text-orange-900 capitalize">{tag}</Badge>)}</div></div>}
        <section className="mt-6 rounded-2xl border border-orange-100 bg-orange-50/40 p-4 sm:p-5"><h2 className="mb-1 flex items-center gap-2 text-base font-bold text-gray-900"><span className="grid size-8 place-items-center rounded-lg bg-white text-primary shadow-sm"><Star size={16} aria-hidden="true" /></span>Rating kamu</h2><FoodRatingControl foodId={food.id} foodName={food.name} currentRating={rating?.rating ?? null} canRate={session?.user.role === "USER"} role={session?.user.role ?? null} /></section>
      </div>
    </article>
    {(ingredients.length > 0 || steps.length > 0 || nutrition.length > 0) && <div className="mt-6 grid gap-5 lg:grid-cols-2">
      {ingredients.length > 0 && <section className="rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-7"><div className="mb-5 flex items-center justify-between gap-3"><h2 className="mb-0 text-lg font-bold text-gray-950">Bahan</h2><Badge>{ingredients.length} bahan</Badge></div><ul className="mb-0 grid list-none gap-2 p-0">{ingredients.map((ingredient, index) => <li key={`${index}-${ingredient}`} className="flex items-start gap-3 rounded-xl border border-border/70 bg-gray-50/60 px-3.5 py-3 text-sm leading-6 text-gray-700 capitalize"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />{ingredient}</li>)}</ul></section>}
      {steps.length > 0 && <section className="rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-7"><div className="mb-5 flex items-center justify-between gap-3"><h2 className="mb-0 text-lg font-bold text-gray-950">Langkah</h2><Badge>{steps.length} langkah</Badge></div><ol className="mb-0 grid list-none gap-3 p-0">{steps.map((step, index) => <li key={`${index}-${step}`} className="flex items-start gap-3 rounded-xl border border-border/70 bg-gray-50/60 px-3.5 py-3 text-sm leading-6 text-gray-700"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-orange-100 text-xs font-bold text-orange-800" aria-hidden="true">{index + 1}</span><span className="capitalize">{step}</span></li>)}</ol></section>}
      {nutrition.length > 0 && <section className="rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-7 lg:col-span-2"><h2 className="mb-2 text-lg font-bold text-gray-950">Informasi gizi sumber</h2><p className="mb-4 text-xs text-secondary">Nilai mengikuti format dataset Food.com; bukan saran medis.</p><dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{nutrition.slice(0, nutritionLabels.length).map((value, index) => <div key={nutritionLabels[index]} className="rounded-xl bg-gray-50 p-3"><dt className="text-xs text-secondary">{nutritionLabels[index]}</dt><dd className="mb-0 mt-1 font-semibold text-gray-900">{value}</dd></div>)}</dl></section>}
    </div>}
  </Container>;
}
