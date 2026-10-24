import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { FoodForm } from "@/components/admin/foods/food-form";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/authz";
import { parseFoodId } from "@/lib/food/http";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Edit Makanan" };

export default async function EditFoodPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = parseFoodId((await params).id);
  if (!id) notFound();
  const food = await prisma.food.findUnique({ where: { id } });
  if (!food) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/admin/foods" className="mb-5 inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-900"><ArrowLeft size={16} aria-hidden="true" /> Kembali ke katalog</Link>
      <PageHeader eyebrow="FOOD MANAGEMENT" title="Edit Makanan" description="Perbarui informasi makanan. Food Code dan penanda riwayat tidak dapat diubah." />
      <FoodForm mode="edit" food={food} />
    </div>
  );
}
