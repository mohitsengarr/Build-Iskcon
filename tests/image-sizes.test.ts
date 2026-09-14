// Unit tests for the shared fallback size rule (_shared/imageSizes.ts), used by
// the chapter-cover writers (bulk-generate-chapter-art, bulk-generate-chaitanya-art,
// regenerate-chapter-art, generate-gita-chapter-art) and the Instagram writers
// (instagram-post, bulk-generate-images, regenerate-pending-image).
// Run: node --experimental-strip-types --test tests/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fallbackSizeFor } from "../supabase/functions/_shared/imageSizes.ts";

describe("fallbackSizeFor", () => {
  test("a landscape cover keeps its shape at the long side of a portrait fallback size: 1344x1088 with 768x1024 is 1024x832", () => {
    // Arrange / Act
    const size = fallbackSizeFor(1344, 1088, 768, 1024);
    // Assert
    assert.deepEqual(size, { w: 1024, h: 832 });
  });

  test("an Instagram post keeps its shape at the configured scale: 1344x768 with 832x1216 is 1216x704, with 768x1024 1024x576", () => {
    assert.deepEqual(fallbackSizeFor(1344, 768, 832, 1216), { w: 1216, h: 704 });
    assert.deepEqual(fallbackSizeFor(1344, 768, 768, 1024), { w: 1024, h: 576 });
  });

  test("a portrait render keeps a portrait fallback: 1088x1344 with 1024x768 is 832x1024", () => {
    assert.deepEqual(fallbackSizeFor(1088, 1344, 1024, 768), { w: 832, h: 1024 });
  });

  test("boundary: a fallback size of the render's own shape is used as it is, and a square render is square", () => {
    assert.deepEqual(fallbackSizeFor(1344, 1088, 1024, 832), { w: 1024, h: 832 });
    assert.deepEqual(fallbackSizeFor(1024, 1024, 768, 1024), { w: 1024, h: 1024 });
  });

  test("boundary: the other side is rounded to a multiple of 32 and never goes under 256", () => {
    // 1024 * 1088 / 1344 = 828.95, which rounds to 832; 1024 * 200 / 1440 = 142 is raised to 256
    const cover = fallbackSizeFor(1344, 1088, 768, 1024);
    const strip = fallbackSizeFor(1440, 200, 768, 1024);
    assert.equal(cover.h % 32, 0);
    assert.deepEqual(strip, { w: 1024, h: 256 });
  });

  test("with no fallback size set the long side is 1024", () => {
    assert.deepEqual(fallbackSizeFor(1344, 1088, null, null), { w: 1024, h: 832 });
    assert.deepEqual(fallbackSizeFor(1344, 1088, undefined, 0), { w: 1024, h: 832 });
  });

  test("negative: sizes that are not positive numbers are ignored; numeric strings from a database row count", () => {
    assert.deepEqual(fallbackSizeFor(1344, 1088, "832", "1216"), { w: 1216, h: 992 });
    assert.deepEqual(fallbackSizeFor(1344, 1088, -768, "x"), { w: 1024, h: 832 });
    assert.deepEqual(fallbackSizeFor(Number.NaN, 1088, 768, 1024), { w: 1024, h: 1024 }, "an unknown render shape falls back square");
  });
});

describe("imageSizes.ts purity", () => {
  test("imports nothing and touches no Deno global, so it runs under node and Deno alike", () => {
    const src = readFileSync(new URL("../supabase/functions/_shared/imageSizes.ts", import.meta.url), "utf8");
    assert.equal(/^\s*import\s/m.test(src), false);
    assert.equal(/\bDeno\./.test(src), false);
  });

  test("the seven writers take the fallback size from it and no longer keep a rule of their own", () => {
    const writers = [
      "bulk-generate-chapter-art",
      "bulk-generate-chaitanya-art",
      "regenerate-chapter-art",
      "generate-gita-chapter-art",
      "instagram-post",
      "bulk-generate-images",
      "regenerate-pending-image",
    ];
    for (const fn of writers) {
      const src = readFileSync(new URL(`../supabase/functions/${fn}/index.ts`, import.meta.url), "utf8");
      assert.ok(src.includes('import { fallbackSizeFor } from "../_shared/imageSizes.ts";'), `${fn} imports fallbackSizeFor`);
      assert.match(src, /fallbackSizeFor\(/, fn);
      assert.doesNotMatch(src, /function coverFallbackSize|function fallbackSize\(|Math\.max\(32, Math\.round\(\(?1024 \*/, fn);
    }
  });
});
