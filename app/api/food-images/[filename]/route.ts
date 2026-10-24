import { readFoodImage } from "@/lib/food/storage";

export async function GET(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  const image = await readFoodImage(filename);
  if (!image) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(image.buffer), {
    headers: {
      "Content-Type": image.mime,
      "Content-Length": String(image.buffer.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
