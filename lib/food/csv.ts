import { parse } from "csv-parse/sync";
import { FOOD_CSV_HEADERS } from "@/lib/food/constants";
import { foodCreateSchema, type FoodCreateInput } from "@/lib/food/schemas";

export type FoodCsvError = { row: number; field?: string; message: string };
export type ParsedFoodCsvRow = { row: number; data: FoodCreateInput };

export function parseFoodCsv(buffer: Buffer): { rows: ParsedFoodCsvRow[]; errors: FoodCsvError[]; totalRows: number } {
  let records: string[][];
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    records = parse(text, {
      bom: true,
      columns: false,
      skip_empty_lines: false,
      relax_column_count: false,
      relax_quotes: false,
      trim: true
    }) as string[][];
  } catch (error) {
    const line = error && typeof error === "object" && "lines" in error ? Number(error.lines) : 1;
    return { rows: [], totalRows: 0, errors: [{ row: Number.isSafeInteger(line) && line > 0 ? line : 1, message: error instanceof Error ? error.message : "CSV tidak valid atau bukan UTF-8." }] };
  }

  const header = records[0];
  if (!header || header.length !== FOOD_CSV_HEADERS.length || header.some((column, index) => column !== FOOD_CSV_HEADERS[index])) {
    return {
      rows: [],
      totalRows: 0,
      errors: [{ row: 1, message: `Header harus persis: ${FOOD_CSV_HEADERS.join(",")}` }]
    };
  }

  const rows: ParsedFoodCsvRow[] = [];
  const errors: FoodCsvError[] = [];
  const codes = new Set<string>();
  let totalRows = 0;

  records.slice(1).forEach((record, index) => {
    const line = index + 2;
    if (record.every((value) => value.trim() === "")) return;
    totalRows++;

    if (record.length !== FOOD_CSV_HEADERS.length) {
      errors.push({ row: line, message: `Jumlah kolom harus ${FOOD_CSV_HEADERS.length}.` });
      return;
    }

    const input = Object.fromEntries(FOOD_CSV_HEADERS.map((column, columnIndex) => [column, record[columnIndex]]));
    const result = foodCreateSchema.safeParse({
      foodCode: input.food_code,
      name: input.name,
      description: input.description,
      category: input.category,
      taste: input.taste,
      origin: input.origin,
      proteinType: input.protein_type,
      priceCategory: input.price_category,
      mealTime: input.meal_time,
      texture: input.texture,
      healthLevel: input.health_level,
      dietCategory: input.diet_category
    });

    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({ row: line, field: String(issue.path[0] ?? ""), message: issue.message });
      }
      return;
    }

    if (codes.has(result.data.foodCode)) {
      errors.push({ row: line, field: "food_code", message: `Kode ${result.data.foodCode} duplikat di file.` });
      return;
    }
    codes.add(result.data.foodCode);
    rows.push({ row: line, data: result.data });
  });

  return { rows, errors, totalRows };
}
