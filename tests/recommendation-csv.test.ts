import assert from "node:assert/strict";
import test from "node:test";
import { parseRatingSnapshotCsv, parseRecommendationCsv } from "@/lib/recommendations/csv";

test("recommendation CSV accepts exact UTF-8 header and ordered integer ranks", () => {
  const csv = "\uFEFFuser_id,item_id,rank\r\n2,106,1\r\n1,105,2\r\n1,104,1\r\n";
  const result = parseRecommendationCsv(Buffer.from(csv), 2);
  assert.deepEqual(result.errors, []);
  assert.equal(result.totalRows, 3);
  assert.deepEqual(result.rows.map(({ userId, itemId, rank }) => [userId, itemId, rank]), [[2, 106, 1], [1, 105, 2], [1, 104, 1]]);
});

test("recommendation CSV rejects extra/wrong headers and invalid positive integers with row numbers", () => {
  assert.equal(parseRecommendationCsv(Buffer.from("userId,item_id,rank\n1,2,1\n"), 2).errors[0]?.row, 1);
  const result = parseRecommendationCsv(Buffer.from("user_id,item_id,rank\n0,2,1\n1,2.5,1\n2,3,0\n"), 2);
  assert.deepEqual(result.errors.map(({ row, field }) => [row, field]), [[2, "user_id"], [3, "item_id"], [4, "rank"]]);
});

test("recommendation CSV rejects duplicate pairs, duplicate ranks, gaps, and rows above Top-N", () => {
  const duplicate = parseRecommendationCsv(Buffer.from("user_id,item_id,rank\n1,10,1\n1,10,1\n"), 2);
  assert.ok(duplicate.errors.some(({ field, message }) => field === "item_id" && message.includes("duplikat")));
  assert.ok(duplicate.errors.some(({ field, message }) => field === "rank" && message.includes("duplikat")));

  const gap = parseRecommendationCsv(Buffer.from("user_id,item_id,rank\n1,10,1\n1,11,3\n"), 3);
  assert.ok(gap.errors.some(({ field, message }) => field === "rank" && message.includes("berurutan")));

  const overTopN = parseRecommendationCsv(Buffer.from("user_id,item_id,rank\n1,10,1\n1,11,2\n"), 1);
  assert.ok(overTopN.errors.some(({ message }) => message.includes("Top-N")));
});

test("rating snapshot parser checks exact contract, positive IDs, unique pairs, and metadata row count", () => {
  const valid = parseRatingSnapshotCsv(Buffer.from("user_id,food_id,rating\n1,10,5\n2,11,3\n"), 2);
  assert.deepEqual(valid.errors, []);
  assert.equal(valid.rows.length, 2);

  const invalid = parseRatingSnapshotCsv(Buffer.from("user_id,food_id,rating\n1,10,5\n1,10,4\n0,11,6\n"), 3);
  assert.ok(invalid.errors.some(({ message }) => message.includes("duplikat")));
  assert.ok(invalid.errors.some(({ field }) => field === "user_id"));
  assert.ok(invalid.errors.some(({ field }) => field === "rating"));
  assert.ok(invalid.errors.some(({ row }) => row === 0));
});
