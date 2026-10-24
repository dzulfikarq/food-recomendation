import { foodStatusSchema } from "@/lib/food/schemas";
import { apiError, parseFoodId, requireAdminRequest, validationError } from "@/lib/food/http";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const authorization = await requireAdminRequest(request);
  if (!authorization.user) return authorization.response;
  const id = parseFoodId((await params).id);
  if (!id) return apiError(400, "INVALID_FOOD_ID", "ID makanan tidak valid.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_REQUEST", "Body request tidak valid.");
  }
  const parsed = foodStatusSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const food = await prisma.food.updateMany({ where: { id }, data: { isActive: parsed.data.isActive } });
  if (!food.count) return apiError(404, "FOOD_NOT_FOUND", "Makanan tidak ditemukan.");
  return Response.json({ data: { id, isActive: parsed.data.isActive }, message: parsed.data.isActive ? "Makanan diaktifkan kembali." : "Makanan dinonaktifkan." });
}
