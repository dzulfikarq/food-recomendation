import { Activity, Database, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/authz";

const modules = [
  { icon: Database, title: "Food Management", description: "Kelola katalog makanan FoodRec.", href: "/admin/foods" },
  { icon: Activity, title: "Data Rating", description: "Lihat ringkasan rating dan ekspor snapshot dataset.", href: "/admin/ratings" },
  { icon: Sparkles, title: "Recommendations", description: "Pemrosesan Altair dan publikasi hasil direncanakan pada fase berikutnya." }
];

export default async function AdminDashboard() {
  const admin = await requireAdmin();

  return (
    <>
      <PageHeader eyebrow="DASHBOARD" title={`Selamat datang, ${admin.name}`} description="Ini adalah ruang kerja administrator FoodRec. Fondasi akun dan akses sudah siap." />
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-5 bg-soft p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="max-w-2xl"><span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-accent"><ShieldCheck size={14} aria-hidden="true" /> Akses administrator terverifikasi</span><h2 className="mb-0 mt-4 text-xl font-extrabold text-gray-950">FoodRec Admin Workspace</h2><p className="mb-0 mt-2 text-sm leading-6 text-gray-600">Akun {admin.email} memiliki akses admin. Kelola katalog makanan dan ekspor snapshot dataset rating dari modul di bawah.</p></div>
          <span className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-gray-500"><span className="size-2 rounded-full bg-green-600" /> Sesi aktif</span>
        </div>
        <div className="grid border-t border-border sm:grid-cols-3">
          {modules.map(({ icon: Icon, title, description, href }, index) => <div key={title} className={`p-5 sm:p-6 ${index < modules.length - 1 ? "border-b border-border sm:border-b-0 sm:border-r" : ""}`}><span className="grid size-10 place-items-center rounded-xl bg-gray-100 text-gray-600"><Icon size={19} aria-hidden="true" /></span><div className="mt-4 flex items-center gap-2"><h3 className="m-0 text-sm font-bold text-gray-900">{title}</h3>{!href && <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold text-gray-500">Segera hadir</span>}</div><p className="mb-0 mt-2 text-xs leading-5 text-secondary">{description}</p>{href && <Link href={href} className="mt-4 inline-flex text-xs font-bold text-primary hover:text-primary-hover">Buka {title} →</Link>}</div>)}
        </div>
      </Card>
      <p className="mt-5 text-xs text-gray-500">Proses rekomendasi nantinya dilakukan manual di Altair AI Studio Educational 2026.1.1.</p>
    </>
  );
}
