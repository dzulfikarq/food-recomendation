import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { FoodForm } from "@/components/admin/foods/food-form";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Tambah Makanan" };

export default function NewFoodPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/admin/foods" className="mb-5 inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-900"><ArrowLeft size={16} aria-hidden="true" /> Kembali ke katalog</Link>
      <PageHeader eyebrow="FOOD MANAGEMENT" title="Tambah Makanan" description="Masukkan identitas dan karakteristik makanan. Food Code menjadi identitas tetap." />
      <FoodForm mode="create" />
    </div>
  );
}
