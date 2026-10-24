import assert from "node:assert/strict";
import test from "node:test";
import { FOOD_CSV_HEADERS } from "@/lib/food/constants";
import { parseFoodCsv } from "@/lib/food/csv";
import { initialFoodCatalog } from "@/prisma/food-catalog";
import { foodCreateSchema } from "@/lib/food/schemas";

const header = FOOD_CSV_HEADERS.join(",");

test("CSV parser accepts BOM, quoted commas, and optional blank fields", () => {
  const csv = `\uFEFF${header}\r\nFOOD-901,"Nasi, Goreng",Deskripsi,Makanan Berat,Gurih,Indonesia,Telur,Sedang,Malam,Kering,,\r\n`;
  const result = parseFoodCsv(Buffer.from(csv, "utf8"));

  assert.equal(result.errors.length, 0);
  assert.equal(result.totalRows, 1);
  assert.equal(result.rows[0]?.data.name, "Nasi, Goreng");
  assert.equal(result.rows[0]?.data.healthLevel, null);
});

test("CSV parser reports strict header, row number, and in-file duplicate errors", () => {
  const badHeader = parseFoodCsv(Buffer.from("wrong,name\n"));
  assert.equal(badHeader.errors[0]?.row, 1);

  const row = "FOOD-901,Nasi Goreng,,Makanan Berat,Gurih,Indonesia,Telur,Sedang,Malam,Kering,,";
  const duplicate = parseFoodCsv(Buffer.from(`${header}\n${row}\n${row}\n`));
  assert.equal(duplicate.totalRows, 2);
  assert.equal(duplicate.errors.length, 1);
  assert.equal(duplicate.errors[0]?.row, 3);
});

test("CSV parser rejects invalid UTF-8 and invalid controlled values", () => {
  const invalidUtf8 = parseFoodCsv(Buffer.from([0xff, 0xfe, 0x00]));
  assert.equal(invalidUtf8.errors.length, 1);

  const invalidCategory = `FOOD-902,Test,,Unknown,Gurih,Indonesia,,,,,,,`;
  const invalid = parseFoodCsv(Buffer.from(`${header}\n${invalidCategory}\n`));
  assert.equal(invalid.errors.length > 0, true);
});

test("CSV syntax errors include parser line number", () => {
  const malformed = parseFoodCsv(Buffer.from(`${header}\nFOOD-903,"unterminated value\n`));
  assert.ok(malformed.errors[0]!.row >= 2);
});

test("initial catalog has 40 valid foods and unique stable codes", () => {
  assert.equal(initialFoodCatalog.length, 40);
  assert.equal(new Set(initialFoodCatalog.map((food) => food.foodCode)).size, initialFoodCatalog.length);
  for (const food of initialFoodCatalog) assert.equal(foodCreateSchema.safeParse(food).success, true, food.foodCode);
});

test("optional Food attributes may be omitted and normalize to null", () => {
  const parsed = foodCreateSchema.safeParse({ foodCode: "FOOD-900", name: "Optional fields", category: "Camilan", taste: "Gurih", origin: "Indonesia" });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.description, null);
    assert.equal(parsed.data.proteinType, null);
    assert.equal(parsed.data.healthLevel, null);
  }
});
