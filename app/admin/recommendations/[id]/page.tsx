import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PublishRecommendationBatch } from "@/components/admin/recommendations/publish-recommendation-batch";
import { RecommendationValidationReportView } from "@/components/admin/recommendations/validation-report";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/authz";
import { parseFoodId } from "@/lib/food/http";
import { prisma } from "@/lib/prisma";
import type { RecommendationValidationReport } from "@/lib/recommendations/types";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Detail Batch Rekomendasi" };

const statusLabel: Record<string, string> = { DRAFT: "Draft", VALIDATED: "Tervalidasi", PUBLISHED: "Diterbitkan", SUPERSEDED: "Digantikan" };

export default async function RecommendationBatchDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  await requireAdmin();
  const id = parseFoodId((await params).id);
  if (!id) notFound();
  const query = await searchParams;
  const rawPage = Number(query.page ?? 1);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 100_000) : 1;
  const pageSize = 50;
  const batch = await prisma.recommendationBatch.findUnique({
    where: { id },
    select: {
      id: true, status: true, datasetExportId: true, kNeighbors: true, topN: true, similarity: true, fileChecksum: true, filename: true,
      createdAt: true, publishedAt: true, validationReport: true,
      datasetExport: { select: { filename: true, fileChecksum: true, rowCount: true, createdAt: true } },
      admin: { select: { name: true } }, publishedBy: { select: { name: true } },
      _count: { select: { recommendations: true } }
    }
  });
  if (!batch) notFound();
  const [rows, total] = await Promise.all([
    prisma.recommendation.findMany({ where: { batchId: id }, orderBy: [{ userId: "asc" }, { rank: "asc" }], skip: (page - 1) * pageSize, take: pageSize, select: { userId: true, rank: true, foodId: true, user: { select: { name: true } }, food: { select: { name: true, category: true, isActive: true } } } }),
    prisma.recommendation.count({ where: { batchId: id } })
  ]);
  const report = batch.validationReport as unknown as RecommendationValidationReport | null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canPublish = batch.status === "VALIDATED" && Boolean(report && report.errors.length === 0 && report.summary.recommendationCount > 0);

  return <>
    <Link href="/admin/recommendations" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-primary"><ArrowLeft size={15} aria-hidden="true" /> Kembali ke pemrosesan rekomendasi</Link>
    <PageHeader eyebrow={`BATCH #${batch.id}`} title="Detail Batch Rekomendasi" description="File sumber, validasi, hasil preview, dan riwayat publikasi batch." />
    <Card className="mb-6 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
      <div><p className="m-0 text-xs text-secondary">Status</p><Badge className="mt-2">{statusLabel[batch.status] ?? batch.status}</Badge></div>
      <div><p className="m-0 text-xs text-secondary">Dataset</p><p className="mb-0 mt-1 font-semibold">#{batch.datasetExportId} · {batch.datasetExport.filename}</p><p className="m-0 text-xs text-secondary">{batch.datasetExport.rowCount} rating · {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(batch.datasetExport.createdAt)}</p></div>
      <div><p className="m-0 text-xs text-secondary">File impor / checksum</p><p className="mb-0 mt-1 font-semibold">{batch.filename ?? "File legacy"}</p><p className="m-0 break-all font-mono text-[10px] text-secondary">{batch.fileChecksum}</p></div>
      <div><p className="m-0 text-xs text-secondary">Parameter</p><p className="mb-0 mt-1 font-semibold">k={batch.kNeighbors} · Top-{batch.topN} · {batch.similarity}</p><p className="m-0 text-xs text-secondary">Diterima FoodRec {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(batch.createdAt)}; waktu proses Altair tidak direkam.</p></div>
      <div><p className="m-0 text-xs text-secondary">Diimpor oleh</p><p className="mb-0 mt-1 font-semibold">{batch.admin.name}</p></div>
      <div><p className="m-0 text-xs text-secondary">Dipublikasikan oleh</p><p className="mb-0 mt-1 font-semibold">{batch.publishedBy?.name ?? "—"}</p><p className="m-0 text-xs text-secondary">{batch.publishedAt ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(batch.publishedAt) : "Belum dipublikasikan"}</p></div>
      <div><p className="m-0 text-xs text-secondary">Rekomendasi tersimpan</p><p className="mb-0 mt-1 font-semibold">{report?.summary.recommendationCount ?? batch._count.recommendations}</p></div>
      <div className="flex items-center">{canPublish && <PublishRecommendationBatch batchId={batch.id} />}</div>
    </Card>
    {batch.status === "VALIDATED" && !canPublish && <div className="mb-6 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm leading-6 text-orange-900">Batch tidak dapat dipublikasikan karena laporan validasi kosong, memiliki kesalahan, atau tidak berisi rekomendasi.</div>}
    {report && <section className="mb-8"><h2 className="mb-4 text-lg font-bold">Laporan validasi</h2><RecommendationValidationReportView report={report} /></section>}
    {batch.status === "PUBLISHED" || batch.status === "SUPERSEDED" ? <section>
      <div className="mb-4 flex items-end justify-between"><div><h2 className="m-0 text-lg font-bold">Hasil batch</h2><p className="mb-0 mt-1 text-sm text-secondary">{total} rekomendasi tersimpan.</p></div><p className="m-0 text-xs text-secondary">Halaman {page}/{totalPages}</p></div>
      {rows.length ? <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Makanan</th><th className="px-4 py-3">Rank</th><th className="px-4 py-3">Status makanan</th></tr></thead><tbody className="divide-y divide-border">{rows.map((row) => <tr key={`${row.userId}-${row.rank}`}><td className="px-4 py-3">#{row.userId} · {row.user.name}</td><td className="px-4 py-3">#{row.foodId} · {row.food.name}<span className="block text-xs text-secondary">{row.food.category}</span></td><td className="px-4 py-3">{row.rank}</td><td className="px-4 py-3">{row.food.isActive ? "Aktif" : "Nonaktif · tidak tampil ke user"}</td></tr>)}</tbody></table></div></Card> : <Card className="px-5 py-8 text-center text-sm text-secondary">Batch ini tidak memiliki rekomendasi tersimpan.</Card>}
      {totalPages > 1 && <nav aria-label="Pagination hasil batch" className="mt-4 flex justify-end gap-2"><Link href={`/admin/recommendations/${id}?page=${Math.max(1, page - 1)}`} aria-disabled={page <= 1} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-gray-700">Sebelumnya</Link><Link href={`/admin/recommendations/${id}?page=${Math.min(totalPages, page + 1)}`} aria-disabled={page >= totalPages} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-gray-700">Berikutnya</Link></nav>}
    </section> : <p className="text-sm text-secondary">Batch yang belum dipublikasikan tidak memiliki rekomendasi aktif.</p>}
  </>;
}
