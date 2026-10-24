import { MAX_FOOD_IMAGE_BYTES } from "@/lib/food/constants";
import { apiError, parseFoodId, requireAdminRequest } from "@/lib/food/http";
import { removeFoodImage, saveFoodImage, FoodImageValidationError } from "@/lib/food/storage";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const authorization = await requireAdminRequest(request);
  if (!authorization.user) return authorization.response;
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_FOOD_IMAGE_BYTES + 128 * 1024) return apiError(413, "IMAGE_TOO_LARGE", "Ukuran request foto melebihi batas 5 MB.");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError(400, "INVALID_REQUEST", "Body harus berupa form-data.");
  }
  const id = parseFoodId(String(form.get("foodId") ?? ""));
  const value = form.get("image");
  if (!id || !(value instanceof File) || !value.name) return apiError(400, "INVALID_IMAGE", "ID makanan dan file foto wajib diisi.");

  const existing = await prisma.food.findUnique({ where: { id }, select: { imageUrl: true } });
  if (!existing) return apiError(404, "FOOD_NOT_FOUND", "Makanan tidak ditemukan.");

  let stored: Awaited<ReturnType<typeof saveFoodImage>>;
  try {
    stored = await saveFoodImage(value);
  } catch (error) {
    if (error instanceof FoodImageValidationError) return apiError(422, "INVALID_IMAGE", error.message);
    return apiError(500, "IMAGE_STORAGE_FAILED", "Foto tidak dapat disimpan.");
  }

  try {
    await prisma.food.update({ where: { id }, data: { imageUrl: stored.imageUrl } });
  } catch {
    await removeFoodImage(stored.imageUrl).catch(() => undefined);
    return apiError(500, "IMAGE_DATABASE_UPDATE_FAILED", "Foto tidak dapat dihubungkan ke makanan.");
  }

  await removeFoodImage(existing.imageUrl).catch(() => console.error("Food image cleanup failed."));
  return Response.json({ data: { id, imageUrl: stored.imageUrl }, message: "Foto makanan berhasil diperbarui." });
}

export async function DELETE(request: Request) {
  const authorization = await requireAdminRequest(request);
  if (!authorization.user) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_REQUEST", "Body request tidak valid.");
  }
  const id = body && typeof body === "object" ? parseFoodId(String((body as { foodId?: unknown }).foodId ?? "")) : null;
  if (!id) return apiError(400, "INVALID_FOOD_ID", "ID makanan tidak valid.");

  const food = await prisma.food.findUnique({ where: { id }, select: { imageUrl: true } });
  if (!food) return apiError(404, "FOOD_NOT_FOUND", "Makanan tidak ditemukan.");
  await prisma.food.update({ where: { id }, data: { imageUrl: null } });
  await removeFoodImage(food.imageUrl).catch(() => console.error("Food image cleanup failed."));
  return Response.json({ data: { id, imageUrl: null }, message: "Foto makanan dihapus." });
}
