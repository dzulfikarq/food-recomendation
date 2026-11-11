import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { lockResearchStudy } from "@/lib/research/service";
import { removeResearchExport, saveResearchExport } from "@/lib/research/storage";
import { prisma } from "@/lib/prisma";

export class EmptyResearchDatasetError extends Error {}

export async function createResearchExport(studyId: number, adminId: number) {
  let filePath: string | undefined;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const study = await lockResearchStudy(tx, studyId);
      if (!study || study.status === "DRAFT") throw new Error("STUDY_NOT_EXPORTABLE");

      const participants = await tx.researchParticipant.findMany({
        where: {
          studyId,
          status: { in: ["ACTIVE", "COMPLETED"] },
          consents: { some: { version: study.consentVersion, revokedAt: null } },
          ratings: { some: { consentVersion: study.consentVersion, source: "CONSENTED_USER_ACTION" } }
        },
        orderBy: { id: "asc" },
        select: {
          id: true,
          ratings: { where: { consentVersion: study.consentVersion, source: "CONSENTED_USER_ACTION" }, orderBy: { foodId: "asc" }, select: { foodId: true, rating: true } }
        }
      });
      const contributing = participants.filter((participant) => participant.ratings.length > 0);
      const rows = contributing.flatMap((participant) => participant.ratings.map((rating) => [participant.id, rating.foodId, rating.rating] as const));
      if (!rows.length) throw new EmptyResearchDatasetError("Belum ada rating dengan persetujuan versi aktif untuk diekspor.");
      const versionRecord = await tx.researchExport.findFirst({ where: { studyId }, orderBy: { version: "desc" }, select: { version: true } });
      const version = (versionRecord?.version ?? 0) + 1;
      const foods = new Set(rows.map((row) => row[1]));
      const csv = ["user_id,food_id,rating", ...rows.map((row) => row.join(","))].join("\r\n") + "\r\n";
      const buffer = Buffer.from(csv, "utf8");
      const fileChecksum = createHash("sha256").update(buffer).digest("hex");
      const exportedAt = new Date();
      const manifest = {
        studyId,
        datasetVersion: version,
        participantCount: contributing.length,
        ratingCount: rows.length,
        foodCount: foods.size,
        exportedAt: exportedAt.toISOString(),
        sha256: fileChecksum,
        consentVersion: study.consentVersion,
        sourceStatus: "ResearchRating only; source=CONSENTED_USER_ACTION, submitted from authenticated USER accounts after current consent and explicit tried-food confirmation. Account holder identity and respondent eligibility are not independently verified by the app. No existing Rating, demo, synthetic fixture, or Altair export is imported.",
        retentionUntil: study.retentionUntil?.toISOString() ?? null,
        retentionPolicy: study.retentionPolicy,
        withdrawalHandling: "A withdrawal excludes participant ratings from future exports, flags prior exports, blocks their downloads, and requires explicit revocation review for stored and external copies."
      };
      filePath = await saveResearchExport(buffer);
      const filename = `foodrec-research-study-${studyId}-v${version}.csv`;
      const exportRecord = await tx.researchExport.create({
        data: {
          studyId, version, createdByAdminId: adminId, filename, filePath, fileChecksum,
          participantCount: contributing.length, ratingCount: rows.length, foodCount: foods.size,
          consentVersion: study.consentVersion, manifest, createdAt: exportedAt
        },
        select: { id: true, version: true, filename: true, fileChecksum: true, participantCount: true, ratingCount: true, foodCount: true, consentVersion: true, createdAt: true }
      });
      await tx.researchExportParticipant.createMany({ data: contributing.map((participant) => ({ exportId: exportRecord.id, participantId: participant.id })) });
      return exportRecord;
    }, { isolationLevel: "Serializable" });
    return result;
  } catch (error) {
    if (filePath) await removeResearchExport(filePath).catch(() => undefined);
    if (error instanceof EmptyResearchDatasetError) throw error;
    if (error instanceof Error && error.message === "STUDY_NOT_EXPORTABLE") throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") throw error;
    throw error;
  }
}
