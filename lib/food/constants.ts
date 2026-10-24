export const FOOD_CATEGORIES = ["Makanan Berat", "Camilan", "Minuman", "Dessert"] as const;
export const FOOD_TASTES = ["Gurih", "Pedas", "Manis", "Asin", "Asam", "Pahit", "Umami"] as const;
export const FOOD_PROTEINS = ["Ayam", "Sapi", "Kambing", "Ikan", "Udang", "Telur", "Tahu/Tempe", "Lainnya"] as const;
export const FOOD_PRICE_CATEGORIES = ["Murah", "Sedang", "Mahal"] as const;
export const FOOD_MEAL_TIMES = ["Sarapan", "Siang", "Malam", "Kapan Saja"] as const;
export const FOOD_TEXTURES = ["Renyah", "Lembut", "Kenyal", "Berkuah", "Kering", "Lainnya"] as const;

export const FOOD_PAGE_SIZE = 10;
export const MAX_FOOD_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_FOOD_CSV_BYTES = 2 * 1024 * 1024;
export const MAX_FOOD_CSV_ROWS = 1000;

export const FOOD_CSV_HEADERS = [
  "food_code",
  "name",
  "description",
  "category",
  "taste",
  "origin",
  "protein_type",
  "price_category",
  "meal_time",
  "texture",
  "health_level",
  "diet_category"
] as const;

export const FOOD_CSV_TEMPLATE = [
  FOOD_CSV_HEADERS.join(","),
  'FOOD-001,Nasi Goreng,"Nasi goreng dengan telur",Makanan Berat,Gurih,Indonesia,Telur,Sedang,Malam,Kering,,',
  'FOOD-002,Es Cendol,"Minuman cendol santan",Minuman,Manis,Jawa,,Murah,Kapan Saja,,,'
].join("\r\n") + "\r\n";
