import type { Metadata } from "next";
import { requireUser } from "@/lib/authz";
import { RecommendationsClient } from "@/components/recommendations/recommendations-client";
import { testPrototypeAutomationEnabled } from "@/lib/recommendations/test-prototype";

export const metadata: Metadata = { title: "Rekomendasi" };

export default async function RecommendationsPage() {
  await requireUser("/recommendations");
  return <RecommendationsClient automaticPrototype={testPrototypeAutomationEnabled()} />;
}
