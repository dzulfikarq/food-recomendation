import { Prisma } from "@/generated/prisma/client";
import { FOOD_PAGE_SIZE } from "@/lib/food/constants";
import type { FoodListQuery, PublicFoodQuery } from "@/lib/food/schemas";
import { prisma } from "@/lib/prisma";

const orderBy: Record<FoodListQuery["sort"], Prisma.FoodOrderByWithRelationInput> = {
  newest: { createdAt: "desc" },
  oldest: { createdAt: "asc" },
  "name-asc": { name: "asc" },
  "name-desc": { name: "desc" }
};

export async function listFoods(query: FoodListQuery) {
  const where: Prisma.FoodWhereInput = {};
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { foodCode: { contains: query.search, mode: "insensitive" } }
    ];
  }
  if (query.status === "active") where.isActive = true;
  if (query.status === "inactive") where.isActive = false;
  if (query.category) where.category = query.category;

  const [foods, total] = await Promise.all([
    prisma.food.findMany({
      where,
      orderBy: orderBy[query.sort],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { _count: { select: { ratings: true, recommendations: true } } }
    }),
    prisma.food.count({ where })
  ]);

  return {
    foods,
    pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) },
    filters: { search: query.search, status: query.status, category: query.category, sort: query.sort }
  };
}

export async function listPublicFoods(query: PublicFoodQuery, userId?: number | null) {
  const where: Prisma.FoodWhereInput = { isActive: true };
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { foodCode: { contains: query.search, mode: "insensitive" } }
    ];
  }
  if (query.category) where.category = query.category;
  if (query.tag) where.tags = { array_contains: [query.tag] };
  if (userId && query.ratingStatus === "rated") where.ratings = { some: { userId } };
  if (userId && query.ratingStatus === "unrated") where.ratings = { none: { userId } };

  const [foods, total] = await Promise.all([
    prisma.food.findMany({
      where,
      orderBy: orderBy[query.sort],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true, foodCode: true, name: true, description: true, category: true, taste: true,
        healthLevel: true, origin: true, proteinType: true, priceCategory: true, mealTime: true,
        dietCategory: true, texture: true, imageUrl: true, minutes: true, tags: true
      }
    }),
    prisma.food.count({ where })
  ]);

  return {
    foods: foods.map((food) => ({
      ...food,
      tags: Array.isArray(food.tags) ? food.tags.filter((tag): tag is string => typeof tag === "string") : []
    })),
    pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) }
  };
}

export const defaultFoodPageSize = FOOD_PAGE_SIZE;
