import { z } from "zod";
import { apiError, requireAdminRequest, validationError } from "@/lib/food/http";
import { prisma } from "@/lib/prisma";

const configurationSchema = z.object({
  kNeighbors: z.number().int().min(1).max(100).optional(),
  topN: z.number().int().min(1).max(100).optional(),
  scheduleIntervalMinutes: z.number().int().min(1).max(10_080).optional()
}).strict().refine((value) => Object.keys(value).length > 0, "At least one setting is required.");

function configurationResponse(config: Awaited<ReturnType<typeof prisma.recommendationEngineConfig.findUniqueOrThrow>>) {
  return {
    autoProcessingEnabled: config.autoProcessingEnabled,
    automaticPublicationEnabled: config.automaticPublicationEnabled,
    kNeighbors: config.kNeighbors,
    topN: config.topN,
    scheduleIntervalMinutes: config.scheduleIntervalMinutes,
    engineVersion: config.engineVersion,
    lastSuccessfulProcessingAt: config.lastSuccessfulProcessingAt,
    validationStatus: config.validationStatus,
    parameterDefaultsAreResearchOptimized: false,
    automationBlockedReasons: [
      "AUTO_PROCESSING_DISABLED",
      "MATHEMATICAL_PARITY_PENDING_VALIDATION",
      "AUTOMATIC_PUBLICATION_DISABLED"
    ]
  };
}

export async function GET(request: Request) {
  const authorization = await requireAdminRequest(request);
  if (!authorization.user) return authorization.response;
  const config = await prisma.recommendationEngineConfig.findUniqueOrThrow({ where: { id: 1 } });
  return Response.json({ data: configurationResponse(config) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const authorization = await requireAdminRequest(request);
  if (!authorization.user) return authorization.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_REQUEST", "Request body is invalid.");
  }
  const parsed = configurationSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const config = await prisma.recommendationEngineConfig.update({
    where: { id: 1 },
    data: parsed.data
  });
  return Response.json({ data: configurationResponse(config) }, { headers: { "Cache-Control": "no-store" } });
}
