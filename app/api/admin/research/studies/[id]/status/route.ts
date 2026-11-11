import { z } from "zod";
import { apiError, parseFoodId, requireAdminRequest, validationError } from "@/lib/food/http";
import { parseJsonBody } from "@/lib/research/schemas";
import { lockResearchStudy } from "@/lib/research/service";
import { isUniqueViolation } from "@/lib/food/http";
import { prisma } from "@/lib/prisma";

const statusSchema = z.object({ status: z.enum(["OPEN", "CLOSED", "ARCHIVED"]) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await requireAdminRequest(request);
  if (!authorization.user) return authorization.response;
  const id = parseFoodId((await params).id);
  if (!id) return apiError(400, "INVALID_STUDY_ID", "ID penelitian tidak valid.");
  const parsed = statusSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return validationError(parsed.error);

  try {
    const study = await prisma.$transaction(async (tx) => {
      const current = await lockResearchStudy(tx, id);
      if (!current) return { error: "STUDY_NOT_FOUND" as const };
      const target = parsed.data.status;
      if (target === "OPEN") {
        if (current.status !== "DRAFT") return { error: "INVALID_TRANSITION" as const };
        const complete = [current.title, current.description, current.purpose, current.dataCollected, current.dataUse,
          current.withdrawalInstructions, current.consentVersion, current.consentDocument, current.contactName, current.contactEmail]
          .every((value) => value.trim().length > 0);
        const now = new Date();
        if (!complete || !current.retentionUntil || !current.retentionPolicy?.trim() || current.retentionUntil <= current.closesAt || current.startsAt > now || current.closesAt <= now) return { error: "STUDY_NOT_READY" as const };
      } else if (target === "CLOSED") {
        if (current.status !== "OPEN") return { error: "INVALID_TRANSITION" as const };
      } else if (current.status !== "CLOSED") {
        return { error: "INVALID_TRANSITION" as const };
      }
      return tx.researchStudy.update({ where: { id }, data: { status: target } });
    }, { isolationLevel: "Serializable" });

    if ("error" in study) {
      if (study.error === "STUDY_NOT_FOUND") return apiError(404, study.error, "Penelitian tidak ditemukan.");
      if (study.error === "STUDY_NOT_READY") return apiError(422, study.error, "Lengkapi semua konfigurasi, teks dan versi persetujuan, kebijakan retensi, serta tanggal; periode pengumpulan harus aktif.");
      return apiError(409, study.error, "Perubahan status penelitian tidak diizinkan.");
    }
    return Response.json({ data: study, message: `Status penelitian menjadi ${study.status}.` }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isUniqueViolation(error)) return apiError(409, "ACTIVE_STUDY_EXISTS", "Tutup penelitian OPEN lain sebelum membuka penelitian ini.");
    return apiError(409, "STUDY_STATUS_FAILED", "Status penelitian tidak dapat diubah.");
  }
}
