import { FOOD_CSV_TEMPLATE } from "@/lib/food/constants";
import { requireAdminRequest } from "@/lib/food/http";

export async function GET(request: Request) {
  const authorization = await requireAdminRequest(request);
  if (!authorization.user) return authorization.response;
  return new Response(`\uFEFF${FOOD_CSV_TEMPLATE}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="foodrec-template.csv"',
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
