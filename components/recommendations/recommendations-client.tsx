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
    <PageHeader eyebrow="UNTUK KAMU" title="Rekomendasi Untukmu" description="Pilihan ini disusun dari pola rating dan diterbitkan oleh admin. Rating yang baru kamu simpan tidak langsung membuat rekomendasi baru." />
    {loading && <Card className="grid min-h-48 place-items-center text-sm text-secondary"><div role="status">Memuat rekomendasi…</div></Card>}
    {!loading && error && <Card className="grid min-h-56 place-items-center px-6 text-center"><div><p role="alert" className="m-0 text-sm text-red-700">{error}</p><Button type="button" variant="secondary" className="mt-4" onClick={() => void load()}><RefreshCw size={15} aria-hidden="true" /> Coba lagi</Button></div></Card>}
    {!loading && !error && data?.publishedAt && <p className="mb-5 text-sm text-secondary">Rekomendasi terakhir diperbarui pada {formattedDate(data.publishedAt)}.</p>}
    {!loading && !error && data?.status === "READY" && <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.recommendations.map(({ food, rank }) => <RecommendationCard key={food.id} food={food} rank={rank} />)}</div>
    </>}
    {!loading && !error && data?.status === "NO_RATINGS" && <EmptyState icon="rating" title="Mulai dari makanan yang kamu kenal" description="Belum ada rating tersimpan. Jelajahi katalog dan nilai makanan yang pernah kamu coba. Rekomendasi baru bisa muncul setelah admin memproses dan menerbitkan hasil." action="Jelajahi makanan" href="/foods" />}
    {!loading && !error && data?.status === "NO_BATCH" && <EmptyState icon="recommendation" title="Belum ada rekomendasi yang diterbitkan" description="Ratingmu tetap tersimpan. Belum ada hasil rekomendasi aktif; menyimpan rating tidak otomatis memulai pemrosesan." action="Lihat rating saya" href="/my-ratings" secondaryAction="Jelajahi makanan" secondaryHref="/foods" />}
    {!loading && !error && data?.status === "NOT_INCLUDED" && <EmptyState icon="recommendation" title="Belum ada hasil untuk akunmu" description="Akunmu tidak tercakup dalam batch rekomendasi aktif. Kamu bisa menjelajahi katalog sambil menunggu admin menerbitkan batch yang mencakup akunmu." action="Jelajahi makanan" href="/foods" secondaryAction="Lihat rating saya" secondaryHref="/my-ratings" />}
    {!loading && !error && data?.status === "ALL_RATED" && <EmptyState icon="rating" title="Semua rekomendasi sudah kamu nilai" description="Semua makanan aktif dalam daftar rekomendasi sudah kamu beri rating. Nilaimu tersimpan di Rating Saya." action="Lihat rating saya" href="/my-ratings" secondaryAction="Jelajahi makanan" secondaryHref="/foods" />}
    {!loading && !error && data?.status === "NO_AVAILABLE_FOODS" && <EmptyState icon="recommendation" title="Belum ada rekomendasi aktif untuk ditampilkan" description="Makanan dalam hasil terakhir sudah dinilai atau tidak lagi aktif. Kamu tetap bisa menjelajahi katalog makanan aktif." action="Jelajahi makanan" href="/foods" secondaryAction="Lihat rating saya" secondaryHref="/my-ratings" />}
  </Container>;
}

function EmptyState({ icon, title, description, action, href, secondaryAction, secondaryHref }: { icon: "rating" | "recommendation"; title: string; description: string; action?: string; href?: string; secondaryAction?: string; secondaryHref?: string }) {
  const Icon = icon === "rating" ? Star : Sparkles;
  return <Card className="grid min-h-64 place-items-center px-6 py-8 text-center"><div><Icon className="mx-auto size-9 text-orange-400" aria-hidden="true" /><h2 className="mb-0 mt-3 text-lg font-bold text-gray-900">{title}</h2><p className="mb-0 mt-1 max-w-xl text-sm leading-6 text-secondary">{description}</p><div className="mt-4 flex flex-wrap justify-center gap-2">{action && href && <Link href={href} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white hover:bg-primary-hover">{action}<ArrowRight size={15} aria-hidden="true" /></Link>}{secondaryAction && secondaryHref && <Link href={secondaryHref} className="inline-flex min-h-10 items-center rounded-xl border border-border bg-white px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50">{secondaryAction}</Link>}</div></div></Card>;
}
