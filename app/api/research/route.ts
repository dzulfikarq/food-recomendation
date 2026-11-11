import { auth } from "@/lib/auth";
import { hasCurrentConsent, isCollectionOpen, publicStudyFields } from "@/lib/research/service";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const now = new Date();
  const study = await prisma.researchStudy.findFirst({
    where: { status: "OPEN" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }]
  });
  const session = await auth.api.getSession({ headers: request.headers });
  let participation = null;

  if (study && session?.user.role === "USER") {
    const participant = await prisma.researchParticipant.findUnique({
      where: { studyId_userId: { studyId: study.id, userId: Number(session.user.id) } },
      include: { consents: { where: { version: study.consentVersion }, take: 1 }, _count: { select: { ratings: true } } }
    });
    if (participant) {
      const consent = await hasCurrentConsent(prisma, participant.id, study.consentVersion);
      participation = {
        participantId: participant.id,
        status: participant.status,
        consented: Boolean(consent),
        acceptedAt: consent?.acceptedAt ?? null,
        ratingCount: participant._count.ratings
      };
    }
  }

  return Response.json({
    data: {
      study: study ? publicStudyFields(study) : null,
      collectionAvailable: study ? isCollectionOpen(study, now) : false,
      participation
    }
  }, { headers: { "Cache-Control": "no-store" } });
}
