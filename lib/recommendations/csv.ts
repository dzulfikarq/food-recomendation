import { parse } from "csv-parse/sync";
import { MAX_RECOMMENDATION_CSV_ROWS } from "@/lib/recommendations/constants";

export type RecommendationCsvError = { row: number; field?: string; message: string };
export type ParsedRecommendationRow = { row: number; userId: number; itemId: number; rank: number };
export type ParsedRatingRow = { userId: number; foodId: number; rating: number };

type CsvRecord = { record: string[]; info?: { lines?: number } };

function parseRecords(buffer: Buffer): { records: CsvRecord[] } | { error: RecommendationCsvError } {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return { records: parse(text, { bom: true, columns: false, info: true, skip_empty_lines: false, relax_column_count: false, relax_quotes: false, trim: true }) as unknown as CsvRecord[] };
  } catch (error) {
    const lines = error && typeof error === "object" && "lines" in error ? Number(error.lines) : 1;
    return { error: { row: Number.isSafeInteger(lines) && lines > 0 ? lines : 1, message: error instanceof Error ? error.message : "CSV tidak valid atau bukan UTF-8." } };
  }
}

function positiveInteger(value: string) {
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function lineOf(record: CsvRecord, fallback: number) {
  return record.info?.lines && record.info.lines > 0 ? record.info.lines : fallback;
}

export function parseRecommendationCsv(buffer: Buffer, topN: number) {
  const parsed = parseRecords(buffer);
  if ("error" in parsed) return { rows: [] as ParsedRecommendationRow[], errors: [parsed.error], totalRows: 0 };
  const [header, ...records] = parsed.records;
  const expected = ["user_id", "item_id", "rank"];
  if (!header || header.record.length !== expected.length || header.record.some((field, index) => field !== expected[index])) {
    return { rows: [] as ParsedRecommendationRow[], totalRows: 0, errors: [{ row: 1, message: `Header harus persis: ${expected.join(",")}` }] };
  }

  const rows: ParsedRecommendationRow[] = [];
  const errors: RecommendationCsvError[] = [];
  const pairs = new Map<string, number>();
  const ranks = new Map<string, number>();
  const byUser = new Map<number, ParsedRecommendationRow[]>();
  let totalRows = 0;
  let previousLine = lineOf(header, 1);

  for (const record of records) {
    const line = previousLine + 1;
    previousLine = lineOf(record, line);
    if (record.record.every((value) => value.trim() === "")) continue;
    totalRows++;
    if (record.record.length !== expected.length) {
      errors.push({ row: line, message: `Jumlah kolom harus ${expected.length}.` });
      continue;
    }
    const [rawUserId, rawItemId, rawRank] = record.record;
    const userId = positiveInteger(rawUserId!);
    const itemId = positiveInteger(rawItemId!);
    const rank = positiveInteger(rawRank!);
    let valid = true;
    for (const [field, value] of [["user_id", userId], ["item_id", itemId], ["rank", rank]] as const) {
      if (value === null) {
        errors.push({ row: line, field, message: "Nilai harus berupa integer positif." });
        valid = false;
      }
    }
    if (!valid) continue;

    const row = { row: line, userId: userId!, itemId: itemId!, rank: rank! };
    const pairKey = `${row.userId}:${row.itemId}`;
    const rankKey = `${row.userId}:${row.rank}`;
    if (pairs.has(pairKey)) errors.push({ row: line, field: "item_id", message: `Pasangan user-item duplikat; baris pertama ${pairs.get(pairKey)}.` });
    else pairs.set(pairKey, line);
    if (ranks.has(rankKey)) errors.push({ row: line, field: "rank", message: `Rank duplikat untuk user ini; baris pertama ${ranks.get(rankKey)}.` });
    else ranks.set(rankKey, line);
    if (row.rank > topN) errors.push({ row: line, field: "rank", message: `Rank tidak boleh melebihi Top-N (${topN}).` });
    rows.push(row);
    byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);
  }

  if (totalRows === 0) errors.push({ row: 2, message: "CSV harus memiliki setidaknya satu baris rekomendasi." });
  if (totalRows > MAX_RECOMMENDATION_CSV_ROWS) errors.push({ row: 0, message: `Maksimum ${MAX_RECOMMENDATION_CSV_ROWS} baris rekomendasi per file.` });
  for (const [userId, userRows] of byUser) {
    const ordered = [...userRows].sort((left, right) => left.rank - right.rank);
    if (ordered.length > topN) errors.push({ row: ordered[topN]!.row, field: "rank", message: `User ${userId} memiliki lebih dari Top-N (${topN}) rekomendasi.` });
    ordered.forEach((row, index) => {
      if (row.rank !== index + 1) errors.push({ row: row.row, field: "rank", message: `Rank untuk user ${userId} harus berurutan mulai dari 1.` });
    });
  }

  return { rows, errors, totalRows };
}

export function parseRatingSnapshotCsv(buffer: Buffer, expectedRows: number) {
  const parsed = parseRecords(buffer);
  if ("error" in parsed) return { rows: [] as ParsedRatingRow[], errors: [parsed.error] };
  const [header, ...records] = parsed.records;
  const expected = ["user_id", "food_id", "rating"];
  if (!header || header.record.length !== expected.length || header.record.some((field, index) => field !== expected[index])) {
    return { rows: [] as ParsedRatingRow[], errors: [{ row: 1, message: `Header sumber harus persis: ${expected.join(",")}` }] };
  }

  const rows: ParsedRatingRow[] = [];
  const errors: RecommendationCsvError[] = [];
  const pairs = new Set<string>();
  let previousLine = lineOf(header, 1);
  for (const record of records) {
    const line = previousLine + 1;
    previousLine = lineOf(record, line);
    if (record.record.every((value) => value.trim() === "")) continue;
    if (record.record.length !== expected.length) {
      errors.push({ row: line, message: `Snapshot sumber harus memiliki ${expected.length} kolom.` });
      continue;
    }
    const [rawUserId, rawFoodId, rawRating] = record.record;
    const userId = positiveInteger(rawUserId!);
    const foodId = positiveInteger(rawFoodId!);
    const rating = positiveInteger(rawRating!);
    if (!userId) errors.push({ row: line, field: "user_id", message: "ID user snapshot tidak valid." });
    if (!foodId) errors.push({ row: line, field: "food_id", message: "ID makanan snapshot tidak valid." });
    if (!rating || rating > 5) errors.push({ row: line, field: "rating", message: "Rating snapshot harus integer 1–5." });
    if (!userId || !foodId || !rating || rating > 5) continue;
    const key = `${userId}:${foodId}`;
    if (pairs.has(key)) errors.push({ row: line, field: "food_id", message: "Pasangan user-food duplikat pada snapshot." });
    pairs.add(key);
    rows.push({ userId, foodId, rating });
  }
  if (rows.length !== expectedRows) errors.push({ row: 0, message: "Jumlah baris snapshot tidak cocok dengan metadata dataset." });
  return { rows, errors };
}
