// _shared/watermark.ts: every stored image carries the Bhaktigram mark, small in
// its bottom-right corner, and an image is never lost when marking fails.
// ImageScript is stubbed (helpers/imagescript-stub.mjs): a fake image is the bytes
// "IMG:<w>x<h>", and the stub's JPEG says what was laid over it and where.
// Run: node --experimental-strip-types --test tests/
import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./helpers/edge-function-hooks.mjs", import.meta.url);
const wm = await import("../supabase/functions/_shared/watermark.ts");
const client = await import("../supabase/functions/_shared/watermarkClient.ts");
const { WATERMARK_MARKS } = await import("../supabase/functions/_shared/watermarkMarks.ts");
// deno-lint-ignore no-explicit-any
const g = globalThis as any;

const fake = (w: number, h: number) => Buffer.from(`IMG:${w}x${h}`).toString("base64");
const marked = (bytes: Uint8Array) => {
  const text = new TextDecoder().decode(bytes);
  assert.ok(text.startsWith("MARKED:"), text.slice(0, 40));
  const [, size, q, json] = /^MARKED:(\d+x\d+):q(\d+):(.*)$/.exec(text)!;
  return { size, quality: Number(q), composites: JSON.parse(json) as Array<{ w: number; h: number; x: number; y: number }> };
};

describe("markUnit", () => {
  test("is 2.2% of the image's height: 30 px on a 1344-tall post, 24 on a 1088-tall cover", () => {
    assert.equal(wm.markUnit(1344), 30);
    assert.equal(wm.markUnit(1088), 24);
  });

  test("never smaller or larger than the marks that were drawn", () => {
    assert.equal(wm.markUnit(200), wm.MIN_UNIT);
    assert.equal(wm.markUnit(4000), wm.MAX_UNIT);
  });

  test("every unit it can return has a mark drawn for it", () => {
    for (let u = wm.MIN_UNIT; u <= wm.MAX_UNIT; u++) assert.ok(WATERMARK_MARKS[u], `unit ${u}`);
  });
});

describe("markPlacement", () => {
  test("puts the mark in the bottom-right corner, 2.5% of the shorter side from both edges", () => {
    assert.deepEqual(wm.markPlacement(1088, 1344, { w: 242, h: 42 }), { x: 1088 - 242 - 27, y: 1344 - 42 - 27 });
  });

  test("an image too small to hold the mark gets no placement", () => {
    assert.equal(wm.markPlacement(100, 40, { w: 242, h: 42 }), null);
  });
});

describe("watermarkedJpeg", () => {
  afterEach(() => {
    delete g.__imagescriptFail;
  });

  test("lays the mark drawn for the image's size over its bottom-right corner and stores a JPEG", async () => {
    // Arrange
    const unit = wm.markUnit(1344);
    const mark = WATERMARK_MARKS[unit];
    // Act
    const out = marked(await wm.watermarkedJpeg(fake(1088, 1344), () => {}));
    // Assert
    assert.equal(out.size, "1088x1344");
    assert.equal(out.quality, wm.JPEG_QUALITY);
    assert.deepEqual(out.composites, [{ w: mark.w, h: mark.h, ...wm.markPlacement(1088, 1344, mark) }]);
  });

  test("a landscape cover gets the smaller mark for its height", async () => {
    const out = marked(await wm.watermarkedJpeg(fake(1344, 1088), () => {}));
    assert.equal(out.composites[0].h, WATERMARK_MARKS[24].h);
  });

  test("an image that cannot be decoded is stored as it was rendered, and that is logged", async () => {
    // Arrange
    g.__imagescriptFail = "bad jpeg";
    const logs: string[] = [];
    const b64 = fake(1088, 1344);
    // Act
    const out = await wm.watermarkedJpeg(b64, (l) => logs.push(l));
    // Assert
    assert.deepEqual(Buffer.from(out), Buffer.from(b64, "base64"));
    assert.match(logs[0], /^\[watermark\] not marked, stored as rendered: Error: bad jpeg/);
  });

  test("an image too small for the mark is stored as it was rendered", async () => {
    const b64 = fake(60, 40);
    const out = await wm.watermarkedJpeg(b64, () => {});
    assert.deepEqual(Buffer.from(out), Buffer.from(b64, "base64"));
  });
});

describe("isOwnStorageUrl (watermark-image)", () => {
  const P = "https://p.supabase.co/storage/v1/object/public/";

  test("accepts an image in this project's public storage", () => {
    assert.equal(wm.isOwnStorageUrl(`${P}instagram-images/a.jpg`, P), true);
  });

  test("refuses another host, a path that climbs out, and anything not a string", () => {
    assert.equal(wm.isOwnStorageUrl("https://evil.test/a.jpg", P), false);
    assert.equal(wm.isOwnStorageUrl(`${P}../../secret`, P), false);
    assert.equal(wm.isOwnStorageUrl(42, P), false);
  });
});

describe("watermarkBytes", () => {
  test("says whether the image was marked", async () => {
    const yes = await wm.watermarkBytes(Buffer.from("IMG:1088x1344"), () => {});
    const no = await wm.watermarkBytes(Buffer.from("IMG:60x40"), () => {});
    assert.equal(yes.marked, true);
    assert.equal(no.marked, false);
  });
});

describe("storedImageBytes (the generators' client)", () => {
  const saved: Record<string, unknown> = {};
  const ENV: Record<string, string> = { SUPABASE_URL: "https://p.test", SUPABASE_SERVICE_ROLE_KEY: "service-test" };
  const b64 = Buffer.from("JPEG-BYTES").toString("base64");
  function withNet(answer: (url: string, init: RequestInit) => Response | Promise<Response>) {
    saved.Deno = g.Deno;
    saved.fetch = g.fetch;
    g.Deno = { env: { get: (k: string) => ENV[k] } };
    const calls: Array<{ url: string; init: RequestInit }> = [];
    g.fetch = async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return answer(String(url), init);
    };
    return calls;
  }
  afterEach(() => {
    if ("Deno" in saved) g.Deno = saved.Deno;
    if ("fetch" in saved) g.fetch = saved.fetch;
  });

  test("sends the image to watermark-image as JPEG bytes and stores what comes back marked", async () => {
    // Arrange
    const calls = withNet(() => new Response("MARKED", { headers: { "x-watermark": "marked" } }));
    // Act
    const out = await client.storedImageBytes(b64, () => {});
    // Assert
    assert.equal(Buffer.from(out).toString(), "MARKED");
    assert.equal(calls[0].url, "https://p.test/functions/v1/watermark-image");
    assert.equal((calls[0].init.headers as Record<string, string>)["Content-Type"], "image/jpeg");
    assert.equal(Buffer.from(calls[0].init.body as Uint8Array).toString(), "JPEG-BYTES");
  });

  test("a failed call stores the image as it was rendered, and says so", async () => {
    // Arrange
    withNet(() => new Response("boom", { status: 546 }));
    const logs: string[] = [];
    // Act
    const out = await client.storedImageBytes(b64, (l) => logs.push(l));
    // Assert
    assert.equal(Buffer.from(out).toString(), "JPEG-BYTES");
    assert.match(logs[0], /not marked, stored as rendered: Error: HTTP 546/);
  });

  test("an image that came back unmarked is stored as it was rendered", async () => {
    withNet(() => new Response("SAME", { headers: { "x-watermark": "unmarked" } }));
    const out = await client.storedImageBytes(b64, () => {});
    assert.equal(Buffer.from(out).toString(), "JPEG-BYTES");
  });

  test("a network error never loses the image", async () => {
    withNet(() => { throw new TypeError("network down"); });
    const out = await client.storedImageBytes(b64, () => {});
    assert.equal(Buffer.from(out).toString(), "JPEG-BYTES");
  });

  test("outside the edge runtime (no Deno settings) the image is stored as rendered, with no call", async () => {
    // Arrange
    const calls = withNet(() => new Response("MARKED", { headers: { "x-watermark": "marked" } }));
    g.Deno = undefined;
    // Act
    const out = await client.storedImageBytes(b64, () => {});
    // Assert
    assert.equal(Buffer.from(out).toString(), "JPEG-BYTES");
    assert.equal(calls.length, 0);
  });
});

describe("every image the generators store goes through the watermark", () => {
  const STORERS = [
    "bulk-generate-chapter-art", "bulk-generate-chaitanya-art", "bulk-generate-images", "generate-gita-chapter-art",
    "generate-scene-image", "instagram-post", "regenerate-chapter-art", "regenerate-pending-image",
  ];
  const read = async (rel: string) => (await import("node:fs")).readFileSync(new URL(`../supabase/functions/${rel}`, import.meta.url), "utf8");

  test("each generator stores the bytes storedImageBytes gives, and never decodes the image itself", async () => {
    for (const fn of STORERS) {
      const src = await read(`${fn}/index.ts`);
      assert.match(src, /import \{ storedImageBytes \} from "\.\.\/_shared\/watermarkClient\.ts";/, fn);
      assert.match(src, /await storedImageBytes\(/, fn);
      assert.doesNotMatch(src, /Uint8Array\.from\(atob\(/, `${fn} decodes an image without marking it`);
    }
  });

  test("an automatic re-render swapped onto a row is marked too", async () => {
    const src = await read("_shared/rowRedo.ts");
    assert.match(src, /upload\(path, await storedImageBytes\(attempt\.b64\)/);
  });
});

