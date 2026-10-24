export type FoodRequestPayload = {
  fields: Record<string, unknown>;
  image: File | null;
  removeImage: boolean;
  invalidImageField: boolean;
};

export async function readFoodPayload(request: Request): Promise<FoodRequestPayload> {
  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await request.formData();
    const imageValue = form.get("image");
    const imageFile = imageValue instanceof File && (imageValue.size > 0 || imageValue.name !== "") ? imageValue : null;
    const fields = Object.fromEntries(form);
    delete fields.image;
    delete fields.removeImage;
    return {
      fields,
      image: imageFile,
      removeImage: form.get("removeImage") === "true",
      invalidImageField: imageValue !== null && typeof imageValue === "string" && imageValue !== ""
    };
  }

  const fields = await request.json() as Record<string, unknown>;
  return { fields, image: null, removeImage: false, invalidImageField: false };
}
