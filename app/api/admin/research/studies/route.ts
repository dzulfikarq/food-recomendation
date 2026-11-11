import { apiError, requireAdminRequest, validationError } from "@/lib/food/http";
import { parseJsonBody, researchStudyInputSchema } from "@/lib/research/schemas";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const authorization = await requireAdminRequest(request);
  if (!authorization.user) return authorization.response;
  const studies = await prisma.researchStudy.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true, title: true, description: true, purpose: true, dataCollected: true, dataUse: true,
      withdrawalInstructions: true, consentVersion: true, consentDocument: true, contactName: true,
      contactEmail: true, startsAt: true, closesAt: true, retentionUntil: true, retentionPolicy: true, status: true, createdAt: true,
      _count: { select: { participants: true, exports: true } }
    }
  });
  return Response.json({ data: { studies } }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const authorization = await requireAdminRequest(request);
  if (!authorization.user) return authorization.response;
  const parsed = researchStudyInputSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return validationError(parsed.error);
  const adminId = Number(authorization.user.id);
  if (!Number.isSafeInteger(adminId) || adminId < 1) return apiError(401, "INVALID_ADMIN", "Akun administrator tidak valid.");
  const study = await prisma.researchStudy.create({ data: { ...parsed.data, createdByAdminId: adminId } });
  return Response.json({ data: study, message: "Penelitian disimpan sebagai draft." }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
