import assert from "node:assert/strict";
import test from "node:test";
import { onRequestError } from "@/instrumentation";

test("server error log includes route metadata but excludes request path, headers, and error message", () => {
  const originalError = console.error;
  let output = "";
  console.error = (value?: unknown) => { output = String(value); };
  try {
    onRequestError(
      Object.assign(new Error("private participant data"), { digest: "safe-digest" }),
      { path: "/api/admin/research?token=secret", method: "GET", headers: { authorization: "secret" } },
      { routerKind: "App Router", routePath: "/api/admin/research/exports/[id]/download", routeType: "route", revalidateReason: undefined }
    );
  } finally {
    console.error = originalError;
  }

  const event = JSON.parse(output);
  assert.equal(event.event, "next_request_error");
  assert.equal(event.route, "/api/admin/research/exports/[id]/download");
  assert.equal(event.errorType, "Error");
  assert.equal(event.digest, "safe-digest");
  assert.equal(output.includes("participant data"), false);
  assert.equal(output.includes("token=secret"), false);
  assert.equal(output.includes("authorization"), false);
});
