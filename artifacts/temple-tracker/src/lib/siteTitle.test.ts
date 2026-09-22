import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HOME_TITLE } from "./siteTitle";

const indexHtml = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const staticTitle = indexHtml.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";

describe("home page title", () => {
  it("carries no count", () => {
    expect(HOME_TITLE).not.toMatch(/\d/);
  });

  it("matches the static title in index.html, which also carries no count", () => {
    expect(staticTitle).not.toBe("");
    expect(staticTitle).not.toMatch(/\d/);
    expect(staticTitle.startsWith(HOME_TITLE)).toBe(true);
  });
});
