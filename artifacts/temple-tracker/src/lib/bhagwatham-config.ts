/**
 * Centralized Bhagwatham Reader Configuration
 *
 * ALL rules for text corrections, section detection, and formatting
 * live here. Changes apply instantly across all pages — no cron needed.
 *
 * Usage: import { CONFIG } from "@/lib/bhagwatham-config";
 */

// ── 1. OCR Text Corrections ────────────────────────────────────────────────
// Applied to ALL page text before rendering. Runs client-side on display.
// Format: { find: string | RegExp, replace: string }
// Order matters — applied sequentially.

export const TEXT_CORRECTIONS: Array<{ find: string | RegExp; replace: string; description?: string }> = [
  // Standalone कौ → की (systematic OCR error, 3476+ occurrences)
  { find: /कौ(?=[\s।,;:)\?\n])/gu, replace: "की", description: "OCR misreads की as कौ" },

  // Add more corrections here as discovered:
  // { find: "गलत", replace: "सही", description: "example fix" },
];

// ── 2. Section Detection Rules ─────────────────────────────────────────────
// How shlok, shabdarth, anuvad, tatparya are identified in OCR text.

export const SECTION_RULES = {
  // Section header markers (regex patterns)
  markers: {
    tatparya: /^तात्पर्य/u,
    anuvad: /^अनुवाद/u,
    shabdarth: /^शब्दार्थ/u,
    shlok: /॥/u,
    chapter: /^(अध्याय|स्कन्ध|Chapter)/iu,
  },

  // Shabdarth line detection — lines with these patterns are word-meanings
  shabdarthLine: {
    hasDash: (line: string) => line.includes("—") || line.includes("--") || /\S-\s/.test(line),
    hasSemicolon: (line: string) => line.includes(";"),
    endsWithDanda: (line: string) => /।\s*\.?\s*$/.test(line),
  },

  // Verse number pattern (e.g., ॥ ३१ ॥ or ॥ 31 ॥)
  verseNumber: /॥\s*[\d१२३४५६७८९०]+\s*॥/u,

  // Max line length for chapter headings (reject longer lines)
  maxChapterHeadingLength: 60,

  // Colophon markers (end-of-chapter markers to skip)
  colophon: ["पूर्ण हुए", "पूर्ण हुआ"],

  // Hindi postpositions (used to distinguish Hindi prose from Sanskrit verse)
  hindiPostpositions: ["का", "की", "के", "को", "में", "पर", "से", "ने", "तक", "और", "या", "भी", "तो", "ही", "यह", "वह", "जो", "इस", "उस", "कि", "जब", "तब", "नहीं"],

  // Hindi verbs (strong prose indicators)
  hindiVerbs: /(?:है|हैं|था|थी|थे|होता|होती|करता|करती|गया|गयी|गये|किया|दिया|लिया|रहा|रही|रहे)(?:\s|[।,]|$)/u,

  // Sanskrit-specific particles (strong verse indicators)
  sanskritParticles: ["च", "एव", "हि", "तु", "वा", "यत्", "तत्", "इति", "अथ", "किम्"],
};

// ── 3. Formatting Rules ────────────────────────────────────────────────────
// Font sizes (em units — scale with reading settings), colors, and weights.

export const FORMATTING = {
  shlok: {
    fontSize: "1.15em",
    fontFamily: "var(--font-sanskrit)",
    fontWeight: "bold" as const,
    // Colors per theme: [light, sepia, dark]
    color: { light: "inherit", sepia: "inherit", dark: "inherit" },
    margin: "my-5",
    showSpeaker: true, // TTS button
  },

  refShlok: {
    fontSize: "0.9em",
    fontFamily: "var(--font-sanskrit)",
    fontWeight: "normal" as const,
    fontStyle: "italic" as const,
    color: { light: "text-[#8b5a30]", sepia: "text-[#6b4020]", dark: "text-amber-400/70" },
    margin: "my-2",
    borderLeft: true,
  },

  shabdarth: {
    headingFontSize: "0.85em",
    bodyFontSize: "0.8em",
    fontFamily: "var(--font-devanagari)",
    fontWeight: "normal" as const,
    headingWeight: "bold" as const,
    color: { light: "text-[#1a4a8a]", sepia: "text-[#1a3a6a]", dark: "text-blue-300/80" },
    headingColor: { light: "text-[#1a4a8a]", sepia: "text-[#1a3a6a]", dark: "text-blue-400" },
    boldMeanings: true, // bold text after — dashes
    margin: "my-3",
  },

  anuvad: {
    fontSize: "1em",
    fontFamily: "var(--font-devanagari)",
    fontWeight: "normal" as const, // NOT bold
    labelWeight: "font-semibold" as const,
    color: "inherit", // same as body text
    indentFirstLine: true,
    margin: "mt-3",
  },

  tatparya: {
    fontSize: "0.95em",
    fontFamily: "var(--font-devanagari)",
    fontWeight: "normal" as const, // NOT bold
    labelWeight: "font-semibold" as const,
    color: "inherit", // same as body text
    margin: "mt-3",
  },

  chapter: {
    fontSize: "inherit",
    fontFamily: "var(--font-devanagari)",
    fontWeight: "bold" as const,
    margin: "mt-6 mb-4",
  },

  text: {
    fontSize: "1em",
    fontWeight: "normal" as const,
    color: "inherit",
  },
};

// ── 4. TTS Configuration ───────────────────────────────────────────────────

export const TTS_CONFIG = {
  // Sarvam Bulbul v3 settings
  sarvam: {
    speaker: "aditya", // deep male voice
    model: "bulbul:v3",
    pace: 0.8, // slow for Vedic recitation
    sampleRate: 24000,
    language: "hi-IN",
  },

  // Browser fallback settings (when Sarvam credits exhausted)
  browserFallback: {
    rate: 0.5,
    pitch: 0.7,
    lang: "hi-IN",
    // Voice preference order (first match wins)
    voicePreference: [
      { lang: "sa-IN" }, // Sanskrit voice
      { lang: "hi", nameExclude: /female|lekha|priya|swati|woman/i }, // male Hindi
      { lang: "hi" }, // any Hindi
      { langIncludes: "IN" }, // any Indian
    ],
  },
};

// ── 5. OCR Chapter Fixes ───────────────────────────────────────────────────
// Hardcoded fixes for OCR-corrupted chapter headings.

export const OCR_CHAPTER_FIXES: Record<string, { num: number; label: string }> = {
  "Chapter 278 अध्याय": { num: 8, label: "अध्याय आठ" },
  "Chapter it": { num: 9, label: "अध्याय नौ" },
  "(शुषा दो": { num: 2, label: "अध्याय दो" },
  "Chapter 3:": { num: 6, label: "अध्याय छह" },
  "(नौ": { num: 9, label: "अध्याय नौ" },
  "Chapter 36": { num: 8, label: "अध्याय आठ" },
  "Chapter छ:": { num: 6, label: "अध्याय छह" },
  "छल्नीस": { num: 26, label: "अध्याय छब्बीस" },
  "अदुईस": { num: 28, label: "अध्याय अट्ठाईस" },
  "Chapter इक्तीस": { num: 21, label: "अध्याय इक्कीस" },
};

// ── 6. Skandh (Canto) Page Ranges ──────────────────────────────────────────

export const SKANDH_PAGE_RANGES = [
  { skandh: 1, startPage: 1 },
  { skandh: 2, startPage: 874 },
  { skandh: 3, startPage: 1399 },
  { skandh: 4, startPage: 2617 },
  { skandh: 5, startPage: 3900 },
  { skandh: 6, startPage: 4540 },
  { skandh: 7, startPage: 5204 },
  { skandh: 8, startPage: 5849 },
  { skandh: 9, startPage: 6373 },
  { skandh: 10, startPage: 7080 },
  { skandh: 11, startPage: 9059 },
  { skandh: 12, startPage: 9500 },
];

export const EXPECTED_CHAPTERS_PER_CANTO = [19, 10, 33, 31, 26, 19, 15, 24, 24, 90, 31, 13];

// ── 7. Skandh Names ────────────────────────────────────────────────────────

export const SKANDH_NAMES: Record<number, { hi: string; en: string }> = {
  1:  { hi: "सृष्टि",            en: "Creation" },
  2:  { hi: "दृश्य जगत्",       en: "The Cosmic Manifestation" },
  3:  { hi: "यथार्थ का बोध",    en: "The Status Quo" },
  4:  { hi: "चतुर्थ सर्ग",       en: "The Creation of the Fourth Order" },
  5:  { hi: "सृष्टि प्रेरणा",    en: "The Creative Impetus" },
  6:  { hi: "मानव के कर्तव्य",  en: "Prescribed Duties for Mankind" },
  7:  { hi: "भगवत् विज्ञान",    en: "The Science of God" },
  8:  { hi: "संहार",             en: "Withdrawal of the Cosmic Creations" },
  9:  { hi: "मुक्ति",            en: "Liberation" },
  10: { hi: "आश्रय",            en: "The Summum Bonum" },
  11: { hi: "सामान्य इतिहास",   en: "General History" },
  12: { hi: "युग-धर्म",         en: "The Age of Deterioration" },
};

// ── Helper: Apply text corrections to a string ─────────────────────────────

export function applyTextCorrections(text: string): string {
  let result = text;
  for (const rule of TEXT_CORRECTIONS) {
    if (typeof rule.find === "string") {
      result = result.replaceAll(rule.find, rule.replace);
    } else {
      result = result.replace(rule.find, rule.replace);
    }
  }
  return result;
}
