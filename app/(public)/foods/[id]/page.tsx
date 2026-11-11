import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Image as ImageIcon } from "lucide-react";
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

  return <Container className="py-10 sm:py-14">
    <Link href="/foods" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-primary"><ArrowLeft size={15} aria-hidden="true" /> Kembali ke katalog</Link>
    <article className="grid overflow-hidden rounded-3xl border border-border bg-white shadow-sm lg:grid-cols-2">
      <div className="grid min-h-64 place-items-center bg-gradient-to-br from-orange-50 via-amber-50 to-orange-100 sm:min-h-96">{food.imageUrl ? <img src={food.imageUrl} alt={food.name} className="size-full max-h-[560px] object-cover" /> : <div className="flex flex-col items-center gap-4 text-center text-sm font-semibold text-orange-900/60"><span className="grid size-20 place-items-center rounded-3xl border border-orange-100 bg-white/80 text-orange-500 shadow-sm"><ImageIcon size={38} strokeWidth={1.5} aria-hidden="true" /></span>Foto belum tersedia</div>}</div>
        <div className="flex flex-col p-6 sm:p-9"><Badge className="w-fit">{food.category ?? "Resep"}</Badge><h1 className="mb-0 mt-4 text-3xl font-bold tracking-tight text-gray-950">{food.name}</h1><p className="mb-0 mt-4 whitespace-pre-line text-sm leading-7 text-secondary">{food.description || "Deskripsi belum tersedia."}</p>{food.sourceDataset === "FOODCOM" && food.sourceId && <p className="mb-0 mt-3 text-xs text-gray-500">Sumber Food.com · Resep #{food.sourceId}{food.sourceVersion ? ` · ${food.sourceVersion}` : ""}</p>}
        {(food.minutes || food.origin || food.taste || food.submittedAt) && <dl className="mb-0 mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-600">{food.minutes ? <div><dt className="inline font-semibold">Waktu: </dt><dd className="inline">{food.minutes} menit</dd></div> : null}{food.origin ? <div><dt className="inline font-semibold">Asal: </dt><dd className="inline">{food.origin}</dd></div> : null}{food.taste ? <div><dt className="inline font-semibold">Rasa: </dt><dd className="inline">{food.taste}</dd></div> : null}{food.submittedAt ? <div><dt className="inline font-semibold">Tanggal sumber: </dt><dd className="inline">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "UTC" }).format(food.submittedAt)}</dd></div> : null}</dl>}
        {tags.length > 0 && <div className="mt-4 flex flex-wrap gap-2" aria-label="Tag resep">{tags.slice(0, 12).map((tag) => <Badge key={tag} className="bg-orange-50 text-orange-900">{tag}</Badge>)}</div>}
        <div className="mt-auto border-t border-border pt-6"><h2 className="mb-3 text-base font-bold text-gray-900">Rating kamu</h2><FoodRatingControl foodId={food.id} foodName={food.name} currentRating={rating?.rating ?? null} canRate={session?.user.role === "USER"} role={session?.user.role ?? null} /></div>
      </div>
    </article>
    {(ingredients.length > 0 || steps.length > 0 || nutrition.length > 0) && <div className="mt-6 grid gap-5 lg:grid-cols-2">
      {ingredients.length > 0 && <section className="rounded-2xl border border-border bg-white p-5 sm:p-7"><h2 className="mb-3 text-lg font-bold text-gray-950">Bahan{food.nIngredients ? ` (${food.nIngredients})` : ""}</h2><ul className="mb-0 space-y-2 pl-5 text-sm leading-6 text-gray-700">{ingredients.map((ingredient, index) => <li key={`${index}-${ingredient}`}>{ingredient}</li>)}</ul></section>}
      {steps.length > 0 && <section className="rounded-2xl border border-border bg-white p-5 sm:p-7"><h2 className="mb-3 text-lg font-bold text-gray-950">Langkah{food.nSteps ? ` (${food.nSteps})` : ""}</h2><ol className="mb-0 space-y-3 pl-5 text-sm leading-6 text-gray-700">{steps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol></section>}
      {nutrition.length > 0 && <section className="rounded-2xl border border-border bg-white p-5 sm:p-7 lg:col-span-2"><h2 className="mb-2 text-lg font-bold text-gray-950">Informasi gizi sumber</h2><p className="mb-4 text-xs text-secondary">Nilai mengikuti format dataset Food.com; bukan saran medis.</p><dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{nutrition.slice(0, nutritionLabels.length).map((value, index) => <div key={nutritionLabels[index]} className="rounded-xl bg-gray-50 p-3"><dt className="text-xs text-secondary">{nutritionLabels[index]}</dt><dd className="mb-0 mt-1 font-semibold text-gray-900">{value}</dd></div>)}</dl></section>}
    </div>}
  </Container>;
}
