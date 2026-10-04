import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Copy, Loader2, X } from "lucide-react";
import {
  cardPlacement, dictionaryPageUrl, dictionarySearchUrl, fetchDefinitions, findBookMeaning, lookupTarget,
  type DefinitionResult, type Sense, type WordMeaning,
} from "@/lib/wordLookup";
import { barReserve } from "@/lib/readerHighlights";

// Select a word in the book and a card under it says what it means, the way a
// Kindle does: the book's own word-for-word meaning when the verse has one,
// then the dictionary's. The lookups are in lib/wordLookup.ts; this file reads
// the selection and draws the card.
//
// It sits beside the readers' selection toolbar and does not replace it: the
// toolbar answers any selection, this card only a single word.

export interface WordLookupViewProps {
  word: string;
  bookMeaning: WordMeaning | null;
  /** The dictionary's answer, or "loading" while it is on its way. */
  result: DefinitionResult | "loading";
  copied?: boolean;
  onCopy: () => void;
  onClose: () => void;
}

const DEVANAGARI = { fontFamily: "var(--font-devanagari)" } as const;
const ICON_BUTTON = "inline-flex h-7 w-7 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800";

function Senses({ senses }: { senses: Sense[] }) {
  return (
    <>
      {senses.map((sense, i) => (
        <div key={i} className="mt-2">
          <p className="text-[11px] font-medium text-stone-500">
            {sense.language}{sense.partOfSpeech ? ` · ${sense.partOfSpeech.toLowerCase()}` : ""}
          </p>
          <ol className="mt-0.5 list-decimal space-y-0.5 pl-5 text-[13px] leading-snug text-stone-800">
            {sense.definitions.map((d, j) => <li key={j} style={DEVANAGARI}>{d}</li>)}
          </ol>
        </div>
      ))}
    </>
  );
}

/** The card's contents for one looked-up word. Pure: every state comes in as props. */
export function WordLookupView({ word, bookMeaning, result, copied, onCopy, onClose }: WordLookupViewProps) {
  const found = result !== "loading" && result.status === "found" ? result : null;
  const notFound = result !== "loading" && result.status === "not-found";
  const failed = result !== "loading" && result.status === "error";
  return (
    <>
      <div className="flex items-center justify-between px-3.5 pt-2.5">
        <span className="text-[13px] font-medium text-stone-600">Dictionary</span>
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={onCopy} className={ICON_BUTTON} title="Copy the word" aria-label="Copy the word">
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <button type="button" onClick={onClose} className={ICON_BUTTON} title="Close" aria-label="Close the dictionary">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mx-3 my-2 max-h-56 overflow-y-auto rounded-lg border border-stone-200 px-3 py-2.5">
        <p className="text-[15px] font-bold leading-snug text-stone-900" style={DEVANAGARI}>{word}</p>

        {bookMeaning && (
          <div className="mt-2">
            <p className="text-[11px] font-medium text-orange-700">From the book · शब्दार्थ</p>
            <p className="mt-0.5 text-[13px] leading-snug text-stone-800" style={DEVANAGARI}>{bookMeaning.meaning}</p>
          </div>
        )}

        {result === "loading" && (
          <p className="mt-2 flex items-center gap-1.5 text-[12px] text-stone-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking up the dictionary…
          </p>
        )}

        {found && <Senses senses={found.senses} />}
        {found?.lemma && (
          <div className="mt-2.5 border-t border-stone-100 pt-2">
            <p className="text-[13px] font-bold text-stone-900" style={DEVANAGARI}>{found.lemma.word}</p>
            <Senses senses={found.lemma.senses} />
          </div>
        )}

        {notFound && !bookMeaning && (
          <p className="mt-2 text-[12px] leading-snug text-stone-500">The dictionary has no entry for this word.</p>
        )}
        {failed && (
          <p className="mt-2 text-[12px] leading-snug text-stone-500">The dictionary could not be reached. Check the connection and select the word again.</p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 px-3.5 pb-2.5 text-[12px]">
        <span className="truncate text-stone-500">
          {found ? "Wiktionary · CC BY-SA" : bookMeaning ? "Śrīmad-Bhāgavatam" : "Wiktionary"}
        </span>
        {found ? (
          <a href={dictionaryPageUrl(found.lemma?.word ?? word, (found.lemma?.senses ?? found.senses)[0]?.language)} target="_blank" rel="noopener noreferrer" className="shrink-0 font-medium text-blue-600 hover:underline">
            Full definition
          </a>
        ) : notFound ? (
          <a href={dictionarySearchUrl(word)} target="_blank" rel="noopener noreferrer" className="shrink-0 font-medium text-blue-600 hover:underline">
            Search the dictionary
          </a>
        ) : null}
      </div>
    </>
  );
}

const CARD_WIDTH = 320;
/** Used to place the card before it has been drawn and measured. */
const CARD_HEIGHT_GUESS = 230;

interface Lookup {
  word: string;
  /** Tells one selection of the same word from another. */
  key: string;
  bookMeaning: WordMeaning | null;
  result: DefinitionResult | "loading";
  rect: { left: number; top: number; bottom: number; width: number };
}

const elementOf = (node: Node | null): Element | null =>
  !node ? null : node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;

/**
 * The book's word-for-word meanings near a selection, nearest first: the
 * शब्दार्थ sections after the selected word on its page (a verse's meanings
 * follow the verse), then those before it, then the neighbouring pages', since
 * a verse at the foot of a page has its meanings on the next.
 */
function glossaryTexts(pageEl: Element, from: Node): string[] {
  const textOf = (section: Element) =>
    Array.from(section.querySelectorAll("p"))
      .map(p => p.textContent || "")
      .filter(t => t.trim() && !/^\s*शब्दार्थ\s*[:：]?\s*$/.test(t))
      .join(" ");
  const sectionsIn = (el: Element | null) =>
    el && el.matches("[data-page-num]") ? Array.from(el.querySelectorAll('[data-section-type="shabdarth"]')) : [];
  const own = sectionsIn(pageEl);
  const after = own.filter(s => from.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING);
  const before = own.filter(s => !after.includes(s)).reverse();
  return [...after, ...before, ...sectionsIn(pageEl.nextElementSibling), ...sectionsIn(pageEl.previousElementSibling).reverse()]
    .map(textOf)
    .filter(Boolean);
}

// One answer per word for the life of the page: selecting it again is instant.
const definitionCache = new Map<string, Promise<DefinitionResult>>();
function definitionsFor(word: string, inVerse: boolean): Promise<DefinitionResult> {
  const key = `${inVerse ? "v" : "t"}|${word}`;
  let pending = definitionCache.get(key);
  if (!pending) {
    pending = fetchDefinitions(word, inVerse).then(result => {
      // A failure is not an answer: let the next selection try again.
      if (result.status === "error") definitionCache.delete(key);
      return result;
    });
    definitionCache.set(key, pending);
  }
  return pending;
}

export function WordLookupCard() {
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [copied, setCopied] = useState(false);
  const [height, setHeight] = useState(CARD_HEIGHT_GUESS);
  const cardRef = useRef<HTMLDivElement>(null);
  const rangeRef = useRef<Range | null>(null);
  const lookupRef = useRef<Lookup | null>(null);
  lookupRef.current = lookup;
  // The selection the reader closed the card on: it stays closed until they select again.
  const dismissedRef = useRef<string | null>(null);

  const close = useCallback((dismiss = false) => {
    if (dismiss && lookupRef.current) dismissedRef.current = lookupRef.current.key;
    rangeRef.current = null;
    setLookup(null);
    setCopied(false);
  }, []);

  useEffect(() => {
    let pointerDown = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const evaluate = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) { dismissedRef.current = null; return; }
      const range = sel.getRangeAt(0);
      const startEl = elementOf(range.startContainer);
      if (cardRef.current?.contains(startEl)) return; // selecting inside the card itself
      const pageEl = startEl?.closest("[data-page-num]") ?? null;
      const word = lookupTarget(sel.toString());
      // Not one word of the book: several words are the selection toolbar's.
      if (!pageEl || !word || elementOf(range.endContainer)?.closest("[data-page-num]") !== pageEl) { close(); return; }

      const r = range.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      const key = `${pageEl.getAttribute("data-page-num")}|${word}|${range.startOffset}|${(startEl?.textContent || "").length}`;
      if (key === dismissedRef.current || key === lookupRef.current?.key) return;
      dismissedRef.current = null;

      const section = startEl?.closest("[data-section-type]")?.getAttribute("data-section-type") ?? "";
      // A word of a verse, or a headword in the word meanings, is Sanskrit first.
      const inVerse = section === "shlok" || section === "ref-shlok" || (section === "shabdarth" && !startEl?.closest("strong"));
      rangeRef.current = range.cloneRange();
      setCopied(false);
      setLookup({
        word,
        key,
        bookMeaning: findBookMeaning(word, glossaryTexts(pageEl, range.startContainer)),
        result: "loading",
        rect: { left: r.left, top: r.top, bottom: r.bottom, width: r.width },
      });
      void definitionsFor(word, inVerse).then(result => {
        setLookup(current => (current && current.key === key ? { ...current, result } : current));
      });
    };

    const schedule = (delay: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { if (!pointerDown) evaluate(); }, delay);
    };
    const onSelectionChange = () => schedule(250);
    const onPointerDown = (e: PointerEvent) => {
      pointerDown = true;
      // A press anywhere else puts the card away; a new selection brings a new one.
      if (lookupRef.current && !cardRef.current?.contains(e.target as Node)) close();
    };
    const onPointerUp = () => { pointerDown = false; schedule(60); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && lookupRef.current) close(true); };

    // The word moved (the page scrolled, or Kindle mode turned): follow it, or
    // put the card away once the word is no longer on screen.
    const onMove = () => {
      const range = rangeRef.current;
      if (!range || !lookupRef.current) return;
      const r = range.getBoundingClientRect();
      const owner = elementOf(range.startContainer);
      const onScreen = r.width > 0 && r.bottom > 0 && r.top < window.innerHeight
        && document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).some(el => el === owner || owner?.contains(el));
      if (!onScreen) { close(); return; }
      setLookup(current => (current ? { ...current, rect: { left: r.left, top: r.top, bottom: r.bottom, width: r.width } } : current));
    };

    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointercancel", onPointerUp, true);
    document.addEventListener("keydown", onKey);
    document.addEventListener("scroll", onMove, { capture: true, passive: true });
    window.addEventListener("resize", onMove);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerUp, true);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("scroll", onMove, { capture: true });
      window.removeEventListener("resize", onMove);
    };
  }, [close]);

  // The card grows when the dictionary answers; measure it so it stays on screen.
  useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight;
    if (h && h !== height) setHeight(h);
  });

  if (!lookup) return null;

  const copy = () => {
    void navigator.clipboard?.writeText(lookup.word).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }).catch(() => { /* clipboard refused: nothing to show */ });
  };
  const width = Math.min(CARD_WIDTH, window.innerWidth - 16);
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  // The highlight bar sits right next to the selected word; the card keeps clear of it.
  const coarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  const place = cardPlacement(lookup.rect, viewport, { width, height }, barReserve(lookup.rect, viewport, coarse));

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-label={`Dictionary: ${lookup.word}`}
      className="fixed z-50 rounded-2xl border border-stone-200 bg-white text-stone-800 shadow-2xl"
      style={{ left: place.left, top: place.top, width, fontSize: 13, lineHeight: 1.5 }}
      // Keep the word selected while the card is used (a press would clear it).
      onMouseDown={e => e.preventDefault()}
    >
      <WordLookupView
        word={lookup.word}
        bookMeaning={lookup.bookMeaning}
        result={lookup.result}
        copied={copied}
        onCopy={copy}
        onClose={() => close(true)}
      />
    </div>
  );
}
