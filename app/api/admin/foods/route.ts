import { foodCreateSchema, foodListQuerySchema } from "@/lib/food/schemas";
import { MAX_FOOD_IMAGE_BYTES } from "@/lib/food/constants";
import { apiError, isUniqueViolation, requireAdminRequest, validationError } from "@/lib/food/http";
import { listFoods } from "@/lib/food/service";
import { readFoodPayload } from "@/lib/food/form-data";
import { FoodImageValidationError, removeFoodImage, saveFoodImage } from "@/lib/food/storage";
import { prisma } from "@/lib/prisma";

const protectedCreateFields = ["id", "isActive", "firstUsedAt", "imageUrl"];

export async function GET(request: Request) {
  const authorization = await requireAdminRequest(request);
  if (!authorization.user) return authorization.response;

  const params = new URL(request.url).searchParams;
  const query = foodListQuerySchema.safeParse(Object.fromEntries(params));
  if (!query.success) return validationError(query.error);

  const result = await listFoods(query.data);
  return Response.json({ data: result });
}

export async function POST(request: Request) {
  const authorization = await requireAdminRequest(request);
  if (!authorization.user) return authorization.response;
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_FOOD_IMAGE_BYTES + 128 * 1024) return apiError(413, "IMAGE_TOO_LARGE", "Ukuran request foto melebihi batas.");

  let payload;
  try {
    payload = await readFoodPayload(request);
  } catch {
    return apiError(400, "INVALID_REQUEST", "Body request tidak valid.");
  }
  if (payload.invalidImageField) return apiError(400, "INVALID_IMAGE", "Field foto harus berupa file.");
  if (protectedCreateFields.some((field) => field in payload.fields)) {
    return apiError(400, "PROTECTED_FIELD", "ID, status, riwayat, dan URL foto tidak dapat diatur saat membuat makanan.");
  }

  const parsed = foodCreateSchema.safeParse(payload.fields);
  if (!parsed.success) return validationError(parsed.error);

  let storedImage: Awaited<ReturnType<typeof saveFoodImage>> | null = null;
  try {
    if (payload.image) storedImage = await saveFoodImage(payload.image);
    const food = await prisma.food.create({
      data: { ...parsed.data, isActive: true, imageUrl: storedImage?.imageUrl ?? null }
    });
    return Response.json({ data: food, message: "Makanan berhasil ditambahkan." }, { status: 201 });
  } catch (error) {
    if (storedImage) await removeFoodImage(storedImage.imageUrl).catch(() => undefined);
    if (error instanceof FoodImageValidationError) return apiError(422, "INVALID_IMAGE", error.message);
    if (isUniqueViolation(error)) return apiError(409, "DUPLICATE_FOOD_CODE", "Kode makanan sudah digunakan.");
    return apiError(500, "FOOD_CREATE_FAILED", "Makanan tidak dapat disimpan.");
  }
}
