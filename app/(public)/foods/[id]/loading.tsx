import { Container, Card } from "@/components/ui";

export default function FoodDetailLoading() {
  return <Container className="py-10 sm:py-14"><div className="mb-6 h-5 w-40 animate-pulse rounded bg-gray-100" /><Card className="grid animate-pulse overflow-hidden lg:grid-cols-2"><div className="min-h-72 bg-gray-100 sm:min-h-96" /><div className="space-y-4 p-6 sm:p-9"><div className="h-6 w-24 rounded-full bg-gray-100" /><div className="h-9 w-3/4 rounded bg-gray-100" /><div className="h-20 rounded bg-gray-100" /><div className="mt-12 h-24 rounded bg-gray-100" /></div></Card><span className="sr-only" role="status">Memuat detail makanan…</span></Container>;
}
