import { Card } from "@/components/ui";

export default function LoadingRatings() {
  return <div role="status" aria-label="Memuat data rating" aria-busy="true" className="space-y-5">
    <div className="h-9 w-48 animate-pulse rounded-lg bg-gray-200" />
    <Card className="h-40 animate-pulse bg-gray-100"><span className="sr-only">Memuat ringkasan snapshot.</span></Card>
    <Card className="overflow-hidden p-4"><div className="space-y-3">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-12 animate-pulse rounded-lg bg-gray-100" />)}</div></Card>
    <span className="sr-only">Memuat ringkasan dan riwayat snapshot.</span>
  </div>;
}
