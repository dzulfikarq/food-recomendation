import assert from "node:assert/strict";
import test from "node:test";
import { publicFoodQuerySchema } from "@/lib/food/schemas";

test("public catalog search accepts empty category from the all-categories option", () => {
  const result = publicFoodQuerySchema.safeParse({ search: "Nasi Goreng", category: "", ratingStatus: "rated" });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.category, undefined);
});

test("public catalog recipe-tag filter trims values and treats blank input as unset", () => {
  const selected = publicFoodQuerySchema.safeParse({ tag: "  quick meal  " });
  assert.equal(selected.success, true);
  if (selected.success) assert.equal(selected.data.tag, "quick meal");
  const blank = publicFoodQuerySchema.safeParse({ tag: "   " });
  assert.equal(blank.success, true);
  if (blank.success) assert.equal(blank.data.tag, undefined);
});
