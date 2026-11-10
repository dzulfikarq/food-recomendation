import { Card } from "@/components/ui";

export default function LoadingFoods() {
  return <div role="status" aria-label="Memuat katalog makanan" aria-busy="true" className="space-y-5">
    <div className="h-9 w-56 animate-pulse rounded-lg bg-gray-200" />
    <div className="h-24 animate-pulse rounded-2xl bg-gray-200" />
    <Card className="overflow-hidden p-4"><div className="space-y-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-14 animate-pulse rounded-lg bg-gray-100" />)}</div></Card>
    <span className="sr-only">Memuat daftar makanan.</span>
  </div>;
}
