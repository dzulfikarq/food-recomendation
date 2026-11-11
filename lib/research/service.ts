import "server-only";
import type { Prisma, ResearchStudy } from "@/generated/prisma/client";

export function isCollectionOpen(study: Pick<ResearchStudy, "status" | "startsAt" | "closesAt">, now = new Date()) {
  return study.status === "OPEN" && study.startsAt <= now && study.closesAt > now;
}

export async function lockResearchStudy(tx: Prisma.TransactionClient, studyId: number) {
  const rows = await tx.$queryRaw<Array<{ id: number }>>`
    SELECT "id" FROM "ResearchStudy" WHERE "id" = ${studyId} FOR UPDATE
  `;
  if (!rows[0]) return null;
  return tx.researchStudy.findUnique({ where: { id: studyId } });
}

export async function hasCurrentConsent(tx: Prisma.TransactionClient, participantId: number, version: string) {
  const consent = await tx.researchConsent.findUnique({
    where: { participantId_version: { participantId, version } },
    select: { id: true, acceptedAt: true, revokedAt: true }
  });
  return consent && !consent.revokedAt ? consent : null;
}

export function publicStudyFields(study: ResearchStudy) {
  return {
    id: study.id,
    title: study.title,
    description: study.description,
    purpose: study.purpose,
    dataCollected: study.dataCollected,
    dataUse: study.dataUse,
    withdrawalInstructions: study.withdrawalInstructions,
    consentVersion: study.consentVersion,
    consentDocument: study.consentDocument,
    contactName: study.contactName,
    contactEmail: study.contactEmail,
    startsAt: study.startsAt,
    closesAt: study.closesAt,
    retentionUntil: study.retentionUntil,
    retentionPolicy: study.retentionPolicy,
    status: study.status
  };
}
