import { z } from "zod";

const shortText = (max: number) => z.string().trim().min(1).max(max);
const longText = (max = 8_000) => z.string().trim().min(1).max(max);
const dateTime = z.string().datetime({ offset: true }).transform((value) => new Date(value));

const studyFields = {
  title: shortText(180),
  description: longText(),
  purpose: longText(),
  dataCollected: longText(),
  dataUse: longText(),
  withdrawalInstructions: longText(),
  consentVersion: shortText(40),
  consentDocument: longText(),
  contactName: shortText(120),
  contactEmail: z.string().trim().email().max(254),
  startsAt: dateTime,
  closesAt: dateTime,
  retentionUntil: dateTime,
  retentionPolicy: longText()
};

export const researchStudyInputSchema = z.object(studyFields).strict()
  .refine((value) => value.startsAt < value.closesAt, {
    path: ["closesAt"],
    message: "Tanggal penutupan harus setelah tanggal mulai."
  })
  .refine((value) => value.closesAt < value.retentionUntil, {
    path: ["retentionUntil"],
    message: "Batas retensi harus setelah tanggal penutupan."
  });

export const researchStudyUpdateSchema = z.object(studyFields).partial().strict()
  .refine((value) => Object.keys(value).length > 0, { message: "Minimal satu informasi penelitian harus diubah." })
  .refine((value) => !value.startsAt || !value.closesAt || value.startsAt < value.closesAt, {
    path: ["closesAt"],
    message: "Tanggal penutupan harus setelah tanggal mulai."
  })
  .refine((value) => !value.closesAt || !value.retentionUntil || value.closesAt < value.retentionUntil, {
    path: ["retentionUntil"],
    message: "Batas retensi harus setelah tanggal penutupan."
  });

export const researchConsentSchema = z.object({
  studyId: z.number().int().positive(),
  version: shortText(40),
  accepted: z.literal(true)
}).strict();

export const researchRatingSchema = z.object({
  studyId: z.number().int().positive(),
  foodId: z.number().int().positive(),
  rating: z.number().int().min(1).max(5),
  tried: z.literal(true),
  idempotencyKey: z.string().uuid()
}).strict();

export const researchStudyIdSchema = z.object({ studyId: z.number().int().positive() }).strict();

export function parseJsonBody(request: Request) {
  return request.json().catch(() => null);
}
