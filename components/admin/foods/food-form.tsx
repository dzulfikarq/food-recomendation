"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ImagePlus, Save, Trash2 } from "lucide-react";
import { FOOD_CATEGORIES, FOOD_MEAL_TIMES, FOOD_PRICE_CATEGORIES, FOOD_PROTEINS, FOOD_TASTES, FOOD_TEXTURES, MAX_FOOD_IMAGE_BYTES } from "@/lib/food/constants";
import { Alert, Badge, Button, ButtonLink, Card, InputField, SelectField, TextAreaField } from "@/components/ui";

export type FoodFormRecord = {
  id: number;
  foodCode: string;
  name: string;
  description: string | null;
  category: string;
  taste: string;
  healthLevel: string | null;
  origin: string;
  proteinType: string | null;
  priceCategory: string | null;
  mealTime: string | null;
  dietCategory: string | null;
  texture: string | null;
  imageUrl: string | null;
  isActive: boolean;
};

type Props = { mode: "create" | "edit"; food?: FoodFormRecord };

export function FoodForm({ mode, food }: Props) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(food?.imageUrl ?? null);
  const [removeImage, setRemoveImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!preview?.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const onImageChange = (file?: File) => {
    if (!file) return;
    if (file.size > MAX_FOOD_IMAGE_BYTES) {
      setError("Ukuran foto maksimum 5 MB.");
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    setError(null);
    setRemoveImage(false);
    setImageFile(file);
    setPreview(URL.createObjectURL(file));
  };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const body = new FormData(event.currentTarget);
    if (removeImage) body.set("removeImage", "true");
    else body.delete("removeImage");

    try {
      const response = await fetch(mode === "create" ? "/api/admin/foods" : `/api/admin/foods/${food?.id}`, {
        method: mode === "create" ? "POST" : "PATCH",
        body
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error?.message ?? "Makanan tidak dapat disimpan.");
        return;
      }
      router.push(`/admin/foods?notice=${mode === "create" ? "created" : "updated"}`);
      router.refresh();
    } catch {
      setError("Koneksi gagal. Data belum tersimpan; coba lagi.");
    } finally {
      setPending(false);
    }
  }

  const clearImage = () => {
    setImageFile(null);
    setPreview(null);
    setRemoveImage(Boolean(food?.imageUrl));
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <form onSubmit={submit} className="space-y-6" aria-busy={pending}>
      {error && <Alert>{error}</Alert>}

      <Card className="p-5 sm:p-7">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div><h2 className="m-0 text-lg font-bold text-gray-950">Informasi dasar</h2><p className="mb-0 mt-1 text-sm text-secondary">Identitas katalog makanan.</p></div>
          {food && <Badge className={food.isActive ? "bg-green-50 text-green-800" : "bg-gray-100 text-gray-600"}>{food.isActive ? "Aktif" : "Nonaktif"}</Badge>}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <InputField
            id="food-code"
            name={mode === "create" ? "foodCode" : undefined}
            label="Food Code"
            defaultValue={food?.foodCode}
            placeholder="FOOD-041"
            minLength={3}
            maxLength={64}
            readOnly={mode === "edit"}
            required
            hint={mode === "edit" ? "Food Code permanen dan tidak dapat diubah." : "Gunakan kode unik, misalnya FOOD-041."}
          />
          <InputField id="food-name" name="name" label="Nama Makanan" defaultValue={food?.name} placeholder="Nama makanan" maxLength={180} required />
          <SelectField id="food-category" name="category" label="Kategori" defaultValue={food?.category ?? ""} required>
            <option value="" disabled>Pilih kategori</option>
            {FOOD_CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}
          </SelectField>
          <SelectField id="food-taste" name="taste" label="Taste / Rasa" defaultValue={food?.taste ?? ""} required>
            <option value="" disabled>Pilih karakter rasa</option>
            {FOOD_TASTES.map((value) => <option key={value} value={value}>{value}</option>)}
          </SelectField>
          <InputField id="food-origin" name="origin" label="Origin / Asal" defaultValue={food?.origin} placeholder="Contoh: Jawa Barat" maxLength={100} required />
          <TextAreaField id="food-description" name="description" label="Deskripsi" defaultValue={food?.description ?? ""} maxLength={2000} placeholder="Deskripsi singkat (opsional)" className="sm:col-span-2" />
        </div>
      </Card>

      <Card className="p-5 sm:p-7">
        <div className="mb-6"><h2 className="m-0 text-lg font-bold text-gray-950">Karakteristik makanan</h2><p className="mb-0 mt-1 text-sm text-secondary">Informasi opsional untuk katalog dan dataset fase mendatang.</p></div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <SelectField id="protein-type" name="proteinType" label="Protein Type" defaultValue={food?.proteinType ?? ""}><option value="">Belum ditentukan</option>{FOOD_PROTEINS.map((value) => <option key={value} value={value}>{value}</option>)}</SelectField>
          <SelectField id="price-category" name="priceCategory" label="Price Category" defaultValue={food?.priceCategory ?? ""}><option value="">Belum ditentukan</option>{FOOD_PRICE_CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}</SelectField>
          <SelectField id="meal-time" name="mealTime" label="Meal Time" defaultValue={food?.mealTime ?? ""}><option value="">Belum ditentukan</option>{FOOD_MEAL_TIMES.map((value) => <option key={value} value={value}>{value}</option>)}</SelectField>
          <SelectField id="texture" name="texture" label="Texture" defaultValue={food?.texture ?? ""}><option value="">Belum ditentukan</option>{FOOD_TEXTURES.map((value) => <option key={value} value={value}>{value}</option>)}</SelectField>
          <InputField id="health-level" name="healthLevel" label="Health Level" defaultValue={food?.healthLevel ?? ""} maxLength={80} placeholder="Opsional; label yang disepakati" />
          <InputField id="diet-category" name="dietCategory" label="Diet Category" defaultValue={food?.dietCategory ?? ""} maxLength={100} placeholder="Opsional" />
        </div>
        <p className="mb-0 mt-4 text-xs leading-5 text-secondary">Health Level bersifat opsional. Jangan isi klaim kesehatan atau gizi tanpa dasar.</p>
      </Card>

      <Card className="p-5 sm:p-7">
        <div className="mb-5"><h2 className="m-0 text-lg font-bold text-gray-950">Foto makanan</h2><p className="mb-0 mt-1 text-sm text-secondary">JPEG, PNG, atau WebP · maksimum 5 MB · opsional.</p></div>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="grid size-36 shrink-0 place-items-center overflow-hidden rounded-2xl border border-dashed border-border bg-gray-50">
            {preview ? <img src={preview} alt={`Preview ${food?.name ?? "makanan"}`} className="size-full object-cover" /> : <ImagePlus size={30} className="text-gray-400" aria-hidden="true" />}
          </div>
          <div className="space-y-3">
            <InputField
              ref={fileInput}
              id="food-image"
              name="image"
              label={imageFile ? "Ganti foto terpilih" : "Pilih foto"}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              onChange={(event) => onImageChange(event.currentTarget.files?.[0])}
              className="max-w-md"
            />
            {preview && <button type="button" onClick={clearImage} className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"><Trash2 size={14} aria-hidden="true" /> Hapus foto</button>}
            {removeImage && <p className="m-0 text-xs text-secondary">Foto akan dihapus saat perubahan disimpan.</p>}
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap justify-end gap-3">
        <ButtonLink href="/admin/foods" variant="secondary"><ArrowLeft size={16} aria-hidden="true" /> Batal</ButtonLink>
        <Button type="submit" loading={pending}><Save size={16} aria-hidden="true" />{mode === "create" ? "Simpan Makanan" : "Simpan Perubahan"}</Button>
      </div>
    </form>
  );
}
