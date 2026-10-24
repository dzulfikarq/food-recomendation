import { apiError, parseFoodId } from "@/lib/food/http";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseFoodId((await params).id);
  if (!id) return apiError(400, "INVALID_FOOD_ID", "ID makanan tidak valid.");
  try {
    const food = await prisma.food.findFirst({
      where: { id, isActive: true },
      select: {
        id: true, foodCode: true, name: true, description: true, category: true, taste: true,
        healthLevel: true, origin: true, proteinType: true, priceCategory: true, mealTime: true,
        dietCategory: true, texture: true, imageUrl: true
      }
    });
    if (!food) return apiError(404, "FOOD_NOT_FOUND", "Makanan aktif tidak ditemukan.");
    return Response.json({ data: food });
  } catch {
    return apiError(500, "FOOD_READ_FAILED", "Detail makanan tidak dapat dimuat.");
  }
}
