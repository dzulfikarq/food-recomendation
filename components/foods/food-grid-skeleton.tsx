import { Card } from "@/components/ui";

export function FoodGridSkeleton({ count = 6 }: { count?: number }) {
  return <div role="status" aria-label="Memuat daftar makanan" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    <span className="sr-only">Memuat makanan…</span>
    {Array.from({ length: count }, (_, index) => <div key={index} aria-hidden="true"><Card className="animate-pulse overflow-hidden">
      <div className="h-44 bg-gray-100 sm:h-48" />
      <div className="space-y-3 p-5"><div className="h-5 w-24 rounded-full bg-gray-100" /><div className="h-6 w-3/4 rounded bg-gray-100" /><div className="h-4 rounded bg-gray-100" /><div className="h-4 w-2/3 rounded bg-gray-100" /><div className="h-10 rounded-xl bg-gray-100" /></div>
    </Card></div>)}
  </div>;
}
