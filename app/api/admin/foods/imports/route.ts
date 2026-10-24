import { z } from "zod";
import { requireAdminRequest, validationError } from "@/lib/food/http";
import { prisma } from "@/lib/prisma";

const historyQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10)
});

export async function GET(request: Request) {
  const authorization = await requireAdminRequest(request);
  if (!authorization.user) return authorization.response;
  const query = historyQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return validationError(query.error);

  const [imports, total] = await Promise.all([
    prisma.foodImport.findMany({
      orderBy: { createdAt: "desc" },
      skip: (query.data.page - 1) * query.data.pageSize,
      take: query.data.pageSize,
      select: { id: true, filename: true, fileChecksum: true, totalRows: true, insertedRows: true, status: true, createdAt: true }
    }),
    prisma.foodImport.count()
  ]);

  return Response.json({ data: { imports, pagination: { ...query.data, total, totalPages: Math.max(1, Math.ceil(total / query.data.pageSize)) } } });
}
