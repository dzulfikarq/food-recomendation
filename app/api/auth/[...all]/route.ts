import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

const handlers = toNextJsHandler(auth);

export const GET = handlers.GET;

export async function POST(request: Request) {
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  if (path.endsWith("/sign-up/email")) {
    return Response.json({ message: "Use the FoodRec registration form." }, { status: 404 });
  }
  return handlers.POST(request);
}
