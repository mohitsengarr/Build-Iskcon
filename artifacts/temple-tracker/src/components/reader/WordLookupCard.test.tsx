import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { WordLookupCard, WordLookupView, type WordLookupViewProps } from "./WordLookupCard";
import type { DefinitionResult } from "@/lib/wordLookup";

// The dictionary card under a selected word. Rendered to static markup (the
// test environment is node, no DOM), so each state goes through the view.
// The lookups themselves are tested in lib/wordLookup.test.ts.

const noop = () => {};

const FOUND: DefinitionResult = {
  status: "found",
  senses: [
    { code: "hi", language: "Hindi", partOfSpeech: "Adjective", definitions: ["free", "liberated, unfettered"] },
    { code: "sa", language: "Sanskrit", partOfSpeech: "Participle", definitions: ["past participle of मुच् (muc)"] },
  ],
  lemma: null,
};

function view(overrides: Partial<WordLookupViewProps> = {}): string {
  return renderToStaticMarkup(
    createElement(WordLookupView, { word: "मुक्त", bookMeaning: null, result: FOUND, onCopy: noop, onClose: noop, ...overrides }),
  );
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("WordLookupView", () => {
  it("is titled Dictionary and shows the word", () => {
    const html = view();
    expect(text(html)).toMatch(/^Dictionary मुक्त/);
  });

  it("lists each language and part of speech with its numbered definitions", () => {
    const html = view();
    expect(html).toContain("Hindi · adjective");
    expect(html).toContain("Sanskrit · participle");
    expect(html).toMatch(/<ol[^>]*><li[^>]*>free<\/li><li[^>]*>liberated, unfettered<\/li><\/ol>/);
  });

  it("credits the dictionary and links to the full definition at the first language", () => {
    const html = view();
    expect(html).toContain("Wiktionary · CC BY-SA");
    expect(html).toMatch(/<a href="https:\/\/en\.wiktionary\.org\/wiki\/%E0%A4%AE%E0%A5%81%E0%A4%95%E0%A5%8D%E0%A4%A4#Hindi" target="_blank" rel="noopener noreferrer"[^>]*>Full definition<\/a>/);
  });

  it("puts the book's own meaning first, marked as from the book", () => {
    const html = view({ word: "इति", bookMeaning: { word: "इति", meaning: "इस प्रकार" } });
    expect(html).toContain("From the book · शब्दार्थ");
    expect(html.indexOf("इस प्रकार")).toBeGreaterThan(0);
    expect(html.indexOf("इस प्रकार")).toBeLessThan(html.indexOf("Hindi · adjective"));
  });

  it("has no \"from the book\" line when the book does not gloss the word (negative case)", () => {
    expect(view()).not.toContain("From the book");
  });

  it("says it is looking while the dictionary is on its way, with the book's meaning already shown", () => {
    const html = view({ word: "इति", bookMeaning: { word: "इति", meaning: "इस प्रकार" }, result: "loading" });
    expect(html).toContain("Looking up the dictionary…");
    expect(html).toContain("इस प्रकार");
    expect(html).not.toContain("Full definition");
  });

  it("says plainly when the dictionary has no entry, and offers a search", () => {
    const html = view({ word: "सतोगुण", result: { status: "not-found" } });
    expect(html).toContain("The dictionary has no entry for this word.");
    expect(html).toMatch(/<a href="https:\/\/en\.wiktionary\.org\/w\/index\.php\?search=[^"]+"[^>]*>Search the dictionary<\/a>/);
    expect(html).not.toContain("Full definition");
    expect(html).not.toContain("<ol");
  });

  it("with the book's meaning in hand, a missing dictionary entry is not announced", () => {
    const html = view({ word: "प्रोज्झित", bookMeaning: { word: "प्रोज्झित", meaning: "पूर्ण रूप से अस्वीकृत" }, result: { status: "not-found" } });
    expect(html).toContain("पूर्ण रूप से अस्वीकृत");
    expect(html).not.toContain("has no entry");
    expect(html).toContain("Śrīmad-Bhāgavatam");
  });

  it("says the dictionary could not be reached, which is not the same as no entry (negative case)", () => {
    const html = view({ result: { status: "error" } });
    expect(html).toContain("The dictionary could not be reached.");
    expect(html).not.toContain("has no entry");
    expect(html).not.toContain("<a ");
  });

  it("shows the word an inflected form belongs to, with that word's definitions", () => {
    const html = view({
      word: "करते",
      result: {
        status: "found",
        senses: [{ code: "hi", language: "Hindi", partOfSpeech: "Verb", definitions: ["inflection of करना (karnā):"] }],
        lemma: { word: "करना", senses: [{ code: "hi", language: "Hindi", partOfSpeech: "Verb", definitions: ["to do"] }] },
      },
    });
    expect(html).toContain("inflection of करना (karnā):");
    expect(html).toMatch(/<p[^>]*>करना<\/p>/);
    expect(html).toContain("<li style=\"font-family:var(--font-devanagari)\">to do</li>");
    // The full definition is the base word's page.
    expect(html).toContain("https://en.wiktionary.org/wiki/%E0%A4%95%E0%A4%B0%E0%A4%A8%E0%A4%BE#Hindi");
  });

  it("omits the part of speech when the dictionary gives none (boundary)", () => {
    const html = view({ result: { status: "found", senses: [{ code: "hi", language: "Hindi", partOfSpeech: "", definitions: ["free"] }], lemma: null } });
    expect(html).toMatch(/>Hindi<\/p>/);
    expect(html).not.toContain("Hindi ·");
  });

  it("has a copy button and a close button, each with a name", () => {
    const html = view();
    expect(html).toContain('aria-label="Copy the word"');
    expect(html).toContain('aria-label="Close the dictionary"');
  });

  it("shows a tick once the word is copied", () => {
    expect(view({ copied: true })).toContain("lucide-check");
    expect(view({ copied: false })).not.toContain("lucide-check");
  });
});

describe("WordLookupCard", () => {
  it("draws nothing until a word is selected", () => {
    expect(renderToStaticMarkup(createElement(WordLookupCard))).toBe("");
  });
});

// ── Wiring ───────────────────────────────────────────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));
const CARD = readFileSync(resolve(HERE, "./WordLookupCard.tsx"), "utf-8");
const READER = readFileSync(resolve(HERE, "../../pages/bhagwatham.tsx"), "utf-8");

describe("dictionary card wiring", () => {
  it("is mounted in the Bhagwatham reader beside the selection toolbar", () => {
    expect(READER).toMatch(/<VoiceEditToolbar book=\{\{ key: "bhagavatam"[^\n]*\/>\s*\{\/\* Dictionary card[^\n]*\*\/\}\s*<WordLookupCard \/>/);
  });

  it("answers only a single word selected inside the book's text", () => {
    expect(CARD).toContain('const pageEl = startEl?.closest("[data-page-num]") ?? null;');
    expect(CARD).toContain("const word = lookupTarget(sel.toString());");
    expect(CARD).toMatch(/if \(!pageEl \|\| !word \|\| [^\n]*\) \{ close\(\); return; \}/);
  });

  it("waits for the press to end before looking a selection up", () => {
    expect(CARD).toContain("timer = setTimeout(() => { if (!pointerDown) evaluate(); }, delay);");
  });

  it("looks the word up in the nearest शब्दार्थ first: after the word on its page, then before, then the next page", () => {
    expect(CARD).toContain("return [...after, ...before, ...sectionsIn(pageEl.nextElementSibling), ...sectionsIn(pageEl.previousElementSibling).reverse()]");
  });

  it("treats a verse word, and a headword in the word meanings, as Sanskrit first", () => {
    expect(CARD).toContain('const inVerse = section === "shlok" || section === "ref-shlok" || (section === "shabdarth" && !startEl?.closest("strong"));');
  });

  it("does not remember a failed lookup, so the next selection tries again", () => {
    expect(CARD).toContain('if (result.status === "error") definitionCache.delete(key);');
  });

  it("stays closed on a selection the reader closed it on", () => {
    expect(CARD).toContain("if (key === dismissedRef.current || key === lookupRef.current?.key) return;");
    expect(CARD).toContain("onClose={() => close(true)}");
  });

  it("puts the card away when the word leaves the screen, as on a Kindle page turn", () => {
    expect(CARD).toContain('document.addEventListener("scroll", onMove, { capture: true, passive: true });');
    expect(CARD).toContain("if (!onScreen) { close(); return; }");
  });
});
