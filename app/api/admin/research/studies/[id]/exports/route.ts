import { apiError, parseFoodId, requireAdminRequest } from "@/lib/food/http";
import { createResearchExport, EmptyResearchDatasetError } from "@/lib/research/export";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await requireAdminRequest(request);
  if (!authorization.user) return authorization.response;
  const studyId = parseFoodId((await params).id);
  const adminId = Number(authorization.user.id);
  if (!studyId) return apiError(400, "INVALID_STUDY_ID", "ID penelitian tidak valid.");
  if (!Number.isSafeInteger(adminId) || adminId < 1) return apiError(401, "INVALID_ADMIN", "Akun administrator tidak valid.");

  try {
    const dataset = await createResearchExport(studyId, adminId);
    return Response.json({ data: dataset, message: "Snapshot penelitian immutable berhasil dibuat." }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof EmptyResearchDatasetError) return apiError(409, "EMPTY_RESEARCH_DATASET", error.message);
    if (error instanceof Error && error.message === "STUDY_NOT_EXPORTABLE") return apiError(409, "STUDY_NOT_EXPORTABLE", "Draft penelitian belum dapat diekspor.");
    return apiError(409, "RESEARCH_EXPORT_FAILED", "Ekspor snapshot tidak berhasil. Coba lagi.");
  }
}
