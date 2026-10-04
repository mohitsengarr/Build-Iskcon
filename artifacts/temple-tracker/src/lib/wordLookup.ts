// Select a word, see what it means.
//
// Two sources, in this order:
//
//  1. The book itself. Under every verse the book prints its word-for-word
//     meanings (शब्दार्थ): "धर्मः—धार्मिकता; अत्र—यहाँ; …". A word selected in a
//     verse is looked up there first: it is the author's own gloss, it is in
//     Hindi, and it is already on the page.
//  2. Wiktionary, a free dictionary with Hindi and Sanskrit entries, for every
//     other word. Its definitions are quoted as they stand and credited.
//
// A word found in neither is reported as not found. Nothing here guesses a
// meaning. Everything except fetchDefinitions is pure and tested without a
// browser; WordLookupCard.tsx reads the selection and draws the card.

// ── The word that was selected ───────────────────────────────────────────────

/** Longest thing still treated as one word. */
export const MAX_WORD_CHARS = 40;

const ZERO_WIDTH = /[​-‍﻿]/g;
// Dandas, Devanagari and Latin digits, and the punctuation that clings to a
// selected word. A hyphen inside a word (जन्म-आदि) is part of it and stays.
const EDGE_NOISE = /^[\s।॥०-९0-9.,;:!?'"“”‘’()[\]{}|/\\*_~`<>«»—–―-]+|[\s।॥०-९0-9.,;:!?'"“”‘’()[\]{}|/\\*_~`<>«»—–―-]+$/g;

/** A word as it is compared and looked up: composed, without invisible joiners, edges trimmed. */
export function normaliseWord(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.normalize("NFC").replace(ZERO_WIDTH, "").replace(EDGE_NOISE, "").trim();
}

/**
 * The word to look up for a selection, or null when the selection is not one
 * word: empty, several words, a single character, or too long to be a word.
 */
export function lookupTarget(selection: unknown): string | null {
  const word = normaliseWord(selection);
  if (word.length < 2 || word.length > MAX_WORD_CHARS) return null;
  if (/\s/.test(word)) return null;
  if (!/\p{L}/u.test(word)) return null;
  return word;
}

export type Script = "devanagari" | "latin" | "other";

/** The script a word is written in, which decides the dictionary languages that fit it. */
export function scriptOf(word: string): Script {
  if (/[ऀ-ॿ]/.test(word)) return "devanagari";
  if (/[A-Za-z]/.test(word)) return "latin";
  return "other";
}

// ── 1. The book's own word-for-word meanings ─────────────────────────────────

export interface WordMeaning {
  word: string;
  meaning: string;
}

const DASH = /\s*[—–―]\s*/;

/**
 * The "word—meaning; word—meaning" pairs of a शब्दार्थ section. The scan of
 * the book sometimes loses a headword ("; —नमस्कार है") or the semicolon
 * between two pairs ("धर्मः—धार्मिकता प्रोज्झित—पूर्ण रूप से अस्वीकृत"): a
 * pair with no headword is dropped, and a run with two dashes is split at the
 * word before the second dash, which is the next headword.
 */
export function parseWordMeanings(text: unknown): WordMeaning[] {
  if (typeof text !== "string" || !text.trim()) return [];
  const pairs: WordMeaning[] = [];
  const add = (word: string, meaning: string) => {
    const w = normaliseWord(word);
    const m = meaning.replace(ZERO_WIDTH, "").replace(/\s+/g, " ").trim();
    if (w && m && !/\s/.test(w)) pairs.push({ word: w, meaning: m });
  };
  for (const piece of text.split(/[;；]/)) {
    const parts = piece.split(DASH);
    if (parts.length < 2) continue;
    let head = parts[0];
    for (let i = 1; i < parts.length; i++) {
      const isLast = i === parts.length - 1;
      if (isLast) { add(head, parts[i]); break; }
      // "meaning nextHeadword": the next headword is the last word before the dash.
      const body = parts[i].trim();
      const cut = body.lastIndexOf(" ");
      if (cut === -1) { add(head, ""); head = body; continue; }
      add(head, body.slice(0, cut));
      head = body.slice(cut + 1);
    }
  }
  return pairs;
}

/**
 * The book's meaning for a word, from the शब्दार्थ texts given in the order to
 * search them (the selection's own page first). The match is exact: a verse
 * joins words by sandhi, and guessing which headword a joined form belongs to
 * would put a wrong meaning under the reader's eyes.
 */
export function findBookMeaning(word: string, glossaryTexts: readonly string[]): WordMeaning | null {
  const target = normaliseWord(word);
  if (!target) return null;
  for (const text of glossaryTexts) {
    for (const pair of parseWordMeanings(text)) {
      if (pair.word === target) return pair;
    }
  }
  return null;
}

// ── 2. Wiktionary ────────────────────────────────────────────────────────────

/** Sent with each request, as Wikimedia asks of sites that call its API. */
export const API_USER_AGENT = "BuildIskconReader/1.0 (https://buildiskcon.com)";

/** Where a word's definitions are fetched from. */
export function definitionApiUrl(word: string): string {
  return `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`;
}

/** A search of the dictionary, for a word it has no entry for. */
export function dictionarySearchUrl(word: string): string {
  return `https://en.wiktionary.org/w/index.php?search=${encodeURIComponent(word)}`;
}

/** The word's full dictionary page, for the "Full definition" link. */
export function dictionaryPageUrl(word: string, languageName?: string | null): string {
  const base = `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`;
  return languageName ? `${base}#${encodeURIComponent(languageName.replace(/\s+/g, "_"))}` : base;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** A definition's HTML as plain text: styles and tags removed, entities decoded, lines kept. */
export function htmlToText(html: unknown): string {
  if (typeof html !== "string") return "";
  return html
    .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    // A list item, a paragraph or a line break starts a new line.
    .replace(/<\/?(?:li|ol|ul|p|div|dd|dt|dl)\b[^>]*>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .split("\n")
    .map(line => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export interface Sense {
  /** Wiktionary's language code and name: "hi" / "Hindi". */
  code: string;
  language: string;
  partOfSpeech: string;
  definitions: string[];
}

/** How many languages, parts of speech and definitions the card shows. */
export const MAX_SENSES = 4;
export const MAX_DEFINITIONS = 3;

/**
 * The dictionary languages that fit a word, best first. A word in a verse is
 * Sanskrit before it is Hindi; in the translation and purport it is Hindi first.
 */
export function languageOrder(word: string, inVerse: boolean): string[] {
  const script = scriptOf(word);
  if (script === "latin") return ["en"];
  if (script === "devanagari") return inVerse ? ["sa", "hi"] : ["hi", "sa"];
  return [];
}

/**
 * The senses to show from a Wiktionary definition response: only the languages
 * that fit the word, in that order, each with its first few definitions.
 * Empty when the response has nothing for those languages.
 */
export function pickSenses(response: unknown, order: readonly string[]): Sense[] {
  if (!response || typeof response !== "object") return [];
  const senses: Sense[] = [];
  for (const code of order) {
    const entries = (response as Record<string, unknown>)[code];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as { language?: unknown; partOfSpeech?: unknown; definitions?: unknown };
      const definitions = (Array.isArray(e.definitions) ? e.definitions : [])
        .map(d => htmlToText((d as { definition?: unknown } | null)?.definition).replace(/\n/g, " · "))
        .filter(Boolean)
        .slice(0, MAX_DEFINITIONS);
      if (definitions.length === 0) continue;
      senses.push({
        code,
        language: typeof e.language === "string" ? e.language : code,
        partOfSpeech: typeof e.partOfSpeech === "string" ? e.partOfSpeech : "",
        definitions,
      });
      if (senses.length >= MAX_SENSES) return senses;
    }
  }
  return senses;
}

// Vedic accent marks Wiktionary prints on Sanskrit headwords; its page titles have none.
const ACCENTS = /[॒॑᳐-᳿꣠-ꣿ]/g;

/**
 * When a word's only definitions say it is a form of another word ("inflection
 * of करना", "alternative spelling of भगवान", "nominative singular of भगवत्"),
 * that other word; otherwise null. Its meaning is what the reader wants.
 */
export function formOfLemma(senses: readonly Sense[], word: string): string | null {
  for (const sense of senses) {
    for (const definition of sense.definitions) {
      const firstLine = definition.split(" · ")[0];
      // An English gloss that ends "… of <Devanagari word>" names the word this is a
      // form of. For an English word the line must also open with a grammar label,
      // or "a kind of horse" would send the reader to "horse".
      const m = /\bof\s+([ऀ-ॿ॒॑᳐-᳿꣠-ꣿ]+)\s*(?:\([^)]*\))?\s*[:.]?\s*$/u.exec(firstLine)
        ?? /^(?:plural|singular|inflection|alternative|past|present|simple|third-person|comparative|superlative|archaic|obsolete|dated|misspelling|nonstandard)\b.*\bof\s+([A-Za-z][A-Za-z'-]*)\s*[:.]?\s*$/i.exec(firstLine);
      if (!m) return null; // a real definition comes first: this is not just a form
      const lemma = normaliseWord(m[1].replace(ACCENTS, ""));
      return lemma && lemma !== normaliseWord(word) ? lemma : null;
    }
  }
  return null;
}

export type DefinitionResult =
  | { status: "found"; senses: Sense[]; lemma: { word: string; senses: Sense[] } | null }
  | { status: "not-found" }
  | { status: "error" };

type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

async function fetchSenses(word: string, order: readonly string[], fetchImpl: FetchLike): Promise<Sense[] | "error"> {
  try {
    const res = await fetchImpl(definitionApiUrl(word), { headers: { "Api-User-Agent": API_USER_AGENT } });
    if (res.status === 404) return [];
    if (!res.ok) return "error";
    return pickSenses(await res.json(), order);
  } catch {
    return "error";
  }
}

/**
 * A word's dictionary definitions. A word that is only a form of another
 * (करते → करना) also brings that word's definitions, one step and no further.
 * "not-found" means the dictionary answered and has no entry in a language
 * that fits; "error" means it could not be reached.
 */
export async function fetchDefinitions(word: string, inVerse: boolean, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<DefinitionResult> {
  const order = languageOrder(word, inVerse);
  if (order.length === 0) return { status: "not-found" };
  const senses = await fetchSenses(word, order, fetchImpl);
  if (senses === "error") return { status: "error" };
  if (senses.length === 0) return { status: "not-found" };
  const lemmaWord = formOfLemma(senses, word);
  if (!lemmaWord) return { status: "found", senses, lemma: null };
  const lemmaSenses = await fetchSenses(lemmaWord, order, fetchImpl);
  const lemma = lemmaSenses !== "error" && lemmaSenses.length > 0 ? { word: lemmaWord, senses: lemmaSenses } : null;
  return { status: "found", senses, lemma };
}

// ── Where the card goes ──────────────────────────────────────────────────────

export interface CardPlacement {
  left: number;
  top: number;
  placement: "below" | "above";
}

/** Space kept between the card and the word, and between the card and the window edge. */
export const CARD_GAP_PX = 10;
export const CARD_MARGIN_PX = 8;

/**
 * Where the card sits for a selected word: centred under it, kept inside the
 * window, and above it instead when there is no room below. `reserve` is room
 * to leave next to the word on either side, for the highlight bar that sits
 * there (see barReserve in lib/readerHighlights).
 */
export function cardPlacement(
  word: { left: number; top: number; bottom: number; width: number },
  viewport: { width: number; height: number },
  card: { width: number; height: number },
  reserve: { above: number; below: number } = { above: 0, below: 0 },
): CardPlacement {
  const maxLeft = Math.max(CARD_MARGIN_PX, viewport.width - card.width - CARD_MARGIN_PX);
  const left = Math.min(maxLeft, Math.max(CARD_MARGIN_PX, Math.round(word.left + word.width / 2 - card.width / 2)));
  const below = word.bottom + CARD_GAP_PX + reserve.below;
  const fitsBelow = below + card.height <= viewport.height - CARD_MARGIN_PX;
  const above = word.top - CARD_GAP_PX - reserve.above - card.height;
  if (fitsBelow || above < CARD_MARGIN_PX) {
    return { left, top: Math.round(Math.min(below, Math.max(CARD_MARGIN_PX, viewport.height - card.height - CARD_MARGIN_PX))), placement: "below" };
  }
  return { left, top: Math.round(above), placement: "above" };
}
