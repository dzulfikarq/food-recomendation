import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const digest = typeof error === "object" && error !== null && "digest" in error && typeof error.digest === "string"
    ? error.digest
    : undefined;
  console.error(JSON.stringify({
    event: "next_request_error",
    route: context.routePath,
    routeType: context.routeType,
    method: request.method,
    errorType: error instanceof Error ? error.name : "UnknownError",
    ...(digest ? { digest } : {})
  }));
};
