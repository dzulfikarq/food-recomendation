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
    const errorCode = error && typeof error === "object" && "code" in error ? error.code : undefined;
    const failureCode = typeof errorCode === "string" && /^[A-Z0-9_]{1,32}$/.test(errorCode)
      ? errorCode
      : error instanceof Error && error.message === "Production research exports require an absolute FOODREC_STORAGE_DIR."
        ? "STORAGE_CONFIG_INVALID"
        : error instanceof Error && error.message === "Research exports cannot be stored inside the public directory."
          ? "STORAGE_PATH_PUBLIC"
          : "UNCLASSIFIED";
    console.error(JSON.stringify({ event: "research_export_failed", route: "/api/admin/research/studies/[id]/exports", failureCode, errorType: error instanceof Error ? error.name : "UnknownError" }));
    return apiError(409, "RESEARCH_EXPORT_FAILED", "Ekspor snapshot tidak berhasil. Coba lagi.");
  }
}
