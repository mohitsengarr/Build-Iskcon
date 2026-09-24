import { describe, expect, it } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { renderInlineBold, renderInlineBoldBlock } from "./inlineBold";

/** The text of a rendered line, with bold runs wrapped in «» so they are visible. */
function show(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(show).join("");
  const el = node as ReactElement<{ children?: ReactNode }>;
  const inner = show(el.props?.children);
  return el.type === "strong" ? `«${inner}»` : inner;
}

const lines = (block: ReactNode[]) => block.map(show);

describe("renderInlineBoldBlock", () => {
  it("returns the lines untouched when there is no marker", () => {
    const input = ["अर्जुन उवाच", "a plain line"];
    expect(renderInlineBoldBlock(input)).toBe(input);
  });

  it("bolds a run inside one line", () => {
    expect(lines(renderInlineBoldBlock(["the **Gandiva** bow"]))).toEqual(["the «Gandiva» bow"]);
  });

  it("keeps both halves of a bold run bold when it straddles a line break", () => {
    // Arrange: the marker pair opens on line 1 and closes on line 2. Each line is
    // its own <p>, so the run renders as one <strong> per line — line by line
    // this block would instead have shown the raw ** markers.
    const block = ["Krishna said **this is", "one emphasis** and this is not"];
    // Act
    const out = lines(renderInlineBoldBlock(block));
    // Assert
    expect(out).toEqual(["Krishna said «this is»", "«one emphasis» and this is not"]);
  });

  it("handles several runs on one line", () => {
    expect(lines(renderInlineBoldBlock(["**one** plain **two**"]))).toEqual(["«one» plain «two»"]);
  });

  it("leaves an unbalanced marker as plain text rather than bolding half a pair", () => {
    const input = ["an opening ** with no close", "and more text"];
    expect(renderInlineBoldBlock(input)).toBe(input);
  });

  it("keeps one node array per source line, including lines with no bold", () => {
    const out = renderInlineBoldBlock(["**bold**", "plain", "also **bold**"]);
    expect(out).toHaveLength(3);
    expect(lines(out)).toEqual(["«bold»", "plain", "also «bold»"]);
  });

  it("does not lose an empty line in the middle of a block", () => {
    const out = renderInlineBoldBlock(["**a**", "", "**b**"]);
    expect(out).toHaveLength(3);
    expect(lines(out)).toEqual(["«a»", "", "«b»"]);
  });

  it("handles an empty block and an empty line", () => {
    expect(renderInlineBoldBlock([])).toEqual([]);
    expect(renderInlineBoldBlock([""])).toEqual([""]);
  });

  it("gives every node a key, so React does not warn on a re-render", () => {
    const out = renderInlineBoldBlock(["**a** b"]) as ReactElement[][];
    for (const node of out[0]) expect(node.key).not.toBeNull();
  });
});

describe("renderInlineBold", () => {
  it("bolds a balanced run on a single line", () => {
    expect(show(renderInlineBold("**अनुवाद** :"))).toBe("«अनुवाद» :");
  });

  it("returns an unbalanced line unchanged", () => {
    expect(renderInlineBold("half ** open")).toBe("half ** open");
  });
});
