import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BarChart3, Download, FileDown, Sparkles } from "lucide-react";
import { CreateDatasetExport } from "@/components/admin/ratings/create-dataset-export";
import { RecommendationImportForm } from "@/components/admin/recommendations/recommendation-import-form";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/authz";
import { RECOMMENDATION_HISTORY_PAGE_SIZE } from "@/lib/recommendations/constants";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Pemrosesan Rekomendasi" };

function formatDate(value: Date | null | undefined) {
  return value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(value) : "Belum ada";
}

function getReportSummary(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const summary = (value as { summary?: unknown }).summary;
  return summary && typeof summary === "object" && !Array.isArray(summary) ? summary as { recommendationCount?: number; userCount?: number } : null;
}

const statusLabel: Record<string, string> = { DRAFT: "Draft", VALIDATED: "Tervalidasi", PUBLISHED: "Published", SUPERSEDED: "Superseded" };
const statusClass: Record<string, string> = { DRAFT: "bg-gray-100 text-gray-700", VALIDATED: "bg-orange-100 text-orange-900", PUBLISHED: "bg-green-100 text-green-800", SUPERSEDED: "bg-gray-100 text-gray-500" };

export default async function AdminRecommendationsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const rawPage = Number(params.page ?? 1);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 100_000) : 1;
  const skip = (page - 1) * RECOMMENDATION_HISTORY_PAGE_SIZE;
  const [ratedUsers, activeRatingCount, ratedFoods, ratingCount, datasets, activeBatch, latestPublication, batches, batchCount] = await Promise.all([
    prisma.rating.groupBy({ by: ["userId"] }),
    prisma.rating.count({ where: { food: { isActive: true } } }),
    prisma.rating.groupBy({ by: ["foodId"] }),
    prisma.rating.count(),
    prisma.datasetExport.findMany({ orderBy: { createdAt: "desc" }, take: 50, select: { id: true, filename: true, fileChecksum: true, rowCount: true, createdAt: true } }),
    prisma.recommendationBatch.findFirst({ where: { status: "PUBLISHED" }, orderBy: [{ publishedAt: "desc" }, { id: "desc" }], select: { id: true, datasetExport: { select: { filename: true } }, publishedAt: true } }),
    prisma.recommendationBatch.findFirst({ where: { publishedAt: { not: null } }, orderBy: [{ publishedAt: "desc" }, { id: "desc" }], select: { publishedAt: true } }),
    prisma.recommendationBatch.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take: RECOMMENDATION_HISTORY_PAGE_SIZE,
      select: {
        id: true, status: true, kNeighbors: true, topN: true, filename: true, fileChecksum: true, createdAt: true, publishedAt: true, validationReport: true,
        datasetExport: { select: { id: true, filename: true } }, admin: { select: { name: true } }, publishedBy: { select: { name: true } },
        _count: { select: { recommendations: true } }
      }
    }),
    prisma.recommendationBatch.count()
  ]);
  const totalPages = Math.max(1, Math.ceil(batchCount / RECOMMENDATION_HISTORY_PAGE_SIZE));

  return <>
    <PageHeader eyebrow="ALTair CSV WORKFLOW" title="Pemrosesan Rekomendasi" description="Ekspor snapshot rating, proses manual di Altair AI Studio Educational 2026.1.1, validasi CSV, lalu publikasikan hasil batch." />

    <section aria-labelledby="dataset-summary-title">
      <h2 id="dataset-summary-title" className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-950"><BarChart3 size={18} className="text-primary" aria-hidden="true" /> Ringkasan Dataset</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Pengguna dengan rating" value={ratedUsers.length} />
        <SummaryCard label="Rating pada makanan aktif" value={activeRatingCount} />
        <SummaryCard label="Makanan pernah dinilai" value={ratedFoods.length} />
        <SummaryCard label="Batch aktif" value={activeBatch ? `#${activeBatch.id}` : "Belum ada"} detail={activeBatch?.datasetExport.filename} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <SummaryCard label="Ekspor rating terakhir" value={datasets[0]?.filename ?? "Belum ada"} detail={datasets[0] ? `${datasets[0].rowCount} baris · ${formatDate(datasets[0].createdAt)}` : undefined} />
        <SummaryCard label="Publikasi terakhir" value={formatDate(latestPublication?.publishedAt)} detail={activeBatch ? `Batch aktif #${activeBatch.id}` : "Riwayat batch tetap tersimpan"} />
      </div>
    </section>

    <section className="mt-9" aria-labelledby="rating-export-title">
      <h2 id="rating-export-title" className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-950"><FileDown size={18} className="text-primary" aria-hidden="true" /> Ekspor Rating</h2>
      <Card className="p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h3 className="m-0 text-base font-bold text-gray-950">Snapshot privat CSV</h3><p className="mb-0 mt-2 text-sm leading-6 text-secondary">Menggunakan ekspor snapshot existing dengan header `user_id,food_id,rating`, checksum SHA-256, dan histori immutable.</p></div>
          <CreateDatasetExport ratingCount={ratingCount} />
        </div>
        {datasets.length > 0 && <div className="mt-5 border-t border-border pt-4"><h3 className="mb-2 text-sm font-bold">Dataset sumber terbaru</h3><ul className="m-0 space-y-2 p-0">{datasets.slice(0, 5).map((dataset) => <li key={dataset.id} className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="text-gray-700">#{dataset.id} · {dataset.filename} · {dataset.rowCount} baris · {formatDate(dataset.createdAt)}</span><a href={`/api/admin/rating-datasets/${dataset.id}/download`} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"><Download size={13} aria-hidden="true" /> Unduh privat</a></li>)}</ul><Link href="/admin/ratings" className="mt-3 inline-block text-xs font-semibold text-primary hover:underline">Lihat seluruh riwayat ekspor</Link></div>}
      </Card>
    </section>

    <section className="mt-9" aria-labelledby="recommendation-import-title">
      <h2 id="recommendation-import-title" className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-950"><Sparkles size={18} className="text-primary" aria-hidden="true" /> Impor dan Validasi Hasil Altair</h2>
      <Card className="p-5 sm:p-7"><RecommendationImportForm datasets={datasets.map(({ id, filename, rowCount, createdAt }) => ({ id, filename, rowCount, createdAt: createdAt.toISOString() }))} /></Card>
    </section>

    <section className="mt-9" aria-labelledby="batch-history-title">
      <div className="mb-4 flex items-end justify-between gap-3"><div><h2 id="batch-history-title" className="m-0 text-lg font-bold text-gray-950">Riwayat Pemrosesan</h2><p className="mb-0 mt-1 text-sm text-secondary">{batchCount} batch · file dan hasil lama dipertahankan untuk audit.</p></div><p className="m-0 text-xs text-secondary">Halaman {page}/{totalPages}</p></div>
      {batches.length ? <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[1050px] border-collapse text-left text-sm"><thead className="bg-gray-50 text-[10px] font-bold uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3">Batch / Dataset</th><th className="px-4 py-3">Rekomendasi / User</th><th className="px-4 py-3">Parameter</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Impor / Publikasi</th><th className="px-4 py-3">Admin</th><th className="px-4 py-3 text-right">Detail</th></tr></thead><tbody className="divide-y divide-border">{batches.map((batch) => {
        const report = getReportSummary(batch.validationReport);
        const recommendationCount = report?.recommendationCount ?? batch._count.recommendations;
        return <tr key={batch.id}><td className="px-4 py-3"><p className="m-0 font-bold text-gray-900">#{batch.id} · {batch.filename ?? "CSV legacy"}</p><p className="m-0 mt-1 text-xs text-secondary">Dataset #{batch.datasetExport.id} · {batch.datasetExport.filename}</p><p className="m-0 mt-1 max-w-56 truncate font-mono text-[10px] text-gray-400" title={batch.fileChecksum}>{batch.fileChecksum}</p></td><td className="px-4 py-3">{recommendationCount} / {report?.userCount ?? "—"}</td><td className="px-4 py-3">k={batch.kNeighbors}<br /><span className="text-xs text-secondary">Top-{batch.topN} · COSINE</span></td><td className="px-4 py-3"><Badge className={statusClass[batch.status] ?? ""}>{statusLabel[batch.status] ?? batch.status}</Badge></td><td className="px-4 py-3 text-xs">{formatDate(batch.createdAt)}<br /><span className="text-secondary">{formatDate(batch.publishedAt)}</span></td><td className="px-4 py-3 text-xs">Impor: {batch.admin.name}<br /><span className="text-secondary">Publish: {batch.publishedBy?.name ?? "—"}</span></td><td className="px-4 py-3 text-right"><Link href={`/admin/recommendations/${batch.id}`} className="font-semibold text-primary hover:underline">Detail</Link></td></tr>;
      })}</tbody></table></div></Card> : <Card className="px-5 py-9 text-center text-sm text-secondary">Belum ada batch rekomendasi.</Card>}
      {totalPages > 1 && <nav aria-label="Pagination riwayat batch" className="mt-4 flex justify-end gap-2"><Link href={`/admin/recommendations?page=${Math.max(1, page - 1)}`} aria-disabled={page <= 1} className={`inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold ${page <= 1 ? "pointer-events-none text-gray-300" : "text-gray-700 hover:bg-gray-50"}`}><ArrowLeft size={13} aria-hidden="true" /> Sebelumnya</Link><Link href={`/admin/recommendations?page=${Math.min(totalPages, page + 1)}`} aria-disabled={page >= totalPages} className={`inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold ${page >= totalPages ? "pointer-events-none text-gray-300" : "text-gray-700 hover:bg-gray-50"}`}>Berikutnya <ArrowRight size={13} aria-hidden="true" /></Link></nav>}
    </section>
  </>;
}

function SummaryCard({ label, value, detail }: { label: string; value: string | number; detail?: string | null }) {
  return <Card className="p-4"><p className="m-0 text-xs font-medium text-secondary">{label}</p><p className="mb-0 mt-2 break-words text-xl font-bold tracking-tight text-gray-950">{value}</p>{detail && <p className="mb-0 mt-1 break-words text-xs text-secondary">{detail}</p>}</Card>;
}
