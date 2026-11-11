import assert from "node:assert/strict";
import test from "node:test";
import { researchConsentSchema, researchRatingSchema, researchStudyInputSchema, researchStudyUpdateSchema } from "@/lib/research/schemas";

const validStudy = {
  title: "Studi preferensi makanan",
  description: "Penjelasan singkat studi.",
  purpose: "Tujuan penelitian.",
  dataCollected: "Rating makanan 1–5.",
  dataUse: "Analisis skripsi.",
  withdrawalInstructions: "Hubungi penanggung jawab.",
  consentVersion: "v1",
  consentDocument: "Saya setuju secara sukarela.",
  contactName: "Penanggung Jawab",
  contactEmail: "research@example.test",
  startsAt: "2026-11-12T00:00:00.000Z",
  closesAt: "2026-12-12T00:00:00.000Z",
  retentionUntil: "2027-12-12T00:00:00.000Z",
  retentionPolicy: "Retensi satu tahun setelah studi ditutup, lalu tinjau dan hapus data teridentifikasi."
};

test("research study schema requires complete consent configuration and ordered dates", () => {
  assert.equal(researchStudyInputSchema.safeParse(validStudy).success, true);
  assert.equal(researchStudyInputSchema.safeParse({ ...validStudy, consentDocument: " " }).success, false);
  assert.equal(researchStudyInputSchema.safeParse({ ...validStudy, closesAt: validStudy.startsAt }).success, false);
  assert.equal(researchStudyInputSchema.safeParse({ ...validStudy, retentionUntil: validStudy.closesAt }).success, false);
  assert.equal(researchStudyInputSchema.safeParse({ ...validStudy, extra: "unexpected" }).success, false);
});

test("partial research study update accepts one date but rejects inverted range and empty patch", () => {
  assert.equal(researchStudyUpdateSchema.safeParse({ closesAt: validStudy.closesAt }).success, true);
  assert.equal(researchStudyUpdateSchema.safeParse({ startsAt: validStudy.closesAt, closesAt: validStudy.startsAt }).success, false);
  assert.equal(researchStudyUpdateSchema.safeParse({ closesAt: validStudy.retentionUntil, retentionUntil: validStudy.closesAt }).success, false);
  assert.equal(researchStudyUpdateSchema.safeParse({}).success, false);
});

test("research consent requires explicit affirmative acceptance", () => {
  assert.equal(researchConsentSchema.safeParse({ studyId: 1, version: "v1", accepted: true }).success, true);
  assert.equal(researchConsentSchema.safeParse({ studyId: 1, version: "v1", accepted: false }).success, false);
});

test("research rating validates 1–5, tasted-food attestation, and idempotency key", () => {
  const valid = { studyId: 1, foodId: 12, rating: 5, tried: true, idempotencyKey: "d4d59837-92bf-4db8-8747-930c4d2ff83f" };
  assert.equal(researchRatingSchema.safeParse(valid).success, true);
  assert.equal(researchRatingSchema.safeParse({ ...valid, rating: 6 }).success, false);
  assert.equal(researchRatingSchema.safeParse({ ...valid, tried: false }).success, false);
  assert.equal(researchRatingSchema.safeParse({ ...valid, idempotencyKey: "not-a-uuid" }).success, false);
});
