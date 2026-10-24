import { apiError, validationError } from "@/lib/food/http";
import { publicFoodQuerySchema } from "@/lib/food/schemas";
import { listPublicFoods } from "@/lib/food/service";

export async function GET(request: Request) {
  const query = publicFoodQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return validationError(query.error);
  try {
    return Response.json({ data: await listPublicFoods(query.data) });
  } catch {
    return apiError(500, "FOOD_CATALOG_UNAVAILABLE", "Katalog makanan tidak dapat dimuat.");
  }
}
