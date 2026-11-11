import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BarChart3, Download, FileDown, Search } from "lucide-react";
import { CreateDatasetExport } from "@/components/admin/ratings/create-dataset-export";
import { Badge, Card, PageHeader } from "@/components/ui";
import type { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Data Rating" };

const PAGE_SIZE = 20;

export default async function AdminRatingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const params = await searchParams;
  const value = (input: string | string[] | undefined) => Array.isArray(input) ? input[0] ?? "" : input ?? "";
  const search = value(params.search).trim().slice(0, 100);
  const rawPage = Number(value(params.page) || 1);
  const requestedPage = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 100_000) : 1;
  const where: Prisma.DatasetExportWhereInput = {};
  if (search) {
    const matches: Prisma.DatasetExportWhereInput[] = [{ filename: { contains: search, mode: "insensitive" } }];
    const id = Number(search);
    if (Number.isSafeInteger(id) && id > 0) matches.push({ id });
    where.OR = matches;
  }
  const [accountRatingCount, historicalRatingCount, exportCount] = await Promise.all([
    prisma.rating.count(),
    prisma.historicalRating.count({ where: { catalogImport: { isActive: true } } }),
    prisma.datasetExport.count({ where })
  ]);
  const ratingCount = accountRatingCount + historicalRatingCount;
  const totalPages = Math.max(1, Math.ceil(exportCount / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const exports = await prisma.datasetExport.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: { id: true, filename: true, fileChecksum: true, rowCount: true, createdAt: true }
  });
  function pageHref(targetPage: number) {
    const query = new URLSearchParams();
    if (search) query.set("search", search);
    query.set("page", String(targetPage));
    return `/admin/ratings?${query.toString()}`;
  }

  return (
    <>
      <PageHeader eyebrow="DATA RATING" title="Data Rating" description="Buat snapshot dataset rating untuk diproses manual di Altair AI Studio Educational 2026.1.1." />
      <Card className="p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="flex items-center gap-2"><span className="grid size-10 place-items-center rounded-xl bg-soft text-primary"><BarChart3 size={19} aria-hidden="true" /></span><h2 className="m-0 text-lg font-bold text-gray-950">Snapshot dataset</h2></div><p className="mb-0 mt-3 text-sm text-secondary">{ratingCount} rating · {accountRatingCount} akun FoodRec + {historicalRatingCount} historis Food.com. CSV memakai ID akun positif dan ID historis negatif; tanpa nama atau email.</p></div>
          <CreateDatasetExport ratingCount={ratingCount} />
        </div>
      </Card>

      <section className="mt-8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div className="flex items-center gap-2"><FileDown size={18} className="text-primary" aria-hidden="true" /><div><h2 className="m-0 text-lg font-bold text-gray-950">Riwayat Snapshot</h2><p className="mb-0 mt-1 text-xs text-secondary">{exportCount} snapshot ditemukan · halaman {page}/{totalPages}</p></div></div>
          <form action="/admin/ratings" method="get" className="flex w-full flex-wrap gap-2 sm:w-auto"><label className="sr-only" htmlFor="dataset-search">Cari snapshot berdasarkan ID atau nama file</label><input id="dataset-search" name="search" defaultValue={search} maxLength={100} placeholder="Cari ID atau nama file" className="min-h-10 min-w-0 flex-1 rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-orange-100 sm:w-64 sm:flex-none" /><button type="submit" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-white hover:bg-primary-hover"><Search size={15} aria-hidden="true" />Cari</button>{search && <Link href="/admin/ratings" className="inline-flex min-h-10 items-center rounded-lg border border-border bg-white px-3 text-sm font-semibold text-gray-700">Reset</Link>}</form>
        </div>
        {exports.length ? <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[640px] border-collapse text-left text-sm"><thead className="bg-gray-50 text-xs font-bold uppercase tracking-wide text-gray-500"><tr><th scope="col" className="px-5 py-3">Snapshot</th><th scope="col" className="px-4 py-3">Baris</th><th scope="col" className="px-4 py-3">Checksum</th><th scope="col" className="px-4 py-3">Dibuat</th><th scope="col" className="px-4 py-3 text-right">File</th></tr></thead><tbody className="divide-y divide-border">{exports.map((item) => <tr key={item.id}><td className="px-5 py-3"><p className="m-0 font-semibold text-gray-900">#{item.id} · {item.filename}</p><Badge className="mt-1 bg-gray-100 text-gray-600">Snapshot immutable</Badge></td><td className="px-4 py-3">{item.rowCount}</td><td className="px-4 py-3 font-mono text-xs text-gray-500" title={item.fileChecksum}>{item.fileChecksum.slice(0, 16)}…</td><td className="px-4 py-3 text-xs text-secondary">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(item.createdAt)}</td><td className="px-4 py-3 text-right"><a href={`/api/admin/rating-datasets/${item.id}/download`} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50"><Download size={14} aria-hidden="true" /> Unduh</a></td></tr>)}</tbody></table></div></Card> : <Card className="px-5 py-8 text-center text-sm text-secondary">{search ? "Tidak ada snapshot yang cocok dengan pencarian." : "Belum ada snapshot dataset rating."}</Card>}
        {totalPages > 1 && <nav aria-label="Pagination riwayat snapshot" className="mt-4 flex justify-end gap-2"><Link href={pageHref(Math.max(1, page - 1))} aria-disabled={page <= 1} tabIndex={page <= 1 ? -1 : undefined} className={`inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold ${page <= 1 ? "pointer-events-none text-gray-300" : "text-gray-700 hover:bg-gray-50"}`}><ArrowLeft size={13} aria-hidden="true" />Sebelumnya</Link><Link href={pageHref(Math.min(totalPages, page + 1))} aria-disabled={page >= totalPages} tabIndex={page >= totalPages ? -1 : undefined} className={`inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold ${page >= totalPages ? "pointer-events-none text-gray-300" : "text-gray-700 hover:bg-gray-50"}`}>Berikutnya<ArrowRight size={13} aria-hidden="true" /></Link></nav>}
      </section>
      <p className="mt-5 text-xs leading-5 text-secondary">Setiap snapshot mempertahankan checksum dan metadata; export baru tidak mengubah file snapshot sebelumnya. File berada pada storage privat server.</p>
    </>
  );
}
