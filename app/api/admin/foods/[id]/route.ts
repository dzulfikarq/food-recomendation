import { foodUpdateSchema } from "@/lib/food/schemas";
import { apiError, isForeignKeyViolation, isMissingRecord, isUniqueViolation, parseFoodId, requireAdminRequest, validationError } from "@/lib/food/http";
import { readFoodPayload } from "@/lib/food/form-data";
import { FoodImageValidationError, removeFoodImage, saveFoodImage } from "@/lib/food/storage";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };
const protectedUpdateFields = ["id", "foodCode", "isActive", "firstUsedAt", "imageUrl"];

export async function GET(request: Request, { params }: RouteContext) {
  const authorization = await requireAdminRequest(request);
  if (!authorization.user) return authorization.response;
  const id = parseFoodId((await params).id);
  if (!id) return apiError(400, "INVALID_FOOD_ID", "ID makanan tidak valid.");

  const food = await prisma.food.findUnique({ where: { id }, include: { _count: { select: { ratings: true, recommendations: true } } } });
  if (!food) return apiError(404, "FOOD_NOT_FOUND", "Makanan tidak ditemukan.");
  return Response.json({ data: food });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const authorization = await requireAdminRequest(request);
  if (!authorization.user) return authorization.response;
  const id = parseFoodId((await params).id);
  if (!id) return apiError(400, "INVALID_FOOD_ID", "ID makanan tidak valid.");

  let payload;
  try {
    payload = await readFoodPayload(request);
  } catch {
    return apiError(400, "INVALID_REQUEST", "Body request tidak valid.");
  }
  if (payload.invalidImageField) return apiError(400, "INVALID_IMAGE", "Field foto harus berupa file.");
  const protectedField = protectedUpdateFields.find((field) => field in payload.fields);
  if (protectedField) {
    const code = protectedField === "foodCode" ? "FOOD_CODE_IMMUTABLE" : "PROTECTED_FIELD";
    return apiError(409, code, protectedField === "foodCode" ? "Kode makanan tidak dapat diubah." : "Field sistem tidak dapat diubah melalui form ini.");
  }
  if (payload.image && payload.removeImage) return apiError(400, "CONFLICTING_IMAGE_ACTION", "Pilih upload foto baru atau hapus foto, bukan keduanya.");

  const existing = await prisma.food.findUnique({ where: { id } });
  if (!existing) return apiError(404, "FOOD_NOT_FOUND", "Makanan tidak ditemukan.");

  const parsed = Object.keys(payload.fields).length === 0 && (payload.image || payload.removeImage)
    ? { success: true as const, data: {} }
    : foodUpdateSchema.safeParse(payload.fields);
  if (!parsed.success) return validationError(parsed.error);

  let storedImage: Awaited<ReturnType<typeof saveFoodImage>> | null = null;
  try {
    if (payload.image) storedImage = await saveFoodImage(payload.image);
    const updateImage = Boolean(storedImage || payload.removeImage);
    const food = await prisma.food.update({
      where: { id },
      data: {
        ...parsed.data,
        ...(updateImage ? { imageUrl: storedImage?.imageUrl ?? null } : {})
      }
    });

    if (updateImage && existing.imageUrl) {
      await removeFoodImage(existing.imageUrl).catch(() => console.error("Food image cleanup failed."));
    }
    return Response.json({ data: food, message: "Makanan berhasil diperbarui." });
  } catch (error) {
    if (storedImage) await removeFoodImage(storedImage.imageUrl).catch(() => undefined);
    if (error instanceof FoodImageValidationError) return apiError(422, "INVALID_IMAGE", error.message);
    if (isUniqueViolation(error)) return apiError(409, "DUPLICATE_FOOD_CODE", "Kode makanan sudah digunakan.");
    if (isMissingRecord(error)) return apiError(404, "FOOD_NOT_FOUND", "Makanan tidak ditemukan.");
    return apiError(500, "FOOD_UPDATE_FAILED", "Perubahan makanan tidak dapat disimpan.");
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const authorization = await requireAdminRequest(request);
  if (!authorization.user) return authorization.response;
  const id = parseFoodId((await params).id);
  if (!id) return apiError(400, "INVALID_FOOD_ID", "ID makanan tidak valid.");

  try {
    const deleted = await prisma.$transaction(async (tx) => {
      const food = await tx.food.findUnique({
        where: { id },
        include: { _count: { select: { ratings: true, recommendations: true } } }
      });
      if (!food) return null;
      if (food.firstUsedAt || food._count.ratings > 0 || food._count.recommendations > 0) {
        return { historyConflict: true as const };
      }
      await tx.food.delete({ where: { id } });
      return { historyConflict: false as const, imageUrl: food.imageUrl };
    });

    if (!deleted) return apiError(404, "FOOD_NOT_FOUND", "Makanan tidak ditemukan.");
    if (deleted.historyConflict) return apiError(409, "FOOD_HAS_HISTORY", "Makanan sudah digunakan dalam data penelitian. Nonaktifkan saja.");
    await removeFoodImage(deleted.imageUrl).catch(() => console.error("Food image cleanup failed."));
    return Response.json({ data: { id }, message: "Makanan berhasil dihapus." });
  } catch (error) {
    if (isForeignKeyViolation(error)) return apiError(409, "FOOD_HAS_HISTORY", "Makanan sudah digunakan dalam data penelitian. Nonaktifkan saja.");
    return apiError(500, "FOOD_DELETE_FAILED", "Makanan tidak dapat dihapus.");
  }
}
