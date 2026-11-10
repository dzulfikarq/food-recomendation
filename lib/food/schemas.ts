import { z } from "zod";
import {
  FOOD_PAGE_SIZE,
  FOOD_CATEGORIES,
  FOOD_MEAL_TIMES,
  FOOD_PRICE_CATEGORIES,
  FOOD_PROTEINS,
  FOOD_TASTES,
  FOOD_TEXTURES
} from "@/lib/food/constants";

const optionalText = (max: number) => z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? null : value,
  z.string().trim().max(max).nullable().optional()
).transform((value) => value ?? null);

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) => z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? null : value,
  z.enum(values).nullable().optional()
).transform((value) => value ?? null);

export const foodCreateSchema = z.object({
  foodCode: z.string().trim().toUpperCase().min(3).max(64).regex(/^[A-Z0-9][A-Z0-9_-]*$/, "Kode hanya boleh berisi huruf, angka, _ dan -."),
  name: z.string().trim().min(1, "Nama makanan wajib diisi.").max(180),
  description: optionalText(2000),
  category: z.enum(FOOD_CATEGORIES),
  taste: z.enum(FOOD_TASTES),
  healthLevel: optionalText(80),
  origin: z.string().trim().min(1, "Asal makanan wajib diisi.").max(100),
  proteinType: optionalEnum(FOOD_PROTEINS),
  priceCategory: optionalEnum(FOOD_PRICE_CATEGORIES),
  mealTime: optionalEnum(FOOD_MEAL_TIMES),
  dietCategory: optionalText(100),
  texture: optionalEnum(FOOD_TEXTURES)
});

export const foodUpdateSchema = foodCreateSchema.omit({ foodCode: true }).partial().refine(
  (data) => Object.keys(data).length > 0,
  "Setidaknya satu field harus diubah."
);

export const foodListQuerySchema = z.object({
  search: z.string().trim().max(120).default(""),
  status: z.enum(["all", "active", "inactive"]).default("all"),
  category: z.enum(FOOD_CATEGORIES).optional(),
  sort: z.enum(["newest", "oldest", "name-asc", "name-desc"]).default("newest"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(FOOD_PAGE_SIZE)
});

export const foodStatusSchema = z.object({ isActive: z.boolean() });

export const ratingInputSchema = z.object({ rating: z.number().int().min(1).max(5) });

export const publicFoodQuerySchema = z.object({
  search: z.string().trim().max(120).default(""),
  category: z.enum(FOOD_CATEGORIES).optional(),
  ratingStatus: z.enum(["all", "unrated", "rated"]).default("all"),
  sort: z.enum(["newest", "oldest", "name-asc", "name-desc"]).default("newest"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(24).default(12)
});

export const myRatingsQuerySchema = z.object({ page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20) });

export type FoodCreateInput = z.infer<typeof foodCreateSchema>;
export type FoodUpdateInput = z.infer<typeof foodUpdateSchema>;
export type FoodListQuery = z.infer<typeof foodListQuerySchema>;
export type PublicFoodQuery = z.infer<typeof publicFoodQuerySchema>;
