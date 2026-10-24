import type { Metadata } from "next";
import { BarChart3, Download, FileDown } from "lucide-react";
import { CreateDatasetExport } from "@/components/admin/ratings/create-dataset-export";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Data Rating" };

export default async function AdminRatingsPage() {
  await requireAdmin();
  const [ratingCount, exports] = await Promise.all([
    prisma.rating.count(),
    prisma.datasetExport.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, filename: true, fileChecksum: true, rowCount: true, createdAt: true }
    })
  ]);

  return (
    <>
      <PageHeader eyebrow="DATA RATING" title="Data Rating" description="Buat snapshot dataset rating untuk diproses manual di Altair AI Studio Educational 2026.1.1." />
      <Card className="p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="flex items-center gap-2"><span className="grid size-10 place-items-center rounded-xl bg-soft text-primary"><BarChart3 size={19} aria-hidden="true" /></span><h2 className="m-0 text-lg font-bold text-gray-950">Snapshot dataset</h2></div><p className="mb-0 mt-3 text-sm text-secondary">{ratingCount} rating tersimpan pada PostgreSQL. CSV hanya memuat `user_id`, `food_id`, dan `rating`—tanpa informasi personal.</p></div>
          <CreateDatasetExport ratingCount={ratingCount} />
        </div>
      </Card>

      <section className="mt-8">
        <div className="mb-4 flex items-center gap-2"><FileDown size={18} className="text-primary" aria-hidden="true" /><h2 className="m-0 text-lg font-bold text-gray-950">Riwayat Export</h2></div>
        {exports.length ? <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[640px] border-collapse text-left text-sm"><thead className="bg-gray-50 text-xs font-bold uppercase tracking-wide text-gray-500"><tr><th className="px-5 py-3">Snapshot</th><th className="px-4 py-3">Baris</th><th className="px-4 py-3">Checksum</th><th className="px-4 py-3">Dibuat</th><th className="px-4 py-3 text-right">File</th></tr></thead><tbody className="divide-y divide-border">{exports.map((item) => <tr key={item.id}><td className="px-5 py-3"><p className="m-0 font-semibold text-gray-900">{item.filename}</p><Badge className="mt-1 bg-gray-100 text-gray-600">Snapshot immutable</Badge></td><td className="px-4 py-3">{item.rowCount}</td><td className="px-4 py-3 font-mono text-xs text-gray-500">{item.fileChecksum.slice(0, 16)}…</td><td className="px-4 py-3 text-xs text-secondary">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(item.createdAt)}</td><td className="px-4 py-3 text-right"><a href={`/api/admin/rating-datasets/${item.id}/download`} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50"><Download size={14} aria-hidden="true" /> Unduh</a></td></tr>)}</tbody></table></div></Card> : <Card className="px-5 py-8 text-center text-sm text-secondary">Belum ada snapshot dataset rating.</Card>}
      </section>
      <p className="mt-5 text-xs leading-5 text-secondary">Setiap snapshot mempertahankan checksum dan metadata; export baru tidak mengubah file snapshot sebelumnya. File berada pada storage privat server.</p>
    </>
  );
}
