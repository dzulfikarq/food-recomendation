"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw, Sparkles, Star } from "lucide-react";
import { Button, Card, Container, PageHeader } from "@/components/ui";
import { RecommendationCard, type RecommendationFood } from "@/components/recommendations/recommendation-card";

type RecommendationResponse = {
  status: "NO_RATINGS" | "NO_BATCH" | "NOT_INCLUDED" | "ALL_RATED" | "NO_AVAILABLE_FOODS" | "READY";
  publishedAt: string | null;
  recommendations: { rank: number; food: RecommendationFood }[];
};

function formattedDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short" }).format(new Date(value));
}

export function RecommendationsClient() {
  const [data, setData] = useState<RecommendationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/me/recommendations", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Rekomendasi tidak dapat dimuat.");
      setData(result.data as RecommendationResponse);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Rekomendasi tidak dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  return <Container className="py-10 sm:py-14">
    <PageHeader eyebrow="UNTUK KAMU" title="Rekomendasi Makanan" description="Hasil rekomendasi diproses manual di Altair dari snapshot rating. Website tidak menghitung ulang algoritme." />
    {loading && <Card className="grid min-h-48 place-items-center text-sm text-secondary"><div role="status">Memuat rekomendasi…</div></Card>}
    {!loading && error && <Card className="grid min-h-56 place-items-center px-6 text-center"><div><p role="alert" className="m-0 text-sm text-red-700">{error}</p><Button type="button" variant="secondary" className="mt-4" onClick={() => void load()}><RefreshCw size={15} aria-hidden="true" /> Coba lagi</Button></div></Card>}
    {!loading && !error && data?.publishedAt && <p className="mb-5 text-sm text-secondary">Rekomendasi terakhir diperbarui pada {formattedDate(data.publishedAt)}.</p>}
    {!loading && !error && data?.status === "READY" && <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.recommendations.map(({ food, rank }) => <RecommendationCard key={food.id} food={food} rank={rank} />)}</div>
    </>}
    {!loading && !error && data?.status === "NO_RATINGS" && <EmptyState icon="rating" title="Mulai dari rating makanan" description="Beri rating pada makanan aktif. Rekomendasi akan tersedia setelah pemrosesan dataset dipublikasikan." action="Jelajahi makanan" href="/foods" />}
    {!loading && !error && data?.status === "NO_BATCH" && <EmptyState icon="recommendation" title="Rekomendasi belum tersedia" description="Belum ada batch rekomendasi yang dipublikasikan. Silakan kembali setelah hasil pemrosesan tersedia." />}
    {!loading && !error && data?.status === "NOT_INCLUDED" && <EmptyState icon="recommendation" title="Belum ada hasil untuk akunmu" description="Akunmu belum tercantum pada batch rekomendasi yang aktif." action="Beri rating makanan" href="/foods" />}
    {!loading && !error && data?.status === "ALL_RATED" && <EmptyState icon="rating" title="Semua rekomendasi sudah kamu nilai" description="Terima kasih. Rekomendasi yang sudah dinilai tidak ditampilkan lagi." action="Lihat rating saya" href="/my-ratings" />}
    {!loading && !error && data?.status === "NO_AVAILABLE_FOODS" && <EmptyState icon="recommendation" title="Belum ada rekomendasi aktif" description="Hasil yang tersisa sudah dinilai atau makanannya tidak lagi aktif." action="Jelajahi makanan" href="/foods" />}
  </Container>;
}

function EmptyState({ icon, title, description, action, href }: { icon: "rating" | "recommendation"; title: string; description: string; action?: string; href?: string }) {
  const Icon = icon === "rating" ? Star : Sparkles;
  return <Card className="grid min-h-64 place-items-center px-6 text-center"><div><Icon className="mx-auto size-9 text-orange-400" aria-hidden="true" /><h2 className="mb-0 mt-3 text-lg font-bold text-gray-900">{title}</h2><p className="mb-0 mt-1 max-w-lg text-sm leading-6 text-secondary">{description}</p>{action && href && <Link href={href} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white hover:bg-primary-hover">{action}<ArrowRight size={15} aria-hidden="true" /></Link>}</div></Card>;
}
