// The generators' side of the watermark (_shared/watermark.ts): each image the
// image model drew is sent to the watermark-image function, which lays the
// Bhaktigram mark over it in a call of its own (its own CPU budget), and the
// marked JPEG is what gets stored. Never throws and never loses an image: if the
// function cannot be reached or does not mark it, the image is stored as it was
// rendered and that is logged.

/** Decodes a base64 image (the image model's answer). */
export function imageBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** The bytes to store for a rendered image: marked when the watermark function answers. */
export async function storedImageBytes(
  b64: string,
  log: (line: string) => void = console.log,
): Promise<Uint8Array> {
  const original = imageBytes(b64);
  // Outside the edge runtime (no Deno, or no project settings) there is no
  // watermark function to call: the image is stored as rendered.
  // deno-lint-ignore no-explicit-any
  const env = (globalThis as any).Deno?.env;
  const url = env?.get("SUPABASE_URL");
  const key = env?.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return original;
  try {
    const res = await fetch(`${url}/functions/v1/watermark-image`, {
      method: "POST",
      headers: { "Content-Type": "image/jpeg", Authorization: `Bearer ${key}`, apikey: key },
      body: original,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const marked = new Uint8Array(await res.arrayBuffer());
    if (res.headers.get("x-watermark") !== "marked" || marked.length === 0) {
      log("[watermark] the image came back unmarked; stored as rendered");
      return original;
    }
    return marked;
  } catch (e) {
    log(`[watermark] not marked, stored as rendered: ${e}`);
    return original;
  }
}
