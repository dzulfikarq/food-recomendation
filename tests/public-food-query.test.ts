import assert from "node:assert/strict";
import test from "node:test";
import { publicFoodQuerySchema } from "@/lib/food/schemas";

test("public catalog search accepts empty category from the all-categories option", () => {
  const result = publicFoodQuerySchema.safeParse({ search: "Nasi Goreng", category: "", ratingStatus: "rated" });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.category, undefined);
});
