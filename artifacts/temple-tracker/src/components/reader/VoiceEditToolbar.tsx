import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Bold, BookOpen, Check, Combine, CornerDownLeft, Delete, Eraser, GripHorizontal,
  ImageIcon, Keyboard, Loader2, Sparkles, Square, Undo2, Volume2, Wand2, X,
} from "lucide-react";
import { describeFailure } from "@/lib/requestError";
import { SUPABASE_ANON_KEY, SUPABASE_URL, sbFetch } from "@/lib/sbRest";
import { sarvamStreamPlay } from "@/lib/tts";
import { escapeRegExp, locateSelectionInSource, normalizeBoldKey, normalizeDashKey, tidyAiText } from "@/lib/readerText";
import { renderInlineBoldBlock } from "@/lib/inlineBold";

// The selection toolbar the three readers share: Listen, Meaning, bold, join /
// split, an on-screen Devanagari keyboard, and the AI correction that rewrites
// the page source and stores it in {book}_page_edits.
//
// It was one copy per reader page, with only the book's name and table differing
// — and the Gita page had no copy at all, so the Gita could not be corrected.
// The book it is editing now comes in as a prop.

export interface ReaderBook {
  /** The book's key, as stored on a scene row: "bhagavatam", "chaitanya", "gita". */
  key: string;
  /** Where a corrected page is stored, e.g. "gita_page_edits". */
  pageEditsTable: string;
}

export interface PageContent {
  pageNumber: number;
  text: string;
  textEn?: string;
}

export interface VoiceEditToolbarProps {
  book: ReaderBook;
  allPages: PageContent[];
  setAllPages: React.Dispatch<React.SetStateAction<PageContent[]>>;
  unboldLines: Set<string>;
  onUnboldChange: (next: Set<string>) => void;
  /**
   * The pages this edit rewrote. A reader that is still loading batches in the
   * background needs to know, or its next merge would put the uncorrected text
   * back on screen until the page is reloaded.
   */
  onEdited?: (edits: Array<{ pageNumber: number; text: string }>) => void;
}

// ── On-screen Devanagari keyboard ────────────────────────────────────────

const DEVA_VOWELS = ["अ","आ","इ","ई","उ","ऊ","ऋ","ए","ऐ","ओ","औ","अं","अः"];
const DEVA_CONSONANTS = [
  ["क","ख","ग","घ","ङ"],
  ["च","छ","ज","झ","ञ"],
  ["ट","ठ","ड","ढ","ण"],
  ["त","थ","द","ध","न"],
  ["प","फ","ब","भ","म"],
  ["य","र","ल","व","श"],
  ["ष","स","ह","क्ष","त्र"],
  ["ज्ञ","श्र","ड़","ढ़","फ़"],
];
const DEVA_MATRAS = ["ा","ि","ी","ु","ू","ृ","े","ै","ो","ौ","ं","ः","ँ","्"];
const DEVA_DIGITS = ["०","१","२","३","४","५","६","७","८","९"];
const DEVA_PUNCT = ["।","॥","—","-",",",":",";","?","!","(",")"];

function ManualFixKeyboard({ value, onChange, onSave, onCancel }: {
  value: string;
  onChange: (v: string) => void;
  onSave: (v: string) => void;
  onCancel: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const insertAtCursor = useCallback((chars: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      onChange(value + chars);
      return;
    }
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    const next = value.slice(0, start) + chars + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      const t = textareaRef.current;
      if (!t) return;
      t.focus();
      const pos = start + chars.length;
      t.setSelectionRange(pos, pos);
    });
  }, [value, onChange]);

  const backspace = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) {
      onChange(value.slice(0, -1));
      return;
    }
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    let next: string;
    let nextPos: number;
    if (start !== end) {
      next = value.slice(0, start) + value.slice(end);
      nextPos = start;
    } else if (start === 0) {
      return;
    } else {
      next = value.slice(0, start - 1) + value.slice(start);
      nextPos = start - 1;
    }
    onChange(next);
    requestAnimationFrame(() => {
      const t = textareaRef.current;
      if (!t) return;
      t.focus();
      t.setSelectionRange(nextPos, nextPos);
    });
  }, [value, onChange]);

  useEffect(() => {
    const t = textareaRef.current;
    if (!t) return;
    t.focus();
    const len = t.value.length;
    t.setSelectionRange(len, len);
  }, []);

  const Key = ({ ch, wide = false }: { ch: string; wide?: boolean }) => (
    <button
      type="button"
      onMouseDown={e => e.preventDefault()}
      onClick={() => insertAtCursor(ch)}
      className={`${wide ? "px-4" : "px-2"} py-1.5 text-base font-medium rounded-md bg-white border border-stone-200 hover:bg-emerald-50 hover:border-emerald-300 active:bg-emerald-100 transition-colors`}
      style={{ fontFamily: "var(--font-devanagari)" }}
    >
      {ch}
    </button>
  );

  return (
    <div className="mb-2 p-3 rounded-lg bg-emerald-50/70 border-2 border-emerald-200">
      <div className="flex items-center gap-1.5 mb-2">
        <Keyboard className="w-3.5 h-3.5 text-emerald-700" />
        <span className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">Manual fix</span>
        <span className="text-[10px] text-stone-500 ml-auto">tap keys or type with your own keyboard</span>
      </div>

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        lang="hi"
        inputMode="text"
        className="w-full text-base text-stone-900 mb-2.5 px-3 py-2 bg-white border border-emerald-300 rounded-lg focus:outline-none focus:border-emerald-500 resize-y"
        style={{ fontFamily: "var(--font-devanagari)" }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSave(value);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
      />

      <div className="space-y-1.5" onMouseDown={e => e.preventDefault()}>
        <div className="flex flex-wrap gap-1 justify-center">
          {DEVA_VOWELS.map(c => <Key key={c} ch={c} />)}
        </div>
        {DEVA_CONSONANTS.map((row, ri) => (
          <div key={ri} className="flex flex-wrap gap-1 justify-center">
            {row.map(c => <Key key={c} ch={c} />)}
          </div>
        ))}
        <div className="flex flex-wrap gap-1 justify-center pt-1 border-t border-emerald-200/60">
          {DEVA_MATRAS.map(c => <Key key={c} ch={c} />)}
        </div>
        <div className="flex flex-wrap gap-1 justify-center">
          {DEVA_DIGITS.map(c => <Key key={c} ch={c} />)}
        </div>
        <div className="flex flex-wrap gap-1 justify-center">
          {DEVA_PUNCT.map(c => <Key key={c} ch={c} />)}
        </div>
        <div className="flex gap-1 justify-center pt-1">
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={() => insertAtCursor(" ")}
            className="px-12 py-1.5 text-xs font-medium rounded-md bg-white border border-stone-200 hover:bg-emerald-50 hover:border-emerald-300 transition-colors"
          >
            Space
          </button>
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={backspace}
            className="px-4 py-1.5 text-xs font-medium rounded-md bg-white border border-stone-200 hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-colors flex items-center gap-1"
            title="Delete the character before the cursor"
          >
            <Delete className="w-3.5 h-3.5" /> Backspace
          </button>
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        <button
          type="button"
          onClick={() => onSave(value)}
          className="flex-1 px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
        >
          Apply &amp; save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 rounded-lg"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}



// ── Selection Toolbar (Listen / Meaning / AI fix for highlighted text) ────

export function VoiceEditToolbar({ book, allPages, setAllPages, unboldLines, onUnboldChange, onEdited }: VoiceEditToolbarProps) {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0, bottom: 0 });
  const [forceFlipBelow, setForceFlipBelow] = useState(false);
  // Drag-to-move: once the user drags the toolbar, dragPos pins it there
  // (overriding the default left dock) for the rest of the session.
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const dragOffsetRef = useRef({ dx: 0, dy: 0 });

  // ── AI-activity glow ───────────────────────────────────────────────────────
  // Pulsing saffron outline + shimmer over the selected text while an AI fix
  // runs — visible feedback that "AI is working on this". One glow box per
  // rendered line (Range.getClientRects), re-anchored on scroll/resize via
  // the cloned Range so the glow stays glued to the words.
  const [aiGlowRects, setAiGlowRects] = useState<Array<{ left: number; top: number; width: number; height: number }>>([]);
  // Brief blue tint on the text that changed, so it is obvious WHAT was edited.
  const [appliedRects, setAppliedRects] = useState<Array<{ left: number; top: number; width: number; height: number }>>([]);
  const appliedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashApplied = useCallback((newText: string, pageNum: number | null) => {
    const probe = newText.replace(/\*\*/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (!probe) return;
    requestAnimationFrame(() => setTimeout(() => {
      try {
        const scope = (pageNum ? document.querySelector(`[data-page-num="${pageNum}"]`) : null) || document.body;
        const hits = Array.from(scope.querySelectorAll("p"))
          .filter(el => (el.textContent || "").replace(/\s+/g, " ").includes(probe))
          .slice(0, 6);
        const rects = hits.flatMap(el => {
          const r = el.getBoundingClientRect();
          return r.width > 2 && r.height > 4
            ? [{ left: r.left - 2, top: r.top - 1, width: r.width + 4, height: r.height + 2 }]
            : [];
        });
        if (!rects.length) return;
        if (appliedTimer.current) clearTimeout(appliedTimer.current);
        setAppliedRects(rects);
        appliedTimer.current = setTimeout(() => setAppliedRects([]), 1600);
      } catch { /* cosmetic only */ }
    }, 60));
  }, []);

  const aiGlowRangeRef = useRef<Range | null>(null);
  const aiGlowPulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const computeGlowRects = useCallback((): Array<{ left: number; top: number; width: number; height: number }> => {
    const range = aiGlowRangeRef.current;
    if (!range) return [];
    try {
      const rects = Array.from(range.getClientRects())
        .filter(r => r.width > 2 && r.height > 4)
        .slice(0, 14)
        .map(r => ({ left: r.left - 3, top: r.top - 2, width: r.width + 6, height: r.height + 4 }));
      if (rects.length > 0) return rects;
      const b = range.getBoundingClientRect();
      return b.width > 0 ? [{ left: b.left - 3, top: b.top - 2, width: b.width + 6, height: b.height + 4 }] : [];
    } catch { return []; }
  }, []);

  const startAiGlow = useCallback(() => {
    if (aiGlowPulseTimer.current) { clearTimeout(aiGlowPulseTimer.current); aiGlowPulseTimer.current = null; }
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) aiGlowRangeRef.current = sel.getRangeAt(0).cloneRange();
    } catch { /* keep previous range */ }
    setAiGlowRects(computeGlowRects());
  }, [computeGlowRects]);

  const stopAiGlow = useCallback(() => {
    if (aiGlowPulseTimer.current) { clearTimeout(aiGlowPulseTimer.current); aiGlowPulseTimer.current = null; }
    aiGlowRangeRef.current = null;
    setAiGlowRects([]);
  }, []);

  // One-shot pulse for instant (non-async) actions — bold, join, new paragraph.
  const pulseAiGlow = useCallback(() => {
    startAiGlow();
    aiGlowPulseTimer.current = setTimeout(() => stopAiGlow(), 900);
  }, [startAiGlow, stopAiGlow]);

  // Re-anchor the glow while the page scrolls or resizes.
  useEffect(() => {
    if (aiGlowRects.length === 0) return;
    let raf = 0;
    const reanchor = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setAiGlowRects(computeGlowRects()));
    };
    window.addEventListener("scroll", reanchor, { passive: true, capture: true });
    window.addEventListener("resize", reanchor);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", reanchor, { capture: true } as EventListenerOptions);
      window.removeEventListener("resize", reanchor);
    };
  }, [aiGlowRects.length, computeGlowRects]);

  const [selectedText, setSelectedText] = useState("");
  const [appliedFlash, setAppliedFlash] = useState(false);
  const pageNumRef = useRef<number | null>(null);
  const selectionContextRef = useRef<{ before: string; after: string }>({ before: "", after: "" });
  const [selectionIsBoldDom, setSelectionIsBoldDom] = useState(false);
  // Whether the selection sits inside a shlok (verse) section — the only place
  // the structural un-bold override applies.
  const [selectionInShlok, setSelectionInShlok] = useState(false);
  // Normalized RENDERED-line keys of the shlok <p>s the selection intersects,
  // captured at selection time — they EXACTLY match the shlok renderer's
  // normalizeBoldKey(sec.lines[j]) keys, so un-bold is immune to OCR-cleaning.
  const selectionShlokKeysRef = useRef<string[]>([]);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<{
    suggested_text: string;
    explanation: string;
    changes: Array<{ from: string; to: string; reason: string }>;
    confidence: "high" | "medium" | "low";
  } | null>(null);
  const [quickFixLoading, setQuickFixLoading] = useState(false);
  const [manualFixMode, setManualFixMode] = useState(false);
  const [manualFixText, setManualFixText] = useState("");

  const [dictResult, setDictResult] = useState<{ word: string; meaning: string; examples: string[] } | null>(null);
  const [dictLoading, setDictLoading] = useState(false);

  useEffect(() => {
    if (!show) {
      if (ttsAudioRef.current) { ttsAudioRef.current.pause(); ttsAudioRef.current = null; }
      window.speechSynthesis.cancel();
      setTtsPlaying(false);
      setTtsLoading(false);
      setSuggestion(null);
      setSuggestLoading(false);
      setQuickFixLoading(false);
      setManualFixMode(false);
      setManualFixText("");
      setSelectionIsBoldDom(false);
      setSelectionInShlok(false);
      selectionShlokKeysRef.current = [];
      setDictResult(null);
      setDictLoading(false);
    }
  }, [show]);
  useEffect(() => () => { ttsAudioRef.current?.pause(); window.speechSynthesis.cancel(); }, []);

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const onSelectionChange = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.toString().trim()) {
          if (!ttsPlaying && !ttsLoading && !toolbarRef.current?.contains(document.activeElement)) {
            setShow(false);
          }
          return;
        }
        const text = sel.toString().trim();
        if (text.length < 2) return;

        const range = sel.getRangeAt(0);
        const startEl = range.startContainer.parentElement?.closest("[data-page-num]") as HTMLElement | null;
        const endEl = range.endContainer.parentElement?.closest("[data-page-num]") as HTMLElement | null;
        const startPage = startEl ? parseInt(startEl.getAttribute("data-page-num") || "0", 10) : 0;
        const endPage = endEl ? parseInt(endEl.getAttribute("data-page-num") || "0", 10) : 0;
        let pageEl: HTMLElement | null = startEl;
        let pageNum = startPage;
        if (startPage && endPage && startPage !== endPage && startEl && endEl) {
          const startLen = (() => {
            try {
              const r = document.createRange();
              r.setStart(range.startContainer, range.startOffset);
              r.setEnd(startEl, startEl.childNodes.length);
              return r.toString().length;
            } catch { return 0; }
          })();
          const endLen = text.length - startLen;
          if (endLen > startLen) { pageEl = endEl; pageNum = endPage; }
        }

        let ctxBefore = "";
        let ctxAfter = "";
        if (pageEl) {
          try {
            const beforeRange = document.createRange();
            beforeRange.setStart(pageEl, 0);
            beforeRange.setEnd(range.startContainer, range.startOffset);
            const beforeFull = beforeRange.toString();
            ctxBefore = beforeFull.slice(-40);

            const afterRange = document.createRange();
            afterRange.setStart(range.endContainer, range.endOffset);
            afterRange.setEndAfter(pageEl);
            const afterFull = afterRange.toString();
            ctxAfter = afterFull.slice(0, 40);
          } catch { /* */ }
        }

        const rect = range.getBoundingClientRect();
        setPosition({ x: rect.left + rect.width / 2, y: rect.top - 10, bottom: rect.bottom });
        setForceFlipBelow(false);
        setSelectedText(text);
        selectionContextRef.current = { before: ctxBefore, after: ctxAfter };
        pageNumRef.current = pageNum;

        // Bold detection must work for the natural WHOLE-VERSE gesture too:
        // shloks put font-bold on each per-line <p> but wrap them in a plain
        // <div>, so a multi-line selection's commonAncestorContainer is that
        // NON-bold wrapper. Also probe the selection's start/end boundary nodes,
        // then scan the bold blocks the range actually intersects.
        // Threshold is font-weight >= 700 (Tailwind font-bold = verses) so the
        // font-semibold (600) section labels like "तात्पर्य :" are NOT read as bold;
        // `**` markdown renders as <strong>, still caught by the tag check.
        let domBold = false;
        let shlokKeys: string[] = [];
        try {
          const isBoldFrom = (n: Node | null): boolean => {
            let node: Node | null = n;
            if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
            while (node && node instanceof HTMLElement) {
              const tag = node.tagName?.toUpperCase();
              if (tag === "STRONG" || tag === "B") return true;
              const fw = window.getComputedStyle(node).fontWeight;
              if (fw === "bold" || (fw && parseInt(fw, 10) >= 700)) return true;
              if (node.hasAttribute && node.hasAttribute("data-page-num")) break;
              node = node.parentNode;
            }
            return false;
          };
          domBold =
            isBoldFrom(range.startContainer) ||
            isBoldFrom(range.endContainer) ||
            isBoldFrom(range.commonAncestorContainer);
          if (!domBold) {
            const anc = range.commonAncestorContainer;
            const ancEl = anc.nodeType === Node.TEXT_NODE ? anc.parentElement : (anc as HTMLElement);
            const blocks = ancEl?.querySelectorAll?.("p, strong, b");
            if (blocks) {
              for (const b of Array.from(blocks)) {
                if (range.intersectsNode(b) && isBoldFrom(b)) { domBold = true; break; }
              }
            }
          }
          // Collect the RENDERED text of each shlok (verse) <p> the selection
          // intersects. Keying off the rendered line — not the raw OCR source —
          // guarantees the key equals the renderer's normalizeBoldKey(sec.lines[j]),
          // so the un-bold override is immune to OCR-cleaning and page-number
          // stripping that make raw source differ from what is displayed. A sub-line
          // selection still intersects the whole <p>, so it maps to the full-line
          // key; verses are the ONLY structurally-bold content the override applies
          // to, so tatparya/shabdarth never trigger it.
          const anc2 = range.commonAncestorContainer;
          const ancEl2 = anc2.nodeType === Node.TEXT_NODE ? anc2.parentElement : (anc2 as HTMLElement);
          const pageEl = (ancEl2?.closest?.("[data-page-num]") as HTMLElement | null) || ancEl2 || null;
          const shlokPs = pageEl?.querySelectorAll?.('[data-section-type="shlok"] p');
          if (shlokPs) {
            for (const p of Array.from(shlokPs)) {
              if (range.intersectsNode(p)) {
                const k = normalizeBoldKey(p.textContent || "");
                if (k) shlokKeys.push(k);
              }
            }
          }
          // शब्दार्थ word-meanings are bolded by the renderer (<strong>), so they
          // need the same override. The `strong` guard skips the section's own
          // "शब्दार्थ" heading, which carries no meanings.
          const shabPs = pageEl?.querySelectorAll?.('[data-section-type="shabdarth"] p');
          if (shabPs) {
            for (const p of Array.from(shabPs)) {
              if (range.intersectsNode(p) && p.querySelector("strong")) {
                const k = normalizeDashKey(p.textContent || "");
                if (k) shlokKeys.push(k);
              }
            }
          }
        } catch { /* */ }
        selectionShlokKeysRef.current = shlokKeys;
        setSelectionIsBoldDom(domBold);
        setSelectionInShlok(shlokKeys.length > 0);

        setShow(true);
      }, 250);
    };

    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [ttsPlaying, ttsLoading]);

  useEffect(() => {
    if (!show) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (toolbarRef.current?.contains(target)) return;
      if (ttsPlaying || ttsLoading) return;
      setShow(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [show, ttsPlaying, ttsLoading]);

  const applyEdit = useCallback(async (oldText: string, newText: string) => {
    const pageNum = pageNumRef.current;
    if (!pageNum || !oldText || !newText || oldText === newText) {
      window.getSelection()?.removeAllRanges();
      return;
    }

    // Section labels ("तात्पर्य :", "अनुवाद :", "शब्दार्थ :") are injected by the
    // renderer at the start of each section and do NOT exist in page.text. Strip
    // a label ONLY when it follows a newline (the section boundary), keeping that
    // newline — so a verse→purport selection maps to the source, while a literal
    // "तात्पर्य" OCR-joined mid-line (which IS in the source) is preserved.
    const SECTION_LABEL_RE = /\n[^\S\n]*(?:तात्पर्य|अनुवाद|शब्दार्थ)[^\S\n]*[:：ः][^\S\n]*/gu;
    const stripRenderArtifacts = (s: string): { stripped: string; leftTrim: string; rightTrim: string } => {
      const original = s;
      let leftTrim = "";
      let rightTrim = "";
      let cleaned = s;
      const leadingRe = /^\s*(?:तात्पर्य\s*[:：]|अनुवाद\s*[:：]|शब्दार्थ\s*[:：])\s*/u;
      const lm = cleaned.match(leadingRe);
      if (lm) {
        leftTrim = lm[0];
        cleaned = cleaned.slice(lm[0].length);
      }
      cleaned = cleaned.replace(/\s*[·•∙]\s*\d{1,5}\s*[·•∙]\s*/g, " ").trim();
      cleaned = cleaned.replace(SECTION_LABEL_RE, "\n");
      const m2 = cleaned.match(/^(\s*)([\s\S]*?)(\s*)$/);
      if (m2) {
        cleaned = m2[2];
      }
      if (cleaned !== original) {
        rightTrim = original.slice(original.length - (original.length - leftTrim.length - cleaned.length));
      }
      return { stripped: cleaned, leftTrim, rightTrim };
    };

    const { stripped: cleanedOld, leftTrim, rightTrim } = stripRenderArtifacts(oldText);
    if (cleanedOld.length < 1) {
      window.getSelection()?.removeAllRanges();
      setTimeout(() => alert(
        "Selection is empty after stripping rendering-only text. Pick the actual content.",
      ), 0);
      return;
    }
    let cleanedNew = newText;
    if (leftTrim) {
      if (cleanedNew.startsWith(leftTrim)) {
        cleanedNew = cleanedNew.slice(leftTrim.length);
      } else if (cleanedNew.startsWith("**" + leftTrim)) {
        // "Make bold" wrapped the whole selection INCLUDING the render-only
        // label (e.g. "**तात्पर्य : x**"). Keep the `**` but drop the label so it
        // isn't baked into the source as bold (which would double the label).
        cleanedNew = "**" + cleanedNew.slice(("**" + leftTrim).length);
      }
    }
    if (rightTrim && cleanedNew.endsWith(rightTrim)) cleanedNew = cleanedNew.slice(0, cleanedNew.length - rightTrim.length);
    cleanedNew = cleanedNew.replace(SECTION_LABEL_RE, "\n");
    const effectiveOld = cleanedOld;
    const effectiveNew = cleanedNew.trim() || newText;

    // Compute the edit from the CURRENT pages state (allPages), then apply it
    // with a pure state updater and run all side effects (alerts, Supabase
    // POST) outside — React 18 may defer or double-invoke updater functions
    // (e.g. in StrictMode), so updaters must stay side-effect free.
    const computeEdit = (pages: PageContent[]): Array<{ pageNumber: number; text: string }> | null => {
      const targetPage = pages.find(p => p.pageNumber === pageNum);
      if (!targetPage) return null;

      const sourceText = targetPage.text;
      const escapeForRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const ctxBefore = selectionContextRef.current.before || "";
      const ctxAfter = selectionContextRef.current.after || "";

      const QUOTE_CLASS = "[\\u0022\\u0027\\u00B4\\u0060\\u2018\\u2019\\u201A\\u201B\\u201C\\u201D\\u201E\\u201F\\u02BB\\u02BC\\u2032\\u2033]";
      const QUOTE_RE = /["'´`‘’‚‛“”„‟ʻʼ′″]/;

      const DANDA_CLASS = "[\\u0964\\u0965\\u007C]";
      const VISARGA_CLASS = "[\\u0903\\u003A]";
      const buildFlexibleRegex = (chunk: string): string => {
        return chunk
          .normalize("NFC")
          .split("")
          .map((ch) => {
            if (/\s/.test(ch)) return "\\s+";
            if (/[-‐-―−]/.test(ch)) return "[\\u002D\\u2010-\\u2015\\u2212]";
            if (ch === "।" || ch === "॥" || ch === "|") return DANDA_CLASS;
            if (ch === "ः" || ch === ":") return VISARGA_CLASS;
            if (QUOTE_RE.test(ch)) return QUOTE_CLASS;
            if (ch === "‍" || ch === "‌") return "[\\u200D\\u200C]?";
            return escapeForRegex(ch) + "[\\u200D\\u200C]?";
          })
          .join("");
      };

      let fullNewText = sourceText;

      if (ctxBefore || ctxAfter) {
        try {
          const beforeAnchor = ctxBefore.length >= 8 ? buildFlexibleRegex(ctxBefore.slice(-25)) : "";
          const afterAnchor = ctxAfter.length >= 8 ? buildFlexibleRegex(ctxAfter.slice(0, 25)) : "";
          const middle = buildFlexibleRegex(effectiveOld);
          const reStr =
            (beforeAnchor ? `(?<=${beforeAnchor})` : "") +
            middle +
            (afterAnchor ? `(?=${afterAnchor})` : "");
          const re = new RegExp(reStr);
          if (re.test(sourceText)) {
            fullNewText = sourceText.replace(re, effectiveNew);
          }
        } catch { /* */ }
      }

      if (fullNewText === sourceText) {
        fullNewText = sourceText.replace(effectiveOld, effectiveNew);
      }

      if (fullNewText === sourceText) {
        try {
          const re = new RegExp(buildFlexibleRegex(effectiveOld));
          fullNewText = sourceText.replace(re, effectiveNew);
        } catch { /* */ }
      }

      // STRATEGY 2.5: Shared robust locator (BUG 2/3 fix) — whitespace-flexible
      // and bold-marker-insensitive. Catches cases strategies 1-2 miss, notably
      // reverting a Quick AI fix via Undo: the AI's suggested_text needs to be
      // re-located in the current source, and it may now sit inside/adjacent to
      // "**...**" markers or have slightly different whitespace than when it
      // was first inserted. Uses (index, matchLength) — never a naive .replace —
      // so we always touch the exact located span, not a different occurrence.
      if (fullNewText === sourceText) {
        const loc = locateSelectionInSource(sourceText, effectiveOld);
        if (loc) {
          fullNewText = sourceText.slice(0, loc.index) + effectiveNew + sourceText.slice(loc.index + loc.matchLength);
        }
      }

      // Whitespace/glyph-normalizing cleaner with an index map back to the
      // original string. Shared by strategy 3 (same-page anchor match) and
      // strategy 5 (cross-page split).
      const cleanWithMap = (text: string): { cleaned: string; map: number[] } => {
        const map: number[] = [];
        let cleaned = "";
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          if (/\s/.test(ch)) continue;
          if (ch === "‍" || ch === "‌") continue;
          let mapped = ch.normalize("NFC");
          if (/[-‐-―−]/.test(mapped)) mapped = "-";
          if (mapped === "।" || mapped === "॥" || mapped === "|") mapped = "।";
          if (mapped === "ः" || mapped === ":") mapped = "ः";
          if (QUOTE_RE.test(mapped)) mapped = '"';
          cleaned += mapped;
          map.push(i);
        }
        return { cleaned, map };
      };
      const stripSel = (s: string) =>
        s.normalize("NFC")
          .replace(/[‐-―−]/g, "-")
          .replace(/[॥|]/g, "।")
          .replace(/[:]/g, "ः")
          .replace(/["'´`‘’‚‛“”„‟ʻʼ′″]/g, '"')
          .replace(/[‍‌]/g, "")
          .replace(/\s+/g, "");

      if (fullNewText === sourceText && effectiveOld.trim().length > 24) {
        const { cleaned, map: cleanedChars } = cleanWithMap(sourceText);
        const head = stripSel(effectiveOld.slice(0, 16));
        const tail = stripSel(effectiveOld.slice(-16));
        const startInClean = head ? cleaned.indexOf(head) : -1;
        if (startInClean >= 0 && tail) {
          const tailIdx = cleaned.indexOf(tail, startInClean + head.length);
          if (tailIdx >= 0) {
            const realStart = cleanedChars[startInClean];
            const cleanedEndIdx = tailIdx + tail.length;
            const realEnd = cleanedEndIdx < cleanedChars.length
              ? cleanedChars[cleanedEndIdx]
              : cleanedChars[cleanedChars.length - 1] + 1;
            fullNewText = sourceText.slice(0, realStart) + effectiveNew + sourceText.slice(realEnd);
          }
        }
      }

      if (fullNewText === sourceText && effectiveOld.trim().length > 24) {
        const wordify = (s: string) => s
          .normalize("NFC")
          .replace(/[‍‌]/g, "")
          .replace(/[।॥.,;:!?"'´`‘’‚‛“”„‟ʻʼ′″\-‐-―−()\[\]{}]/g, " ")
          .split(/\s+/)
          .filter(w => w.length >= 3);

        const oldWords = wordify(effectiveOld);
        if (oldWords.length >= 2) {
          const first = oldWords[0];
          const last = oldWords[oldWords.length - 1];
          const startIdx = sourceText.indexOf(first);
          if (startIdx >= 0) {
            const endIdx = sourceText.indexOf(last, startIdx + first.length);
            if (endIdx >= 0) {
              const realEnd = endIdx + last.length;
              const rangeLen = realEnd - startIdx;
              const oldLen = effectiveOld.length;
              if (rangeLen >= oldLen * 0.5 && rangeLen <= oldLen * 2.5) {
                fullNewText = sourceText.slice(0, startIdx) + effectiveNew + sourceText.slice(realEnd);
              }
            }
          }
        }
      }

      if (fullNewText === sourceText) {
        const tryPages = [pageNum - 1, pageNum + 1, pageNum - 2, pageNum + 2];
        for (const tryNum of tryPages) {
          if (tryNum < 1) continue;
          const tryPage = pages.find(p => p.pageNumber === tryNum);
          if (!tryPage) continue;
          const src = tryPage.text;
          let replaced = src.replace(effectiveOld, effectiveNew);
          if (replaced === src) {
            try { replaced = src.replace(new RegExp(buildFlexibleRegex(effectiveOld)), effectiveNew); } catch { /* */ }
          }
          if (replaced !== src) {
            console.info(`[applyEdit] matched on adjacent page ${tryNum} (selection-captured page was ${pageNum})`);
            return [{ pageNumber: tryNum, text: replaced }];
          }
        }

        // STRATEGY 5: Cross-page split. The renderer merges page boundaries
        // (cross-page paragraphs/shlokas), so a selection can legitimately
        // start at the END of one OCR page and continue at the START of the
        // next — no single page contains the whole selection. Find the split:
        // longest suffix of page A's cleaned text that is a prefix of the
        // cleaned selection, remainder matching the start of page B. The
        // replacement lands at the end of page A; the consumed prefix of
        // page B is removed. Uses the pages-array index (not pageNumber±1)
        // so chaitanya's synthesized batch*100000+n numbering works too.
        const strippedSel = stripSel(effectiveOld);
        if (strippedSel.length >= 12) {
          const idxInArr = pages.findIndex(p => p.pageNumber === pageNum);
          const pairs: Array<[PageContent, PageContent]> = [];
          if (idxInArr >= 0) {
            if (idxInArr + 1 < pages.length) pairs.push([pages[idxInArr], pages[idxInArr + 1]]);
            if (idxInArr - 1 >= 0) pairs.push([pages[idxInArr - 1], pages[idxInArr]]);
          }
          for (const [pa, pb] of pairs) {
            const A = cleanWithMap(pa.text);
            const B = cleanWithMap(pb.text);
            let k = -1;
            const maxK = Math.min(strippedSel.length - 4, A.cleaned.length);
            for (let cand = maxK; cand >= 4; cand--) {
              if (A.cleaned.endsWith(strippedSel.slice(0, cand))) { k = cand; break; }
            }
            if (k < 4) continue;
            const rest = strippedSel.slice(k);
            if (!rest) continue;
            // Page B's OCR source almost always begins with the book's PRINTED
            // page number, which the renderer strips for display — so it can never
            // appear in the selection. Comparing raw source against a rendered
            // selection therefore failed here, which is why a sentence running
            // across a page break reported "Couldn't locate the highlighted text".
            const bLead = /^\d{1,5}/.exec(B.cleaned);
            const bSkip = bLead && B.cleaned.slice(bLead[0].length).startsWith(rest) ? bLead[0].length : 0;
            if (!B.cleaned.slice(bSkip).startsWith(rest)) continue;
            const startA = A.map[A.cleaned.length - k];
            const endClean = bSkip + rest.length;
            const endB = endClean < B.map.length ? B.map[endClean] : pb.text.length;
            console.info(`[applyEdit] cross-page split matched: pages ${pa.pageNumber}+${pb.pageNumber}, ${k}/${strippedSel.length} cleaned chars on first page`);
            return [
              { pageNumber: pa.pageNumber, text: pa.text.slice(0, startA) + effectiveNew },
              { pageNumber: pb.pageNumber, text: pb.text.slice(endB) },
            ];
          }
        }

        console.warn("[applyEdit] All strategies + adjacent-page fallback failed:", {
          pageNum,
          triedPages: tryPages,
          oldText: oldText.slice(0, 80) + (oldText.length > 80 ? "…" : ""),
          effectiveOld: effectiveOld.slice(0, 80) + (effectiveOld.length > 80 ? "…" : ""),
          leftTrim, rightTrim,
          oldTextLen: oldText.length,
          newText: newText.slice(0, 80) + (newText.length > 80 ? "…" : ""),
          sourcePreview: sourceText.slice(0, 200),
        });
        setTimeout(() => alert(
          "Couldn't locate the highlighted text in the page source.\n\n" +
          "This usually means the selection spans content from a different page, " +
          "or contains rendering-only text. Try selecting a smaller piece within one paragraph.",
        ), 0);
        return null;
      }

      return [{ pageNumber: pageNum, text: fullNewText }];
    };

    const edits = computeEdit(allPages);
    if (!edits || edits.length === 0) return;

    // Pure updater — the replacement texts were computed above, outside React.
    // Cross-page splits produce TWO page updates; apply them atomically.
    const editByPage = new Map(edits.map(e => [e.pageNumber, e.text]));
    setAllPages(prev => prev.map(p => editByPage.has(p.pageNumber) ? { ...p, text: editByPage.get(p.pageNumber)! } : p));
    onEdited?.(edits);
    window.getSelection()?.removeAllRanges();
    setAppliedFlash(true);
    setTimeout(() => setAppliedFlash(false), 1500);

    for (const edit of edits) {
      try {
        const res = await sbFetch(book.pageEditsTable, {
          method: "POST",
          headers: { Prefer: "return=representation,resolution=merge-duplicates" },
          body: JSON.stringify({
            page_number: edit.pageNumber,
            text: edit.text,
            edited_at: new Date().toISOString(),
            applied_to_git: false,
          }),
        });
        if (!res.ok) {
          const data = await res.text().catch(() => "");
          alert(`Save failed (page ${edit.pageNumber}): ${describeFailure(res.status, data)}`);
        }
      } catch (err) {
        alert(`Save failed — could not reach Supabase.\n${String(err)}`);
      }
    }
  }, [allPages, setAllPages]);

  // ── Undo for AI fixes ──────────────────────────────────────────────────
  // After an AI fix applies (Quick AI fix / AI fix text & format), keep the
  // (old, new, page) so the user can revert. Single-level, auto-dismiss ~12s.
  // The toast renders in BOTH branches below since Quick AI fix closes the bar.
  const [undoFix, setUndoFix] = useState<{ oldText: string; newText: string; pageNum: number } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordUndo = useCallback((oldText: string, newText: string, pageNum: number | null) => {
    if (!pageNum || !oldText || !newText || oldText === newText) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoFix({ oldText, newText, pageNum });
    undoTimerRef.current = setTimeout(() => setUndoFix(null), 12000);
  }, []);
  const runUndo = useCallback(() => {
    if (!undoFix) return;
    pageNumRef.current = undoFix.pageNum;              // revert on the same page
    // Reverse the edit: locate the AI's suggested_text (newText) in the current
    // source and swap it back to the original (oldText). applyEdit's own
    // computeEdit pipeline now includes the shared robust locator (STRATEGY 2.5,
    // whitespace-flexible + bold-insensitive) so this reliably finds newText
    // even if it now sits next to "**" markers or the page was reformatted.
    // applyEdit persists the reverted text to {book}_page_edits itself, so the
    // undo is not just visual — it survives reload.
    void applyEdit(undoFix.newText, undoFix.oldText);  // swap the replacement back
    setUndoFix(null);
    if (undoTimerRef.current) { clearTimeout(undoTimerRef.current); undoTimerRef.current = null; }
  }, [undoFix, applyEdit]);
  useEffect(() => () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); }, []);

  const listenToWord = useCallback(async () => {
    if (!selectedText) return;

    if (ttsPlaying || ttsAudioRef.current) {
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        ttsAudioRef.current.currentTime = 0;
        if (ttsAudioRef.current.src) URL.revokeObjectURL(ttsAudioRef.current.src);
        ttsAudioRef.current = null;
      }
      window.speechSynthesis.cancel();
      setTtsPlaying(false);
      setTtsLoading(false);
      return;
    }

    setTtsLoading(true);
    try {
      const audio = await sarvamStreamPlay(selectedText);
      ttsAudioRef.current = audio;
      setTtsPlaying(true);
      setTtsLoading(false);

      audio.onended = () => {
        setTtsPlaying(false);
        if (audio.src) URL.revokeObjectURL(audio.src);
        ttsAudioRef.current = null;
      };
      audio.onerror = () => {
        console.error("[TTS] audio element error event", audio.error);
        setTtsPlaying(false);
        if (audio.src) URL.revokeObjectURL(audio.src);
        ttsAudioRef.current = null;
      };
    } catch (err) {
      console.error("[TTS] Sarvam playback failed:", err);
      setTtsLoading(false);
      const errMsg = err instanceof Error ? err.message : String(err);
      if (/40\d/.test(errMsg)) {
        alert(`Listen failed: ${errMsg}. The Sarvam API may need a new key.`);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(selectedText);
      utterance.lang = "hi-IN";
      utterance.rate = 0.7;
      utterance.pitch = 0.8;
      const voices = window.speechSynthesis.getVoices();
      const pick = voices.find(v => v.lang === "sa-IN")
        || voices.find(v => v.lang.startsWith("hi") && !/female|lekha|priya|swati|woman/i.test(v.name))
        || voices.find(v => v.lang.startsWith("hi"));
      if (pick) utterance.voice = pick;
      utterance.onend = () => setTtsPlaying(false);
      window.speechSynthesis.speak(utterance);
      setTtsPlaying(true);
    }
  }, [selectedText, ttsPlaying]);

  const requestSuggestion = useCallback(async () => {
    if (!selectedText || suggestLoading) return;
    const pageNum = pageNumRef.current;
    setSuggestLoading(true);
    startAiGlow();
    setSuggestion(null);
    let contextBefore = "";
    let contextAfter = "";
    if (pageNum) {
      const page = allPages.find(p => p.pageNumber === pageNum);
      if (page?.text) {
        // BUG 2 fix: robust locator — falls back through trimmed / whitespace-
        // flexible / bold-insensitive matching instead of a brittle indexOf.
        const loc = locateSelectionInSource(page.text, selectedText);
        if (loc) {
          contextBefore = page.text.substring(Math.max(0, loc.index - 600), loc.index);
          contextAfter = page.text.substring(loc.index + loc.matchLength, loc.index + loc.matchLength + 600);
        }
      }
    }
    try {
      // AI fix endpoint is book-agnostic per the API design. We pass `book`
      // so the backend can route or log per-book if it ever needs to.
      const res = await fetch(`${SUPABASE_URL}/functions/v1/bhagavatam-correct-text`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          book: book.key,
          selected_text: selectedText,
          context_before: contextBefore,
          context_after: contextAfter,
          page_number: pageNum,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`AI suggest failed: ${describeFailure(res.status, err)}`);
        return;
      }
      const data = await res.json();
      setSuggestion(data);
    } catch (err) {
      alert(`AI suggest failed: ${String(err)}`);
    } finally {
      setSuggestLoading(false);
      stopAiGlow();
    }
  }, [selectedText, allPages, suggestLoading]);

  const requestQuickFix = useCallback(async () => {
    if (!selectedText || quickFixLoading || suggestLoading) return;
    const pageNum = pageNumRef.current;
    setQuickFixLoading(true);
    startAiGlow();
    let contextBefore = "";
    let contextAfter = "";
    if (pageNum) {
      const page = allPages.find(p => p.pageNumber === pageNum);
      if (page?.text) {
        // BUG 2 fix: robust locator instead of brittle indexOf.
        const loc = locateSelectionInSource(page.text, selectedText);
        if (loc) {
          contextBefore = page.text.substring(Math.max(0, loc.index - 600), loc.index);
          contextAfter = page.text.substring(loc.index + loc.matchLength, loc.index + loc.matchLength + 600);
        }
      }
    }
    const oldText = selectedText;
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/bhagavatam-correct-text`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          book: book.key,
          selected_text: oldText,
          context_before: contextBefore,
          context_after: contextAfter,
          page_number: pageNum,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.warn("Quick AI fix failed:", describeFailure(res.status, err));
        return;
      }
      const data = await res.json();
      const newText = tidyAiText((data?.suggested_text || "").trim(), selectionInShlok);
      setShow(false);
      if (newText && newText !== oldText) {
        await applyEdit(oldText, newText);
        recordUndo(oldText, newText, pageNum);
        flashApplied(newText, pageNum);
      }
    } catch (err) {
      console.warn("Quick AI fix error:", err);
    } finally {
      setQuickFixLoading(false);
      stopAiGlow();
    }
  }, [selectedText, allPages, quickFixLoading, suggestLoading, applyEdit, recordUndo]);

  const isCurrentSelectionBold = useMemo(() => {
    if (!selectedText) return false;
    if (selectedText.startsWith("**") && selectedText.endsWith("**") && selectedText.length >= 4) return true;
    if (selectedText.includes("**")) return true;
    const pageNum = pageNumRef.current;
    const page = pageNum ? allPages.find(p => p.pageNumber === pageNum) : null;
    if (page) {
      if (page.text.includes(`**${selectedText}**`)) return true;
      // BUG 2 fix: robust locator instead of brittle indexOf.
      const loc = locateSelectionInSource(page.text, selectedText);
      if (loc) {
        const before = page.text.substring(0, loc.index);
        const starsBefore = (before.match(/\*\*/g) || []).length;
        if (starsBefore % 2 === 1) return true;
      }
    }
    return selectionIsBoldDom;
  }, [selectedText, allPages, selectionIsBoldDom]);

  const toggleBold = useCallback(() => {
    pulseAiGlow();
    if (!selectedText) return;
    const pageNum = pageNumRef.current;
    const page = pageNum ? allPages.find(p => p.pageNumber === pageNum) : null;

    if (selectedText.startsWith("**") && selectedText.endsWith("**") && selectedText.length >= 4) {
      void applyEdit(selectedText, selectedText.slice(2, -2));
      setShow(false);
      return;
    }

    if (selectedText.includes("**")) {
      void applyEdit(selectedText, selectedText.replace(/\*\*/g, ""));
      setShow(false);
      return;
    }

    if (page) {
      if (page.text.includes(`**${selectedText}**`)) {
        void applyEdit(`**${selectedText}**`, selectedText);
        setShow(false);
        return;
      }

      // BUG 2 fix: robust locator instead of brittle indexOf.
      const locD = locateSelectionInSource(page.text, selectedText);
      if (locD) {
        const selStart = locD.index;
        const selEnd = locD.index + locD.matchLength;
        const re = /\*\*([^*]+?)\*\*/g;
        const overlapping: Array<{ start: number; end: number }> = [];
        let m: RegExpExecArray | null;
        while ((m = re.exec(page.text)) !== null) {
          const spanStart = m.index;
          const spanEnd = m.index + m[0].length;
          if (spanStart < selEnd && spanEnd > selStart) {
            overlapping.push({ start: spanStart, end: spanEnd });
          }
        }
        if (overlapping.length > 0) {
          const chunkStart = Math.min(selStart, ...overlapping.map(s => s.start));
          const chunkEnd = Math.max(selEnd, ...overlapping.map(s => s.end));
          const oldChunk = page.text.substring(chunkStart, chunkEnd);
          const newChunk = oldChunk.replace(/\*\*/g, "");
          if (oldChunk !== newChunk) {
            void applyEdit(oldChunk, newChunk);
            setShow(false);
            return;
          }
        }
      }
    }

    // Structural verse bold. Shlok verses render bold via CSS (font-bold), not
    // `**`, so there are no markers to strip. Toggle a per-line "un-bold"
    // override, gated on the selection actually being INSIDE a shlok (so
    // tatparya/shabdarth never trigger it). Keys are the rendered <p> line texts
    // captured at selection time (match the renderer exactly). Direction follows
    // the button's own signal — selectionIsBoldDom true ("Remove bold") un-bolds
    // every selected verse line; false ("Make bold") restores them — so a mixed
    // selection can never invert into re-bolding what the user asked to lighten.
    if (selectionInShlok) {
      const keys = selectionShlokKeysRef.current;
      if (keys.length) {
        const next = new Set(unboldLines);
        if (selectionIsBoldDom) keys.forEach(k => next.add(k));
        else keys.forEach(k => next.delete(k));
        onUnboldChange(next);
      }
      setShow(false);
      return;
    }

    // Structurally bold but NOT a verse (e.g. a shabdarth <strong> meaning) with
    // no `**` to strip: nothing this tool can remove — dismiss without re-bolding.
    if (selectionIsBoldDom) {
      setShow(false);
      return;
    }

    void applyEdit(selectedText, `**${selectedText}**`);
    setShow(false);
  }, [selectedText, allPages, selectionIsBoldDom, selectionInShlok, applyEdit, unboldLines, onUnboldChange]);

  // Clear formatting — deterministically STRIP bold (**...**) from the selection.
  // Unlike "Make bold" (a toggle that may re-bold), this only ever removes, so a
  // mixed selection (part bold word-meanings, part plain) normalises to clean,
  // uniform plain text in one click.
  const clearFormatting = useCallback(() => {
    pulseAiGlow();
    if (!selectedText) { setShow(false); return; }
    const pageNum = pageNumRef.current;
    const page = pageNum ? allPages.find(p => p.pageNumber === pageNum) : null;
    // Selection literally contains the markers → strip them.
    if (selectedText.includes("**")) {
      void applyEdit(selectedText, selectedText.replace(/\*\*/g, ""));
      setShow(false); return;
    }
    if (page) {
      // Exact **selection** pair in source → unwrap.
      if (page.text.includes(`**${selectedText}**`)) {
        void applyEdit(`**${selectedText}**`, selectedText);
        setShow(false); return;
      }
      // Any **...** spans overlapping the selection → strip the whole chunk.
      // BUG 2 fix: robust locator instead of brittle indexOf.
      const locClear = locateSelectionInSource(page.text, selectedText);
      if (locClear) {
        const selStart = locClear.index;
        const selEnd = locClear.index + locClear.matchLength;
        const re = /\*\*([^*]+?)\*\*/g;
        const overlapping: Array<{ start: number; end: number }> = [];
        let m: RegExpExecArray | null;
        while ((m = re.exec(page.text)) !== null) {
          if (m.index < selEnd && m.index + m[0].length > selStart) {
            overlapping.push({ start: m.index, end: m.index + m[0].length });
          }
        }
        if (overlapping.length > 0) {
          const chunkStart = Math.min(selStart, ...overlapping.map(s => s.start));
          const chunkEnd = Math.max(selEnd, ...overlapping.map(s => s.end));
          const oldChunk = page.text.substring(chunkStart, chunkEnd);
          const newChunk = oldChunk.replace(/\*\*/g, "");
          if (oldChunk !== newChunk) { void applyEdit(oldChunk, newChunk); setShow(false); return; }
        }
      }
    }
    // No `**` to strip — if the selection is inside a shlok verse (rendered
    // font-bold via CSS), mark its line(s) to render at normal weight. Clear
    // formatting only ever removes, so it always un-bolds (never restores).
    if (selectionInShlok) {
      const keys = selectionShlokKeysRef.current;
      if (keys.length) {
        const next = new Set(unboldLines);
        keys.forEach(k => next.add(k));
        onUnboldChange(next);
      }
    }
    setShow(false); // nothing more to strip
  }, [selectedText, allPages, applyEdit, selectionInShlok, unboldLines, onUnboldChange]);

  // ── Save the selection as an "interesting scene" ────────────────────────────
  // Stores the highlighted passage in `reader_scenes` for later image generation;
  // the Gallery's Story Scenes section lists them with their generation status.
  const [sceneSaving, setSceneSaving] = useState(false);
  const [sceneSaved, setSceneSaved] = useState(false);
  const saveScene = useCallback(async () => {
    if (!selectedText || sceneSaving) return;
    setSceneSaving(true);
    try {
      const res = await sbFetch("reader_scenes", {
        method: "POST",
        body: JSON.stringify({
          book: book.key,
          page_number: pageNumRef.current,
          selected_text: selectedText,
          device_id: localStorage.getItem(`${book.key}_device_id`) || null,
          reader_id: localStorage.getItem(`${book.key}_reader_id`) || null,
        }),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        alert(`Couldn't save the scene.\n${describeFailure(res.status, msg)}`);
        return;
      }
      setSceneSaved(true);
      setTimeout(() => { setSceneSaved(false); setShow(false); }, 1000);
    } catch (err) {
      alert(`Couldn't save the scene.\n${String(err)}`);
    } finally {
      setSceneSaving(false);
    }
  }, [selectedText, sceneSaving]);

  const insertLineBreak = useCallback(() => {
    pulseAiGlow();
    if (!selectedText) return;
    const trimmed = selectedText.replace(/^\s+/, "");
    applyEdit(selectedText, "\n\n" + trimmed);
    setShow(false);
  }, [selectedText, applyEdit]);

  const removeSpaces = useCallback(() => {
    pulseAiGlow();
    if (!selectedText) return;
    const joined = selectedText.replace(/\s+/g, "");
    if (joined === selectedText) return;
    applyEdit(selectedText, joined);
    setShow(false);
  }, [selectedText, applyEdit]);

  const lookupWord = useCallback(async () => {
    if (!selectedText || selectedText.length > 50) return;
    setDictLoading(true);
    setDictResult(null);
    try {
      // Dev-mode dictionary endpoint — the bhagwatham server already exposes
      // a Claude-backed `/dictionary` endpoint that's just for word lookup,
      // not book-specific content. We call the same endpoint from chaitanya.
      const res = await fetch(`/api/bhagwatham/dictionary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: selectedText }),
      });
      if (res.ok) {
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          const data = await res.json();
          if (data.meaning) { setDictResult(data); setDictLoading(false); return; }
        }
      }
    } catch { /* */ }
    window.open(`https://www.shabdkosh.com/dictionary/hindi-english/${encodeURIComponent(selectedText)}`, "_blank", "noopener");
    setDictLoading(false);
  }, [selectedText]);

  // The anchored toolbar renders ABOVE the selection (-translate-y-full),
  // and only its BOTTOM edge was clamped — when a taller sub-panel (edit
  // input, dictionary result) expands, the TOP edge slides behind the
  // sticky site nav + reader toolbar (~150px stack). Measure after every
  // render and flip the box below the selection if its top invades that
  // safe area. Reset on each new selection (in the selectionchange handler).
  const SAFE_TOP_PX = 160;
  useLayoutEffect(() => {
    if (!show || forceFlipBelow) return;
    if (suggestion || manualFixMode) return; // centered modal positions itself
    const el = toolbarRef.current;
    if (!el) return;
    if (el.getBoundingClientRect().top < SAFE_TOP_PX) setForceFlipBelow(true);
  });

  // AI-activity glow over the selected text — rendered whether or not the
  // toolbar is open, so closing the popup mid-fix keeps the highlight alive
  // until the request's finally block calls stopAiGlow(). Fixed boxes per
  // rendered line, under the toolbar (z-40 vs z-50), never intercept clicks.
  const aiGlow = aiGlowRects.length > 0 ? (
    <>
      <style>{`
        @keyframes aiGlowPulse {
          0%, 100% { box-shadow: 0 0 0 2px rgba(245,158,11,.50), 0 0 12px 3px rgba(249,115,22,.30); }
          50% { box-shadow: 0 0 0 3px rgba(249,115,22,.85), 0 0 24px 8px rgba(245,158,11,.50); }
        }
        @keyframes aiGlowSweep {
          0% { background-position: -150% 0; }
          100% { background-position: 250% 0; }
        }
      `}</style>
      {appliedRects.map((r, i) => (
        <div
          key={`applied-${i}`}
          className="fixed z-40 pointer-events-none rounded"
          style={{
            left: r.left, top: r.top, width: r.width, height: r.height,
            background: "rgba(59,130,246,.28)",
            boxShadow: "0 0 0 1px rgba(59,130,246,.45)",
            transition: "opacity .3s",
          }}
        />
      ))}
      {aiGlowRects.map((r, i) => (
        <div
          key={i}
          className="fixed z-40 pointer-events-none rounded-md"
          style={{
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height,
            background: "linear-gradient(110deg, transparent 35%, rgba(251,191,36,.22) 50%, transparent 65%) 0 0 / 220% 100%",
            animationName: "aiGlowPulse, aiGlowSweep",
            animationDuration: "1.1s, 1.4s",
            animationTimingFunction: "ease-in-out, linear",
            animationIterationCount: "infinite, infinite",
          }}
        />
      ))}
    </>
  ) : null;

  // Undo toast for AI fixes — renders whether or not the toolbar is open, and
  // lets the user revert the last Quick AI fix / AI fix text & format.
  const undoToastEl = undoFix ? (
    <div className="fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-xl bg-stone-900 px-4 py-2.5 text-sm text-white shadow-2xl">
      <span className="flex items-center gap-1.5"><Wand2 className="w-3.5 h-3.5 text-amber-300" /> AI fix applied</span>
      <button onClick={runUndo} className="flex items-center gap-1 font-semibold text-amber-300 hover:text-amber-200">
        <Undo2 className="w-3.5 h-3.5" /> Undo
      </button>
      <button
        onClick={() => { setUndoFix(null); if (undoTimerRef.current) clearTimeout(undoTimerRef.current); }}
        className="ml-1 text-stone-400 hover:text-white"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  ) : null;

  // Toolbar hidden — keep the AI glow AND the undo toast on screen (Quick AI
  // fix closes the toolbar, but the user may still want to revert).
  if (!show) return (<>{aiGlow}{undoToastEl}</>);

  const isCentered = !!suggestion || manualFixMode;
  const flipBelow = !isCentered && (position.y < 120 || forceFlipBelow);

  // Grab the handle to move the toolbar anywhere (pointer capture => works for
  // mouse + touch, keeps tracking outside the element).
  const onDragDown = (e: React.PointerEvent) => {
    const el = toolbarRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    dragOffsetRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    draggingRef.current = true;
    setDragPos({ x: r.left, y: r.top });
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
    e.preventDefault();
    e.stopPropagation();
  };
  const onDragMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const nx = Math.max(4, Math.min(e.clientX - dragOffsetRef.current.dx, window.innerWidth - 60));
    const ny = Math.max(4, Math.min(e.clientY - dragOffsetRef.current.dy, window.innerHeight - 44));
    setDragPos({ x: nx, y: ny });
  };
  const onDragUp = (e: React.PointerEvent) => {
    draggingRef.current = false;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  return (
    <>
      {isCentered && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]"
          onClick={() => { setSuggestion(null); setManualFixMode(false); }}
        />
      )}
      {/* AI-activity glow (defined above so it can also render while the
          toolbar is closed). Sits under the toolbar (z-40 vs z-50). */}
      {aiGlow}
      {undoToastEl}
      <div
        ref={toolbarRef}
        className={`fixed z-50 bg-white rounded-2xl shadow-2xl border border-stone-200 max-h-[85vh] overflow-y-auto ${
          isCentered
            ? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            : dragPos ? "" : "left-3 top-1/2 -translate-y-1/2"
        }`}
        style={
          isCentered
            ? { width: manualFixMode ? "min(560px, 95vw)" : "min(480px, 92vw)" }
            : dragPos
              ? { left: dragPos.x, top: dragPos.y, width: 250, maxWidth: "min(280px, 82vw)" }
              : {
                  // Default: docked vertically on the LEFT (over the menu area) so
                  // it doesn't cover the content. Drag the handle to move it.
                  width: 250,
                  maxWidth: "min(280px, 82vw)",
                }
        }
      >
        <div className="p-2">
          {/* Drag handle — hold and move the toolbar anywhere on screen. */}
          <div
            onPointerDown={onDragDown}
            onPointerMove={onDragMove}
            onPointerUp={onDragUp}
            onPointerCancel={onDragUp}
            onLostPointerCapture={onDragUp}
            className="flex items-center justify-center h-4 mb-1 cursor-move touch-none select-none"
            title="Drag to move"
          >
            <GripHorizontal className="w-4 h-4 text-stone-300" />
          </div>
          <div className="flex flex-col items-stretch gap-1 mb-2" onMouseDown={e => e.preventDefault()}>
            <button
              onClick={listenToWord}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg transition-colors ${
                ttsLoading
                  ? "text-stone-400 cursor-wait"
                  : ttsPlaying
                    ? "text-red-600 bg-red-50 hover:bg-red-100"
                    : "text-stone-600 hover:text-orange-600 hover:bg-orange-50"
              }`}
              title={ttsLoading ? "Loading..." : ttsPlaying ? "Stop" : "Listen"}
            >
              {ttsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : ttsPlaying ? <Square className="w-3 h-3" /> : <Volume2 className="w-3.5 h-3.5" />}
              {ttsLoading ? "Loading..." : ttsPlaying ? "Stop" : "Listen"}
            </button>
            <button onClick={lookupWord} disabled={dictLoading} className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-stone-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Look up the dictionary meaning of this word">
              {dictLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookOpen className="w-3.5 h-3.5" />} Look up meaning
            </button>
            <button
              onClick={toggleBold}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg transition-colors ${
                isCurrentSelectionBold
                  ? "text-stone-900 bg-stone-200 hover:bg-stone-300"
                  : "text-stone-600 hover:text-stone-900 hover:bg-stone-100"
              }`}
              title={isCurrentSelectionBold ? "Remove bold formatting from this text" : "Make this text bold"}
            >
              <Bold className="w-3.5 h-3.5" /> {isCurrentSelectionBold ? "Remove bold" : "Make bold"}
            </button>
            <button
              onClick={clearFormatting}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
              title="Strip bold / markup so this selection reads as plain, uniform text"
            >
              <Eraser className="w-3.5 h-3.5" /> Clear formatting
            </button>
            <button
              onClick={insertLineBreak}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
              title="Push this selection onto a new paragraph"
            >
              <CornerDownLeft className="w-3.5 h-3.5" /> Start new paragraph
            </button>
            <button
              onClick={removeSpaces}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
              title="Remove spaces between these words"
            >
              <Combine className="w-3.5 h-3.5" /> Join words
            </button>
            <button
              onClick={requestQuickFix}
              disabled={suggestLoading || quickFixLoading}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-stone-600 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
              title="Fix this text with AI — typos, missing words, line/paragraph breaks, bold, section formatting. Applies instantly (undo available)."
            >
              {quickFixLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              AI fix text &amp; format
            </button>
            <button
              onClick={() => { setManualFixText(selectedText); setManualFixMode(true); }}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-stone-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
              title="Edit yourself with an on-screen Devanagari keyboard"
            >
              <Keyboard className="w-3.5 h-3.5" /> Manual fix
            </button>
            <button
              onClick={saveScene}
              disabled={sceneSaving}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-stone-600 hover:text-pink-600 hover:bg-pink-50 rounded-lg transition-colors disabled:opacity-50"
              title="Save this passage as an interesting scene, to generate an image from later"
            >
              {sceneSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : sceneSaved ? <Check className="w-3.5 h-3.5 text-green-600" /> : <ImageIcon className="w-3.5 h-3.5" />}
              {sceneSaved ? "Saved to scenes" : "Add to scenes"}
            </button>
            {appliedFlash && (
              <span className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-green-700 bg-green-50 rounded">
                <Check className="w-3 h-3" /> Applied
              </span>
            )}
            <button onClick={() => { setShow(false); setDictResult(null); setSuggestion(null); }} className="p-1.5 text-stone-400 hover:text-stone-600 ml-auto">
              <X className="w-3 h-3" />
            </button>
          </div>
          {suggestion && (
            <div className="mb-2 p-3 rounded-lg bg-purple-50 border-2 border-purple-300">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                <span className="text-[11px] font-bold uppercase tracking-wide text-purple-700">AI Suggestion</span>
                <span className={`text-[9px] uppercase font-medium px-1.5 py-0.5 rounded ${
                  suggestion.confidence === "high" ? "bg-green-100 text-green-700" :
                  suggestion.confidence === "low" ? "bg-amber-100 text-amber-700" :
                  "bg-stone-100 text-stone-600"
                }`}>{suggestion.confidence}</span>
              </div>

              <div className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold mb-0.5">Original</div>
              <div className="text-sm text-stone-700 mb-2.5 px-2.5 py-1.5 bg-white border border-red-200 rounded line-through decoration-red-400 break-words whitespace-pre-wrap" lang="hi">
                {selectedText}
              </div>

              <div className="text-[10px] uppercase tracking-wide text-purple-700 font-semibold mb-0.5">Suggested</div>
              <div className="text-base text-stone-900 font-medium mb-2.5 px-2.5 py-1.5 bg-white border border-green-300 rounded break-words whitespace-pre-wrap" lang="hi">
                {suggestion.suggested_text
                  ? (() => {
                      // Bold state must carry across lines here too — the preview is a
                      // multi-line block, not independent lines (BUG FIX, same as sec.lines).
                      const previewLines = suggestion.suggested_text.split("\n");
                      const renderedPreview = renderInlineBoldBlock(previewLines);
                      return previewLines.map((ln, i, arr) => (
                        <span key={i}>
                          {renderedPreview[i]}
                          {i < arr.length - 1 && "\n"}
                        </span>
                      ));
                    })()
                  : <em className="text-stone-400 text-sm">(no suggestion)</em>}
              </div>

              {suggestion.changes.length > 0 && (
                <div className="mb-2.5">
                  <div className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold mb-0.5">Changes</div>
                  <div className="text-[11px] text-stone-700 space-y-1">
                    {suggestion.changes.map((c, ci) => (
                      <div key={ci} className="flex flex-wrap items-center gap-1">
                        <span className="line-through text-red-500" lang="hi">{c.from}</span>
                        <span className="text-stone-400">→</span>
                        <span className="text-green-700 font-medium" lang="hi">{c.to}</span>
                        {c.reason && <span className="text-stone-500 italic">({c.reason})</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {suggestion.explanation && (
                <p className="text-[10px] text-stone-500 italic mb-2.5">{suggestion.explanation}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (!suggestion.suggested_text || suggestion.suggested_text === selectedText) {
                      setSuggestion(null);
                      return;
                    }
                    const oldText = selectedText;
                    const newText = suggestion.suggested_text;
                    const pn = pageNumRef.current;
                    setSuggestion(null);
                    void applyEdit(oldText, newText);
                    recordUndo(oldText, newText, pn);
                  }}
                  className="flex-1 px-3 py-1.5 text-xs font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  Accept &amp; save
                </button>
                <button
                  onClick={() => setSuggestion(null)}
                  className="px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 rounded-lg"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
          {manualFixMode && (
            <ManualFixKeyboard
              value={manualFixText}
              onChange={setManualFixText}
              onSave={(text) => {
                if (text && text !== selectedText) {
                  void applyEdit(selectedText, text);
                }
                setManualFixMode(false);
                setShow(false);
              }}
              onCancel={() => setManualFixMode(false)}
            />
          )}
          {!manualFixMode && (
            <input
              type="text"
              defaultValue={selectedText}
              className="w-full text-xs border border-stone-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-orange-400"
              placeholder="Type correction, press Enter (or use Manual fix for on-screen keyboard)"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  applyEdit(selectedText, (e.target as HTMLInputElement).value);
                  setShow(false);
                }
              }}
            />
          )}
        </div>
        {dictResult && (
          <div className="border-t border-stone-100 px-4 py-3 max-w-xs">
            <p className="text-xs font-bold text-blue-700 mb-1">{dictResult.word}</p>
            <p className="text-xs text-stone-600 leading-relaxed">{dictResult.meaning}</p>
            {dictResult.examples?.length > 0 && (
              <div className="mt-2 space-y-1">
                {dictResult.examples.slice(0, 3).map((ex, i) => (
                  <p key={i} className="text-[10px] text-stone-400 italic">"{ex}"</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
