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
    schedulerLastCheckedAt: config.schedulerLastCheckedAt,
    nextScheduleAt: config.nextScheduleAt,
    lastSchedulerReason: config.lastSchedulerReason,
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
  const [config, dataset, jobCounts, workers] = await Promise.all([
    prisma.recommendationEngineConfig.findUniqueOrThrow({ where: { id: 1 } }),
    prisma.ratingDatasetState.findUniqueOrThrow({ where: { id: 1 } }),
    prisma.recommendationJob.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.recommendationWorker.findMany({ orderBy: { lastSeenAt: "desc" }, take: 20 })
  ]);
  const jobs = { pending: 0, running: 0, failed: 0 };
  for (const item of jobCounts) {
    if (item.status === "PENDING") jobs.pending = item._count._all;
    if (item.status === "RUNNING") jobs.running = item._count._all;
    if (item.status === "FAILED") jobs.failed = item._count._all;
  }
  const now = Date.now();
  return Response.json({
    data: {
      configuration: configurationResponse(config),
      validationGate: {
        status: config.validationStatus,
        open: false,
        reasons: ["MATHEMATICAL_PARITY_PENDING_VALIDATION", "AUTO_PROCESSING_DISABLED", "AUTOMATIC_PUBLICATION_DISABLED"]
      },
      dataset: {
        currentRevision: dataset.currentRevision.toString(),
        processedRevision: dataset.processedRevision.toString(),
        dirty: dataset.currentRevision > dataset.processedRevision,
        lastRatingChangedAt: dataset.lastRatingChangedAt
      },
      scheduler: {
        lastCheckedAt: config.schedulerLastCheckedAt,
        nextCheckAt: config.nextScheduleAt,
        lastOutcome: config.lastSchedulerReason
      },
      jobs,
      workers: workers.map((worker) => ({
        workerId: worker.workerId,
        engineVersion: worker.engineVersion,
        lastSeenAt: worker.lastSeenAt,
        online: worker.lastSeenAt.getTime() >= now - 90_000
      }))
    }
  }, { headers: { "Cache-Control": "no-store" } });
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
    data: { ...parsed.data, nextScheduleAt: new Date() }
  });
  return Response.json({ data: configurationResponse(config) }, { headers: { "Cache-Control": "no-store" } });
}
