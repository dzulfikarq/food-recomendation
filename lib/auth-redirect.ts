const userCallbackPaths = new Set([
  "/",
  "/my-ratings",
  "/recommendations",
  "/research",
  "/research/rate"
]);

export function safeUserCallbackPath(value: unknown) {
  return typeof value === "string" && userCallbackPaths.has(value) ? value : "/";
}
