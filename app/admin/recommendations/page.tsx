import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BarChart3, Check, Download, FileDown, Search } from "lucide-react";
import { CreateDatasetExport } from "@/components/admin/ratings/create-dataset-export";
import { RecommendationImportForm } from "@/components/admin/recommendations/recommendation-import-form";
import { PublishRecommendationBatch } from "@/components/admin/recommendations/publish-recommendation-batch";
import { RecommendationValidationReportView } from "@/components/admin/recommendations/validation-report";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import type { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/authz";
import { RECOMMENDATION_HISTORY_PAGE_SIZE } from "@/lib/recommendations/constants";
import type { RecommendationValidationReport } from "@/lib/recommendations/types";
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

const statusLabel: Record<string, string> = { DRAFT: "Draft", VALIDATED: "Tervalidasi", PUBLISHED: "Diterbitkan", SUPERSEDED: "Digantikan" };
const statusClass: Record<string, string> = { DRAFT: "bg-red-50 text-red-800", VALIDATED: "bg-orange-100 text-orange-900", PUBLISHED: "bg-green-50 text-green-800", SUPERSEDED: "bg-gray-100 text-gray-600" };
const batchStatuses = ["DRAFT", "VALIDATED", "PUBLISHED", "SUPERSEDED"] as const;

export default async function AdminRecommendationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const params = await searchParams;
  const queryValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
  const rawPage = Number(queryValue(params.page) || 1);
  const requestedPage = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 100_000) : 1;
  const status = batchStatuses.find((item) => item === queryValue(params.status));
  const search = queryValue(params.search).trim().slice(0, 100);
  const where: Prisma.RecommendationBatchWhereInput = {};
  if (status) where.status = status;
  if (search) {
    const searchFilters: Prisma.RecommendationBatchWhereInput[] = [
      { filename: { contains: search, mode: "insensitive" } },
      { datasetExport: { filename: { contains: search, mode: "insensitive" } } }
    ];
    const batchId = Number(search);
    if (Number.isSafeInteger(batchId) && batchId > 0) searchFilters.push({ id: batchId });
    where.OR = searchFilters;
  }
  const [ratedUsers, activeRatingCount, ratedFoods, ratingCount, activeFoodCount, userCount, activeRatingsByUser, datasets, datasetCount, activeBatch, latestBatch, latestRating] = await Promise.all([
    prisma.rating.groupBy({ by: ["userId"], where: { user: { role: "USER" } } }),
    prisma.rating.count({ where: { food: { isActive: true } } }),
    prisma.rating.groupBy({ by: ["foodId"] }),
    prisma.rating.count(),
    prisma.food.count({ where: { isActive: true } }),
    prisma.user.count({ where: { role: "USER" } }),
    prisma.rating.groupBy({ by: ["userId"], where: { user: { role: "USER" }, food: { isActive: true } }, _count: { foodId: true } }),
    prisma.datasetExport.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50, select: { id: true, filename: true, fileChecksum: true, rowCount: true, createdAt: true } }),
    prisma.datasetExport.count(),
    prisma.recommendationBatch.findFirst({ where: { status: "PUBLISHED" }, orderBy: [{ publishedAt: "desc" }, { id: "desc" }], select: { id: true, datasetExport: { select: { filename: true } }, publishedAt: true } }),
    prisma.recommendationBatch.findFirst({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, status: true, kNeighbors: true, topN: true, filename: true, fileChecksum: true, createdAt: true, publishedAt: true, validationReport: true, datasetExport: { select: { id: true, filename: true } }, admin: { select: { name: true } }, publishedBy: { select: { name: true } }, _count: { select: { recommendations: true } } }
    }),
    prisma.rating.aggregate({ _max: { updatedAt: true } })
  ]);
  const latestDataset = datasets[0];
  const snapshotStale = Boolean(latestDataset && (latestDataset.rowCount !== ratingCount || (latestRating._max.updatedAt && latestRating._max.updatedAt > latestDataset.createdAt)));
  const datasetCountForCoverage = Math.ceil(activeFoodCount * 0.9);
  // ponytail: 90% marks "hampir seluruh"; use a study-defined threshold if protocol later defines one.
  const usersNearFullCatalog = activeRatingsByUser.filter(({ _count }) => activeFoodCount > 0 && _count.foodId >= datasetCountForCoverage).length;
  const nearCompleteCoverage = userCount > 0 && activeFoodCount > 0 && usersNearFullCatalog >= Math.ceil(userCount * 0.9);
  const batchCount = await prisma.recommendationBatch.count({ where });
  const totalPages = Math.max(1, Math.ceil(batchCount / RECOMMENDATION_HISTORY_PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const batches = await prisma.recommendationBatch.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * RECOMMENDATION_HISTORY_PAGE_SIZE,
    take: RECOMMENDATION_HISTORY_PAGE_SIZE,
    select: { id: true, status: true, kNeighbors: true, topN: true, filename: true, fileChecksum: true, createdAt: true, publishedAt: true, validationReport: true, datasetExport: { select: { id: true, filename: true } }, admin: { select: { name: true } }, publishedBy: { select: { name: true } }, _count: { select: { recommendations: true } } }
  });
  const latestReport = latestBatch?.validationReport as unknown as RecommendationValidationReport | null;
  const hasValidationErrors = Boolean(latestReport?.errors.length);
  const batchMatchesLatestDataset = Boolean(latestDataset && latestBatch?.datasetExport.id === latestDataset.id);
  const currentStep = !latestDataset || snapshotStale ? 1 : !batchMatchesLatestDataset ? 2 : latestBatch?.status === "DRAFT" ? 3 : 4;
  const stepOneStatus = latestDataset ? snapshotStale ? "Perlu snapshot baru" : "Snapshot tersedia" : ratingCount ? "Siap dibuat" : "Menunggu rating";
  const stepTwoStatus = batchMatchesLatestDataset ? "CSV hasil diimpor" : latestDataset ? "Menunggu CSV hasil" : "Menunggu snapshot";
  const stepThreeStatus = batchMatchesLatestDataset && latestBatch ? statusLabel[latestBatch.status] : latestDataset ? "Menunggu file hasil" : "Menunggu snapshot";
  const stepFourStatus = batchMatchesLatestDataset && latestBatch?.status === "VALIDATED" ? hasValidationErrors ? "Perlu validasi ulang" : "Siap dipublikasikan" : latestBatch?.status === "PUBLISHED" ? "Diterbitkan" : latestBatch?.status === "SUPERSEDED" ? "Digantikan" : activeBatch ? "Batch aktif tersedia" : "Menunggu hasil valid";
  const datasetIsComplete = Boolean(latestDataset && !snapshotStale);
  const resultHasBeenUploaded = batchMatchesLatestDataset;
  const resultIsValid = Boolean(resultHasBeenUploaded && latestBatch?.status !== "DRAFT" && latestReport && !hasValidationErrors && (latestReport.summary.recommendationCount ?? 0) > 0);
  const publicationIsComplete = Boolean(resultIsValid && (latestBatch?.status === "PUBLISHED" || latestBatch?.status === "SUPERSEDED"));
  const workflow = [
    { number: 1, title: "Siapkan dataset", status: stepOneStatus, complete: datasetIsComplete },
    { number: 2, title: "Proses di Altair", status: stepTwoStatus, complete: resultHasBeenUploaded },
    { number: 3, title: "Impor dan validasi", status: stepThreeStatus, complete: resultIsValid },
    { number: 4, title: "Tinjau dan publikasikan", status: stepFourStatus, complete: publicationIsComplete }
  ];

  function historyHref(targetPage: number) {
    const query = new URLSearchParams();
    if (search) query.set("search", search);
    if (status) query.set("status", status);
    query.set("page", String(targetPage));
    return `/admin/recommendations?${query.toString()}#batch-history-title`;
  }

  return <>
    <PageHeader eyebrow="PANDUAN ADMIN" title="Pemrosesan Rekomendasi" description="Ikuti empat tahap dari snapshot rating sampai rekomendasi diterbitkan. Perhitungan User-Based Collaborative Filtering dengan Cosine Similarity tetap dilakukan manual di Altair; FoodRec hanya mengelola CSV dan publikasi." />

    <nav aria-label="Tahap pemrosesan rekomendasi" className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {workflow.map((step) => {
        const current = step.number === currentStep;
        return <a key={step.number} href={`#step-${step.number}`} aria-current={current ? "step" : undefined} className={`flex min-h-20 items-start gap-2 rounded-xl border p-3 text-left transition-colors ${current ? "border-primary bg-orange-50" : step.complete ? "border-green-200 bg-green-50/50" : "border-border bg-white hover:border-orange-200 hover:bg-soft"}`}>
          <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${step.complete ? "bg-green-700 text-white" : current ? "bg-primary text-white" : "bg-gray-100 text-gray-600"}`}>{step.complete ? <Check size={15} aria-hidden="true" /> : step.number}</span>
          <span className="min-w-0"><span className="block text-xs font-bold text-gray-900">{step.title}</span><span className="mt-1 block text-[11px] leading-4 text-secondary">{step.status}</span>{current && <span className="mt-1 block text-[10px] font-bold uppercase tracking-wide text-primary">Tahap saat ini</span>}</span>
        </a>;
      })}
    </nav>

    <div className="space-y-5">
      <section id="step-1" aria-labelledby="step-1-title" className="scroll-mt-24">
        <WorkflowStep number="1" title="Siapkan Dataset" status={stepOneStatus} current={currentStep === 1} complete={datasetIsComplete} description="Dataset adalah salinan rating pada satu waktu. Snapshot privat ini menjaga agar proses dan hasil penelitian punya sumber data yang jelas." next="Unduh snapshot yang dipilih, lalu lanjutkan pemrosesan manual di Altair.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Pengguna dengan rating" value={ratedUsers.length} />
            <SummaryCard label="Makanan aktif" value={activeFoodCount} />
            <SummaryCard label="Total rating" value={ratingCount} />
            <SummaryCard label="Dataset ekspor" value={datasetCount} />
          </div>
          {nearCompleteCoverage && <Alert variant="info" className="leading-6">Sebagian besar pengguna sudah menilai hampir seluruh makanan aktif ({usersNearFullCatalog} dari {userCount} pengguna; tiap pengguna sudah menilai minimal 90% katalog). Kandidat yang belum dinilai bisa terbatas. Ini ringkasan kondisi data, bukan hasil algoritme.</Alert>}
          {snapshotStale && <Alert variant="info">Rating berubah setelah snapshot terakhir. Buat snapshot baru bila proses berikutnya perlu memakai data terkini; snapshot lama tetap tersedia untuk audit.</Alert>}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>{latestDataset ? <p className="m-0 text-sm text-secondary">Snapshot terakhir: <strong className="text-gray-900">#{latestDataset.id} · {latestDataset.filename}</strong><br />{latestDataset.rowCount} rating · {formatDate(latestDataset.createdAt)}</p> : <p className="m-0 text-sm text-secondary">{ratingCount ? "Belum ada snapshot. Buat satu untuk memulai." : "Belum ada rating yang bisa dimasukkan ke snapshot."}</p>}</div>
            <div className="flex flex-wrap items-center gap-2"><CreateDatasetExport ratingCount={ratingCount} />{latestDataset && <a href={`/api/admin/rating-datasets/${latestDataset.id}/download`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50"><Download size={15} aria-hidden="true" />Unduh dataset</a>}</div>
          </div>
          {datasets.length > 0 && <details className="rounded-xl border border-border bg-gray-50">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-800 focus-visible:outline-2 focus-visible:outline-primary">Snapshot tersedia · {datasetCount} tersimpan (menampilkan 50 terbaru)</summary>
            <ul className="m-0 max-h-64 list-none space-y-2 overflow-auto border-t border-border p-3">{datasets.map((dataset) => <li key={dataset.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs"><span className="text-gray-700">#{dataset.id} · {dataset.filename} · {dataset.rowCount} rating · {formatDate(dataset.createdAt)}</span><a href={`/api/admin/rating-datasets/${dataset.id}/download`} className="inline-flex min-h-8 items-center gap-1 font-semibold text-primary hover:underline"><Download size={13} aria-hidden="true" />Unduh</a></li>)}</ul>
            <p className="m-0 border-t border-border px-3 py-2 text-xs text-secondary">Pilih snapshot sumber saat mengimpor CSV pada tahap 3. <Link href="/admin/ratings" className="font-semibold text-primary underline">Buka semua Data Rating</Link>.</p>
          </details>}
        </WorkflowStep>
      </section>

      <section id="step-2" aria-labelledby="step-2-title" className="scroll-mt-24">
        <WorkflowStep number="2" title="Proses di Altair" status={stepTwoStatus} current={currentStep === 2} complete={resultHasBeenUploaded} description="Tahap ini dilakukan di aplikasi Altair, di luar FoodRec. FoodRec tidak menjalankan algoritme dan tidak dapat memastikan proses eksternal selesai sampai file hasil diunggah." next="Ekspor file hasil, lalu kembali dan unggah pada tahap 3.">
          <ol className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
            {[
              "Unduh CSV snapshot dari tahap 1.",
              "Buka Altair AI Studio dan impor dataset rating.",
              "Periksa kolom input: user_id, food_id, rating. File tidak memuat nama atau email.",
              "Jalankan User-Based Collaborative Filtering dengan Cosine Similarity dan user k-NN sesuai protokol penelitian.",
              "Ekspor hasil dengan header persis user_id,item_id,rank; item_id harus memakai Food.id.",
              "Catat nilai k dan Top-N yang benar-benar dipakai, lalu kembali ke FoodRec."
            ].map((instruction, index) => <li key={instruction} className="flex gap-3 rounded-xl border border-border bg-white p-3 text-sm leading-6 text-gray-700"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-soft text-xs font-bold text-primary">{index + 1}</span><span>{instruction}</span></li>)}
          </ol>
          {latestDataset ? <a href={`/api/admin/rating-datasets/${latestDataset.id}/download`} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-bold text-gray-800 hover:bg-gray-50"><Download size={16} aria-hidden="true" />Unduh snapshot terbaru</a> : <Link href="#step-1" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-bold text-gray-800 hover:bg-gray-50"><FileDown size={16} aria-hidden="true" />Buat snapshot terlebih dahulu</Link>}
          <details className="rounded-xl border border-border bg-gray-50">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-800 focus-visible:outline-2 focus-visible:outline-primary">Penjelasan parameter dan format CSV</summary>
            <div className="grid gap-4 border-t border-border p-4 text-sm leading-6 text-secondary sm:grid-cols-2">
              <div><h3 className="m-0 font-bold text-gray-900">Untuk pemula</h3><p className="mb-0 mt-2"><strong className="text-gray-800">k</strong> adalah jumlah tetangga pengguna yang dipertimbangkan. <strong className="text-gray-800">Top-N</strong> adalah jumlah rekomendasi yang diekspor per pengguna. Isi keduanya sesuai konfigurasi Altair, bukan tebakan.</p><p className="mb-0 mt-2"><strong className="text-gray-800">Cosine Similarity</strong> membandingkan pola rating pengguna. FoodRec menerima hasilnya, tetapi tidak menghitung kemiripan.</p></div>
              <div><h3 className="m-0 font-bold text-gray-900">Detail teknis</h3><p className="mb-0 mt-2">Input UTF-8: <code>user_id,food_id,rating</code>. Output UTF-8: <code>user_id,item_id,rank</code>. ID harus integer FoodRec; rank dimulai dari 1 dan berurutan per pengguna.</p><p className="mb-0 mt-2">k mencatat jumlah neighbor yang dipakai. Top-N membatasi banyak baris hasil per user. Similarity tersimpan sebagai <code>COSINE</code>; rumus dan langkah Altair tetap mengikuti protokol penelitian.</p></div>
            </div>
          </details>
          <Alert variant="info">Pemrosesan Altair tetap manual. Format CSV kontrak FoodRec tersedia, tetapi kecocokan dengan file penelitian asli belum divalidasi.</Alert>
        </WorkflowStep>
      </section>

      <section id="step-3" aria-labelledby="step-3-title" className="scroll-mt-24">
        <WorkflowStep number="3" title="Impor dan Validasi" status={stepThreeStatus} current={currentStep === 3} complete={resultIsValid} description="Pilih snapshot yang dipakai, unggah CSV hasil, lalu isi parameter yang benar-benar digunakan di Altair. FoodRec memeriksa file dan menyimpan batch sebagai Draft atau Tervalidasi; belum ada hasil yang diterbitkan." next="Jika ada kesalahan, perbaiki CSV berdasarkan laporan lalu unggah ulang. Hanya hasil tervalidasi dapat dipublikasikan.">
          <RecommendationImportForm datasets={datasets.map(({ id, filename, rowCount, createdAt }) => ({ id, filename, rowCount, createdAt: createdAt.toISOString() }))} />
        </WorkflowStep>
      </section>

      <section id="step-4" aria-labelledby="step-4-title" className="scroll-mt-24">
        <WorkflowStep number="4" title="Tinjau dan Publikasikan" status={stepFourStatus} current={currentStep === 4} complete={publicationIsComplete} description="Periksa preview rekomendasi, snapshot sumber, parameter, dan peringatan. Publikasi hanya berhasil untuk batch valid dan tidak kosong; batch aktif sebelumnya menjadi Digantikan dan riwayat tetap disimpan." next="Setelah berhasil, buka detail batch untuk audit. USER hanya melihat hasil yang sesuai dengan akun mereka.">
          {latestBatch ? <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-gray-50 p-4">
              <div><p className="m-0 text-sm font-bold text-gray-900">Batch #{latestBatch.id} · {latestBatch.filename ?? "File lama"}</p><p className="mb-0 mt-1 text-xs text-secondary">Dataset #{latestBatch.datasetExport.id} · diterima FoodRec {formatDate(latestBatch.createdAt)}</p></div>
              <Badge className={statusClass[latestBatch.status] ?? ""}>{statusLabel[latestBatch.status] ?? latestBatch.status}</Badge>
            </div>
            {latestReport && <RecommendationValidationReportView report={latestReport} />}
            {latestBatch.status === "VALIDATED" && !hasValidationErrors && (latestReport?.summary.recommendationCount ?? 0) > 0 && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 p-4"><div><p className="m-0 text-sm font-bold text-green-900">{latestReport?.summary.recommendationCount} rekomendasi siap ditinjau.</p><p className="mb-0 mt-1 text-xs text-green-800">Konfirmasi publikasi untuk mengganti batch aktif.</p></div><PublishRecommendationBatch batchId={latestBatch.id} /></div>}
            {latestBatch.status === "VALIDATED" && (latestReport?.summary.recommendationCount ?? 0) === 0 && <Alert>Batch kosong tidak dapat diterbitkan. Impor file yang berisi setidaknya satu rekomendasi valid.</Alert>}
            {latestBatch.status === "VALIDATED" && hasValidationErrors && <Alert>Validasi terbaru menemukan masalah. Periksa laporan, lalu impor ulang hasil yang diperbaiki dari tahap 3 sebelum publikasi.</Alert>}
            {latestBatch.status === "DRAFT" && <Alert>Batch belum valid. Perbaiki kesalahan pada laporan di atas, lalu unggah ulang CSV pada tahap 3.</Alert>}
            {latestBatch.status === "PUBLISHED" && <Alert variant="info">Batch diterbitkan {formatDate(latestBatch.publishedAt)}. Hasil aktif hanya menampilkan makanan yang masih aktif dan belum dinilai pengguna.</Alert>}
            {latestBatch.status === "SUPERSEDED" && <Alert variant="info">Batch ini sudah digantikan. Riwayat tetap tersedia; batch aktif {activeBatch ? `#${activeBatch.id}` : "belum ada"}.</Alert>}
            <Link href={`/admin/recommendations/${latestBatch.id}`} className="inline-flex min-h-9 items-center gap-2 text-sm font-semibold text-primary hover:underline">Buka detail dan audit batch<ArrowRight size={15} aria-hidden="true" /></Link>
          </div> : <div className="rounded-xl border border-dashed border-border bg-gray-50 p-5"><p className="m-0 text-sm font-semibold text-gray-900">Belum ada hasil yang bisa ditinjau.</p><p className="mb-0 mt-1 text-sm leading-6 text-secondary">Selesaikan tahap 1–3 terlebih dahulu. Unggah dan validasi hasil sebelum publikasi.</p><Link href="#step-3" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white hover:bg-primary-hover">Ke impor dan validasi<ArrowRight size={15} aria-hidden="true" /></Link></div>}
        </WorkflowStep>
      </section>
    </div>

    <details className="mt-8 rounded-2xl border border-border bg-white">
      <summary className="cursor-pointer list-none px-5 py-4 text-sm font-bold text-gray-900 marker:hidden focus-visible:outline-2 focus-visible:outline-primary">Informasi teknis dan riwayat audit</summary>
      <div className="space-y-7 border-t border-border p-5">
        <section aria-labelledby="dataset-technical-title">
          <h2 id="dataset-technical-title" className="mb-3 flex items-center gap-2 text-base font-bold text-gray-950"><BarChart3 size={17} className="text-primary" aria-hidden="true" />Ringkasan dataset aktual</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><SummaryCard label="Pengguna USER" value={userCount} /><SummaryCard label="Pengguna dengan rating" value={ratedUsers.length} /><SummaryCard label="Makanan aktif" value={activeFoodCount} /><SummaryCard label="Makanan pernah dinilai" value={ratedFoods.length} /><SummaryCard label="Rating aktif / total" value={`${activeRatingCount} / ${ratingCount}`} /></div>
          <p className="mb-0 mt-3 text-xs text-secondary">Snapshot disimpan immutable. Perubahan rating setelah snapshot akan ditandai sebagai stale saat validasi.</p>
        </section>

        <section aria-labelledby="dataset-history-title">
          <h2 id="dataset-history-title" className="mb-3 text-base font-bold text-gray-950">Snapshot rating tersimpan</h2>
          {datasets.length ? <ul className="m-0 space-y-2 p-0">{datasets.map((dataset) => <li key={dataset.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs"><span className="text-gray-700">#{dataset.id} · {dataset.filename} · {dataset.rowCount} rating · {formatDate(dataset.createdAt)}</span><a href={`/api/admin/rating-datasets/${dataset.id}/download`} className="inline-flex min-h-8 items-center gap-1 font-semibold text-primary hover:underline"><Download size={13} aria-hidden="true" />Unduh</a></li>)}</ul> : <p className="m-0 text-sm text-secondary">Belum ada snapshot rating.</p>}
          {datasets.length > 0 && <Link href="/admin/ratings" className="mt-3 inline-block text-xs font-semibold text-primary hover:underline">Buka halaman Data Rating</Link>}
        </section>

        <section aria-labelledby="batch-history-title">
          <form action="/admin/recommendations" method="get" className="mb-4 grid gap-3 rounded-xl border border-border bg-gray-50 p-3 sm:grid-cols-[minmax(0,1fr)_200px_auto_auto] sm:items-end">
            <label className="space-y-1"><span className="block text-xs font-semibold text-gray-700">Cari batch atau nama file</span><input name="search" defaultValue={search} maxLength={100} placeholder="ID batch atau CSV" className="min-h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-orange-100" /></label>
            <label className="space-y-1"><span className="block text-xs font-semibold text-gray-700">Status</span><select name="status" defaultValue={status ?? ""} className="min-h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-orange-100"><option value="">Semua status</option><option value="DRAFT">Draft</option><option value="VALIDATED">Tervalidasi</option><option value="PUBLISHED">Diterbitkan</option><option value="SUPERSEDED">Digantikan</option></select></label>
            <button type="submit" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover"><Search size={15} aria-hidden="true" />Cari</button>
            {(search || status) && <Link href="/admin/recommendations#batch-history-title" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-white px-3 text-sm font-semibold text-gray-700 hover:bg-gray-100">Reset</Link>}
          </form>
          <div className="mb-3 flex items-end justify-between gap-3"><div><h2 id="batch-history-title" className="m-0 text-base font-bold text-gray-950">Riwayat batch</h2><p className="mb-0 mt-1 text-xs text-secondary">{batchCount} batch ditemukan · checksum, file, dan hasil lama dipertahankan untuk audit.</p></div><p className="m-0 text-xs text-secondary">Halaman {page}/{totalPages}</p></div>
          {batches.length ? <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[1000px] border-collapse text-left text-sm"><thead className="bg-gray-50 text-[10px] font-bold uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3">Batch / Dataset</th><th className="px-4 py-3">Rekomendasi / User</th><th className="px-4 py-3">Parameter</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Impor / Publikasi</th><th className="px-4 py-3">Admin</th><th className="px-4 py-3 text-right">Detail</th></tr></thead><tbody className="divide-y divide-border">{batches.map((batch) => {
            const report = getReportSummary(batch.validationReport);
            return <tr key={batch.id}><td className="px-4 py-3"><p className="m-0 font-bold text-gray-900">#{batch.id} · {batch.filename ?? "CSV lama"}</p><p className="m-0 mt-1 text-xs text-secondary">Dataset #{batch.datasetExport.id} · {batch.datasetExport.filename}</p><p className="m-0 mt-1 max-w-56 truncate font-mono text-[10px] text-gray-400" title={batch.fileChecksum}>{batch.fileChecksum}</p></td><td className="px-4 py-3">{report?.recommendationCount ?? batch._count.recommendations} / {report?.userCount ?? "—"}</td><td className="px-4 py-3">k={batch.kNeighbors}<br /><span className="text-xs text-secondary">Top-{batch.topN} · COSINE</span></td><td className="px-4 py-3"><Badge className={statusClass[batch.status] ?? ""}>{statusLabel[batch.status] ?? batch.status}</Badge></td><td className="px-4 py-3 text-xs">{formatDate(batch.createdAt)}<br /><span className="text-secondary">{formatDate(batch.publishedAt)}</span></td><td className="px-4 py-3 text-xs">Impor: {batch.admin.name}<br /><span className="text-secondary">Terbit: {batch.publishedBy?.name ?? "—"}</span></td><td className="px-4 py-3 text-right"><Link href={`/admin/recommendations/${batch.id}`} className="font-semibold text-primary hover:underline">Detail</Link></td></tr>;
          })}</tbody></table></div></Card> : <Card className="px-5 py-8 text-center text-sm text-secondary">{search || status ? "Tidak ada batch yang cocok dengan pencarian atau status ini." : "Belum ada batch rekomendasi."}</Card>}
          {totalPages > 1 && <nav aria-label="Pagination riwayat batch" className="mt-4 flex justify-end gap-2"><Link href={historyHref(Math.max(1, page - 1))} aria-disabled={page <= 1} tabIndex={page <= 1 ? -1 : undefined} className={`inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold ${page <= 1 ? "pointer-events-none text-gray-300" : "text-gray-700 hover:bg-gray-50"}`}><ArrowLeft size={13} aria-hidden="true" />Sebelumnya</Link><Link href={historyHref(Math.min(totalPages, page + 1))} aria-disabled={page >= totalPages} tabIndex={page >= totalPages ? -1 : undefined} className={`inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold ${page >= totalPages ? "pointer-events-none text-gray-300" : "text-gray-700 hover:bg-gray-50"}`}>Berikutnya<ArrowRight size={13} aria-hidden="true" /></Link></nav>}
        </section>
      </div>
    </details>
  </>;
}

function WorkflowStep({ number, title, status, current = false, complete = false, description, next, children }: { number: string; title: string; status: string; current?: boolean; complete?: boolean; description: string; next: string; children: React.ReactNode }) {
  return <Card className={`overflow-hidden ${current ? "border-primary ring-2 ring-orange-100" : ""}`}><div className="border-b border-border px-5 py-4 sm:px-6"><div className="flex flex-wrap items-center gap-3"><span className={`grid size-9 place-items-center rounded-full text-sm font-extrabold ${complete ? "bg-green-700 text-white" : current ? "bg-primary text-white" : "bg-soft text-primary"}`}>{complete ? <Check size={18} aria-hidden="true" /> : number}</span><h2 id={`step-${number}-title`} className="m-0 flex-1 text-lg font-bold text-gray-950">{title}</h2><Badge className={complete ? "bg-green-50 text-green-800" : current ? "bg-orange-100 text-orange-900" : ""}>{status}</Badge></div><p className="mb-0 mt-3 text-sm leading-6 text-secondary">{description}</p></div><div className="space-y-4 p-5 sm:p-6">{children}<p className="m-0 border-t border-border pt-3 text-xs leading-5 text-secondary"><strong className="text-gray-700">Langkah berikutnya:</strong> {next}</p></div></Card>;
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return <Card className="p-4"><p className="m-0 text-xs text-secondary">{label}</p><p className="mb-0 mt-2 text-xl font-bold tracking-tight text-gray-950">{value}</p></Card>;
}
