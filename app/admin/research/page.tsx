import type { Metadata } from "next";
import { ResearchDashboard } from "@/components/admin/research/research-dashboard";
import { requireAdmin } from "@/lib/authz";

export const metadata: Metadata = { title: "Pengumpulan Penelitian" };

export default async function AdminResearchPage() {
  await requireAdmin();
  return <ResearchDashboard />;
}
