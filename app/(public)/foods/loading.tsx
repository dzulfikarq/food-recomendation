import { Container } from "@/components/ui";
import { FoodGridSkeleton } from "@/components/foods/food-grid-skeleton";

export default function FoodsLoading() {
  return <Container className="py-10 sm:py-14"><div className="mb-8"><div className="h-3 w-24 animate-pulse rounded bg-orange-100" /><div className="mt-4 h-10 w-72 max-w-full animate-pulse rounded bg-gray-100" /><div className="mt-3 h-5 w-full max-w-xl animate-pulse rounded bg-gray-100" /></div><FoodGridSkeleton /></Container>;
}
