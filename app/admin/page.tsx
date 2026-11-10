import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Activity, Database, UtensilsCrossed } from "lucide-react";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

const batchLabels: Record<string, string> = {
  DRAFT: "Perlu perbaikan",
  VALIDATED: "Siap ditinjau",
  PUBLISHED: "Sudah diterbitkan",
  SUPERSEDED: "Digantikan batch baru"
};

function formatDate(value: Date | null | undefined) {
  return value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(value) : "Belum ada";
}

export default async function AdminDashboard() {
  const admin = await requireAdmin();
  const [activeFoodCount, inactiveFoodCount, ratedUserCount, ratingCount, datasetCount, latestSnapshot, latestBatch, activeBatch, latestPublishedBatch, latestRating] = await Promise.all([
    prisma.food.count({ where: { isActive: true } }),
    prisma.food.count({ where: { isActive: false } }),
    prisma.user.count({ where: { role: "USER", ratings: { some: {} } } }),
    prisma.rating.count(),
    prisma.datasetExport.count(),
    prisma.datasetExport.findFirst({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, filename: true, rowCount: true, createdAt: true } }),
    prisma.recommendationBatch.findFirst({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, datasetExportId: true, status: true, createdAt: true, publishedAt: true, _count: { select: { recommendations: true } } } }),
    prisma.recommendationBatch.findFirst({ where: { status: "PUBLISHED" }, orderBy: [{ publishedAt: "desc" }, { id: "desc" }], select: { id: true } }),
    prisma.recommendationBatch.findFirst({ where: { status: "PUBLISHED" }, orderBy: [{ publishedAt: "desc" }, { id: "desc" }], select: { id: true, publishedAt: true } }),
    prisma.rating.aggregate({ _max: { updatedAt: true } })
  ]);
  const snapshotStale = Boolean(latestSnapshot && (latestSnapshot.rowCount !== ratingCount || (latestRating._max.updatedAt && latestRating._max.updatedAt > latestSnapshot.createdAt)));
  const nextAction = activeFoodCount === 0
    ? { title: "Siapkan katalog aktif", description: "Belum ada makanan aktif. Tambahkan makanan atau aktifkan kembali item agar pengguna dapat memberi rating.", href: "/admin/foods", label: "Kelola makanan", icon: UtensilsCrossed }
    : ratingCount === 0
      ? { title: "Ajak pengguna memberi rating", description: "Belum ada rating tersimpan. Pengguna USER perlu menilai makanan yang mereka kenal sebelum dataset dapat dibuat.", href: "/foods", label: "Lihat katalog publik", icon: UtensilsCrossed }
      : latestBatch?.status === "VALIDATED" && latestBatch._count.recommendations > 0
        ? { title: "Tinjau hasil yang tervalidasi", description: "Periksa preview dan konfirmasi publikasi. Rekomendasi baru tampil setelah diterbitkan.", href: `/admin/recommendations/${latestBatch.id}`, label: "Tinjau dan publikasikan", icon: Activity }
        : latestBatch?.status === "DRAFT"
          ? { title: "Perbaiki file hasil", description: "Batch terakhir memiliki kesalahan validasi. Perbaiki CSV lalu impor ulang; batch invalid tidak dapat diterbitkan.", href: "/admin/recommendations#step-3", label: "Kembali ke validasi", icon: Activity }
          : !latestSnapshot || snapshotStale
            ? { title: snapshotStale ? "Buat snapshot rating terbaru" : "Buat snapshot pertama", description: snapshotStale ? "Rating berubah setelah snapshot terakhir. Snapshot baru akan menjaga data proses tetap mutakhir." : "Rating sudah tersedia. Buat snapshot privat untuk memulai workflow rekomendasi.", href: "/admin/recommendations#step-1", label: "Buat dataset", icon: Database }
            : latestBatch && latestBatch.datasetExportId !== latestSnapshot.id
              ? { title: "Proses dataset di Altair", description: "Snapshot tersedia, tetapi website belum menerima CSV hasil. Jalankan proses manual di Altair, lalu kembali untuk mengunggah hasil.", href: "/admin/recommendations#step-2", label: "Lanjut ke panduan Altair", icon: Activity }
              : activeBatch
                ? { title: "Tinjau rekomendasi aktif", description: "Batch aktif sudah diterbitkan. Periksa detail atau mulai snapshot baru saat data rating berubah.", href: "/admin/recommendations", label: "Tinjau workflow", icon: Activity }
                : { title: "Lanjutkan workflow rekomendasi", description: "Belum ada hasil aktif. Ikuti tahap snapshot, proses manual di Altair, validasi, lalu publikasi.", href: "/admin/recommendations", label: "Buka workflow", icon: Activity };
  const ActionIcon = nextAction.icon;

  return <>
    <PageHeader eyebrow="DASHBOARD ADMIN" title={`Selamat datang, ${admin.name}`} description="Ringkasan operasional katalog, rating, snapshot, dan publikasi rekomendasi." />
    <section aria-label="Ringkasan operasional" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <SummaryCard icon={UtensilsCrossed} label="Makanan aktif" value={activeFoodCount} detail={inactiveFoodCount ? `${inactiveFoodCount} makanan nonaktif` : "Semua makanan tersedia"} />
      <SummaryCard icon={Activity} label="Pengguna dengan rating" value={ratedUserCount} />
      <SummaryCard icon={Activity} label="Total rating" value={ratingCount} />
      <SummaryCard icon={Database} label="Dataset ekspor" value={datasetCount} detail={latestSnapshot ? `Terakhir: ${formatDate(latestSnapshot.createdAt)}` : "Belum ada snapshot"} />
      <SummaryCard icon={Activity} label="Batch aktif" value={activeBatch ? <Badge className="bg-green-50 text-green-800">Diterbitkan</Badge> : "Belum ada"} detail={activeBatch ? `Batch #${activeBatch.id}` : "Batch baru tampil setelah publikasi"} />
      <SummaryCard icon={Database} label="Publikasi terakhir" value={latestPublishedBatch?.publishedAt ? formatDate(latestPublishedBatch.publishedAt) : "Belum ada"} detail={latestPublishedBatch ? `Batch #${latestPublishedBatch.id}` : "Belum ada batch diterbitkan"} />
    </section>

    <section aria-labelledby="last-batch-title" className="mt-6">
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div><p className="m-0 text-xs font-bold uppercase tracking-[.14em] text-primary">STATUS PEMROSESAN</p><h2 id="last-batch-title" className="mb-0 mt-2 text-lg font-bold text-gray-950">Batch rekomendasi terakhir</h2><p className="mb-0 mt-1 text-sm text-secondary">{latestBatch ? `#${latestBatch.id} · ${batchLabels[latestBatch.status] ?? latestBatch.status} · ${formatDate(latestBatch.createdAt)}` : "Belum ada batch rekomendasi."}</p>{latestBatch?.publishedAt && <p className="mb-0 mt-1 text-xs text-secondary">Diterbitkan {formatDate(latestBatch.publishedAt)}</p>}</div>
        {latestBatch && <Badge className={latestBatch.status === "PUBLISHED" ? "bg-green-50 text-green-800" : latestBatch.status === "VALIDATED" ? "bg-orange-100 text-orange-900" : "bg-gray-100 text-gray-700"}>{batchLabels[latestBatch.status] ?? latestBatch.status}</Badge>}
      </Card>
    </section>

    <Card className="mt-6 overflow-hidden">
      <div className="flex flex-col gap-5 bg-soft p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div className="max-w-2xl"><span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-accent">Aksi berikutnya</span><h2 className="mb-0 mt-4 text-xl font-extrabold text-gray-950">{nextAction.title}</h2><p className="mb-0 mt-2 text-sm leading-6 text-secondary">{nextAction.description}</p></div>
        <Link href={nextAction.href} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-primary px-5 text-sm font-bold text-white hover:bg-primary-hover sm:self-auto"><ActionIcon size={16} aria-hidden="true" />{nextAction.label}<ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
      <div className="grid border-t border-border sm:grid-cols-3">
        <ModuleLink icon={UtensilsCrossed} title="Kelola makanan" description="Atur katalog makanan aktif." href="/admin/foods" />
        <ModuleLink icon={Activity} title="Data rating" description="Lihat rating dan snapshot dataset." href="/admin/ratings" />
        <ModuleLink icon={Database} title="Pemrosesan rekomendasi" description="Impor, validasi, tinjau, dan terbitkan hasil." href="/admin/recommendations" />
      </div>
    </Card>
  </>;
}

function SummaryCard({ icon: Icon, label, value, detail }: { icon: typeof Database; label: string; value: ReactNode; detail?: string }) {
  return <Card className="p-4"><span className="grid size-9 place-items-center rounded-xl bg-soft text-primary"><Icon size={18} aria-hidden="true" /></span><p className="mb-0 mt-3 text-xs font-medium text-secondary">{label}</p><div className="mb-0 mt-1 break-words text-xl font-bold tracking-tight text-gray-950">{value}</div>{detail && <p className="mb-0 mt-1 text-xs leading-5 text-secondary">{detail}</p>}</Card>;
}

function ModuleLink({ icon: Icon, title, description, href }: { icon: typeof Database; title: string; description: string; href: string }) {
  return <div className="p-5 sm:p-6"><span className="grid size-10 place-items-center rounded-xl bg-gray-100 text-gray-600"><Icon size={19} aria-hidden="true" /></span><h3 className="mb-0 mt-3 text-sm font-bold text-gray-900">{title}</h3><p className="mb-0 mt-2 text-xs leading-5 text-secondary">{description}</p><Link href={href} className="mt-4 inline-flex min-h-9 items-center gap-1 text-xs font-bold text-primary hover:text-primary-hover">Buka {title}<ArrowRight size={13} aria-hidden="true" /></Link></div>;
}
