import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileUp } from "lucide-react";
import { Badge, Card, PageHeader } from "@/components/ui";
import { FoodImportForm } from "@/components/admin/foods/food-import-form";
import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Impor Katalog Makanan" };

const statusLabel = { VALIDATED: "Tervalidasi", PROCESSING: "Diproses", COMPLETED: "Selesai", FAILED: "Gagal" } as const;

export default async function FoodImportPage() {
  await requireAdmin();
  const imports = await prisma.foodImport.findMany({ orderBy: { createdAt: "desc" }, take: 20 });

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/admin/foods" className="mb-5 inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-900"><ArrowLeft size={16} aria-hidden="true" /> Kembali ke katalog</Link>
      <PageHeader eyebrow="FOOD MANAGEMENT" title="Impor Katalog CSV" description="Validasi file dan tinjau preview sebelum menambahkan makanan baru. Data katalog lama tidak pernah ditimpa." />
      <FoodImportForm />

      <section className="mt-9">
        <div className="mb-4 flex items-center gap-2"><FileUp size={18} className="text-primary" aria-hidden="true" /><h2 className="m-0 text-lg font-bold text-gray-950">Riwayat Import</h2></div>
        {imports.length === 0 ? <Card className="px-5 py-8 text-center text-sm text-secondary">Belum ada aktivitas import katalog.</Card> : <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[580px] border-collapse text-left text-sm"><thead className="bg-gray-50 text-xs font-bold uppercase tracking-wide text-gray-500"><tr><th className="px-5 py-3">File</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Baris</th><th className="px-4 py-3">Ditambahkan</th><th className="px-4 py-3">Tanggal</th></tr></thead><tbody className="divide-y divide-border">{imports.map((item) => <tr key={item.id}><td className="max-w-64 truncate px-5 py-3 font-medium text-gray-800">{item.filename}</td><td className="px-4 py-3"><Badge className={item.status === "COMPLETED" ? "bg-green-50 text-green-800" : item.status === "FAILED" ? "bg-red-50 text-red-800" : "bg-orange-50 text-orange-900"}>{statusLabel[item.status]}</Badge></td><td className="px-4 py-3">{item.totalRows}</td><td className="px-4 py-3">{item.insertedRows}</td><td className="px-4 py-3 text-xs text-secondary">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(item.createdAt)}</td></tr>)}</tbody></table></div></Card>}
      </section>
    </div>
  );
}
