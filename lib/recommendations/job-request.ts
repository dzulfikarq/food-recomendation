import { apiError } from "@/lib/food/http";

export async function readJobJson(request: Request, maxBytes: number) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    return { ok: false as const, error: apiError(413, "REQUEST_TOO_LARGE", "Request exceeds size limit.") };
  }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
    return { ok: false as const, error: apiError(415, "JSON_REQUIRED", "Request must use application/json.") };
  }
  if (!request.body) return { ok: false as const, error: apiError(400, "INVALID_JSON", "Request body is required.") };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return { ok: false as const, error: apiError(413, "REQUEST_TOO_LARGE", "Request exceeds size limit.") };
      }
      chunks.push(value);
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
    try {
      return { ok: true as const, value: JSON.parse(text) as unknown };
    } catch {
      return { ok: false as const, error: apiError(400, "INVALID_JSON", "Request body is not valid JSON.") };
    }
  } catch {
    return { ok: false as const, error: apiError(400, "INVALID_JSON", "Request body could not be read.") };
  }
}
