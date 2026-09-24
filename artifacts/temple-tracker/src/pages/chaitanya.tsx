import React, { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Layout } from "@/components/layout/Layout";
import { ReaderAccountCard } from "@/components/ReaderAccountCard";
import { SEOHead } from "@/components/SEOHead";
import { type AiFixArgs } from "@/components/SourceEditor";
// Lazy — CodeMirror only loads when a maintainer opens the editor.
const SourceEditor = React.lazy(() => import("@/components/SourceEditor"));
import { fadeInUp } from "@/lib/animations";
import { BOOKMARK_UPSERT_PREFER, bookmarkUpsertPath, findTopmostVisible } from "@/lib/bookmarks";
import { escapeRegExp, locateSelectionInSource, normalizeBoldKey, normalizeDashKey, tidyAiText } from "@/lib/readerText";
import { VoiceEditToolbar } from "@/components/reader/VoiceEditToolbar";
import { describeFailure } from "@/lib/requestError";
import { applyTextCorrections } from "@/lib/bhagwatham-config";
import { numberedVerseHeadLength, openVerseTailLength } from "@/lib/bhagwatham-utils";
import {
  BookOpen, ChevronLeft, ChevronRight, Loader2,
  Search, BookMarked, Sparkles,
  List, X, ChevronDown, ChevronUp, Languages,
  Bookmark, Trash2, LogIn, Volume2, Square, Check,
  Settings, Minus, Plus, Maximize2, Pencil, Wand2, Undo2, Bold, Eraser, GripHorizontal,
  CornerDownLeft, Combine, Keyboard, Delete, RefreshCw, Image as ImageIcon,
} from "lucide-react";

// ── Book key (used everywhere a bhagwatham/bhagavatam discriminator lived) ──
const BOOK_KEY = "chaitanya";

// ── Reading Settings ─────────────────────────────────────────────────────────

type Theme = "light" | "dark" | "sepia";

interface ReadingSettings {
  fontSize: number;
  lineHeight: number;
  maxWidth: number;
  theme: Theme;
  showPageNumbers: boolean; // the · N · dividers between pages
}

const DEFAULT_SETTINGS: ReadingSettings = { fontSize: 15, lineHeight: 1.8, maxWidth: 768, theme: "light", showPageNumbers: true };

function loadSettings(): ReadingSettings {
  try {
    const raw = localStorage.getItem(`${BOOK_KEY}_settings`);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch { return DEFAULT_SETTINGS; }
}

function saveSettings(s: ReadingSettings) {
  try {
    localStorage.setItem(`${BOOK_KEY}_settings`, JSON.stringify(s));
  } catch { /* quota exceeded / private mode — settings just won't persist */ }
}

const THEME_STYLES: Record<Theme, { bg: string; text: string; surface: string; border: string; muted: string; accent: string }> = {
  light: { bg: "bg-white", text: "text-stone-800", surface: "bg-white/95", border: "border-stone-100", muted: "text-stone-500", accent: "text-orange-600" },
  dark: { bg: "bg-[#1a1a1a]", text: "text-stone-200", surface: "bg-[#1a1a1a]/95", border: "border-stone-700", muted: "text-stone-400", accent: "text-orange-400" },
  sepia: { bg: "bg-[#f4ecd8]", text: "text-[#5b4636]", surface: "bg-[#f4ecd8]/95", border: "border-[#d4c5a9]", muted: "text-[#8b7355]", accent: "text-orange-700" },
};

// ── Reading Settings Panel ──────────────────────────────────────────────────

function ReadingSettingsPanel({ settings, onChange, onClose }: {
  settings: ReadingSettings;
  onChange: (s: ReadingSettings) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (panelRef.current && panelRef.current.contains(target)) return;
      if (target.closest("[data-settings-toggle]")) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const update = (partial: Partial<ReadingSettings>) => {
    const next = { ...settings, ...partial };
    onChange(next);
    saveSettings(next);
  };

  return (
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-stone-800 rounded-xl shadow-xl border border-stone-200 dark:border-stone-700 p-4 z-50"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-stone-600 dark:text-stone-300">Reading Settings</span>
        <button onClick={onClose} className="p-1 hover:bg-stone-100 dark:hover:bg-stone-700 rounded">
          <X className="w-3.5 h-3.5 text-stone-400" />
        </button>
      </div>

      <div className="mb-3">
        <label className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5 block">Font Size</label>
        <div className="flex items-center gap-2">
          <button onClick={() => update({ fontSize: Math.max(12, settings.fontSize - 1) })}
            className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 transition-colors">
            <Minus className="w-3.5 h-3.5 text-stone-500" />
          </button>
          <div className="flex-1 text-center text-sm font-bold text-stone-700">{settings.fontSize}px</div>
          <button onClick={() => update({ fontSize: Math.min(28, settings.fontSize + 1) })}
            className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 transition-colors">
            <Plus className="w-3.5 h-3.5 text-stone-500" />
          </button>
        </div>
      </div>

      <div className="mb-3">
        <label className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5 block">Line Height</label>
        <input type="range" min="1.4" max="2.6" step="0.1" value={settings.lineHeight}
          onChange={(e) => update({ lineHeight: parseFloat(e.target.value) })}
          className="w-full h-1.5 bg-stone-200 rounded-full appearance-none cursor-pointer accent-orange-500"
        />
        <div className="flex justify-between text-[9px] text-stone-400 mt-0.5">
          <span>Compact</span><span>{settings.lineHeight.toFixed(1)}</span><span>Spacious</span>
        </div>
      </div>

      <div className="mb-3">
        <label className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5 block">Page Width</label>
        <div className="flex gap-1.5">
          {[640, 768, 896].map((w) => (
            <button key={w} onClick={() => update({ maxWidth: w })}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold border transition-all ${
                settings.maxWidth === w ? "bg-orange-100 border-orange-300 text-orange-700" : "border-stone-200 text-stone-500 hover:bg-stone-50"
              }`}
            >
              {w === 640 ? "Narrow" : w === 768 ? "Medium" : "Wide"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5 block">Theme</label>
        <div className="flex gap-1.5">
          {([["light", "Light", "bg-white border-stone-300 text-stone-800"], ["sepia", "Sepia", "bg-[#f4ecd8] border-[#d4c5a9] text-[#5b4636]"], ["dark", "Dark", "bg-[#1a1a1a] border-stone-600 text-stone-200"]] as const).map(([t, label, cls]) => (
            <button key={t} onClick={() => update({ theme: t })}
              className={`flex-1 py-2 rounded-lg text-[10px] font-semibold border transition-all ${cls} ${settings.theme === t ? "ring-2 ring-orange-400 ring-offset-1" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Page numbers — the · N · dividers between OCR pages. Off = continuous reading. */}
      <div className="mt-3">
        <label className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5 block">Page Numbers</label>
        <button
          onClick={() => update({ showPageNumbers: !settings.showPageNumbers })}
          className={`w-full flex items-center justify-between py-2 px-3 rounded-lg text-[11px] font-semibold border transition-all ${
            settings.showPageNumbers ? "bg-orange-100 border-orange-300 text-orange-700" : "border-stone-200 text-stone-500 hover:bg-stone-50"
          }`}
        >
          <span>{settings.showPageNumbers ? "Shown between pages" : "Hidden — continuous"}</span>
          <span className={`relative inline-block w-8 h-4 rounded-full transition-colors ${settings.showPageNumbers ? "bg-orange-400" : "bg-stone-300"}`}>
            <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${settings.showPageNumbers ? "left-4" : "left-0.5"}`} />
          </span>
        </button>
      </div>
    </motion.div>
  );
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface PageContent { pageNumber: number; text: string; textEn?: string }
interface BatchData {
  chapterGlobalNumber: number;
  chapterPart: string;
  chapterInPart: number;
  chapterTitle: string;
  pageCount: number;
  processedAt: string;
  pages: PageContent[];
}

interface BookmarkEntry {
  id: string;
  reader_id: string;
  reader_name?: string;
  page_number: number;
  chapter_number?: number;
  chapter_title?: string;
  label?: string;
  line_anchor?: string | null;
  created_at: string;
}

/** Find the topmost <p> element visible inside a given page container. */
function findTopmostVisibleParagraph(pageEl: HTMLElement): HTMLParagraphElement | null {
  return findTopmostVisible([...pageEl.querySelectorAll("p")]) as HTMLParagraphElement | null;
}

/** Manual section override — user marks line ranges with a specific type */
type SectionKind = "shlok" | "shabdarth" | "anuvad" | "tatparya" | "text";
interface SectionOverride {
  startLine: number;
  endLine: number;
  kind: SectionKind;
}

type PageOverrides = Record<number, SectionOverride[]>;

function loadSectionOverrides(): PageOverrides {
  try {
    const raw = localStorage.getItem(`${BOOK_KEY}_section_overrides`);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveSectionOverrides(o: PageOverrides) {
  try {
    localStorage.setItem(`${BOOK_KEY}_section_overrides`, JSON.stringify(o));
  } catch { /* quota exceeded / private mode — overrides just won't persist */ }
}




function loadUnboldLines(): Set<string> {
  try {
    const raw = localStorage.getItem(`${BOOK_KEY}_unbold_lines`);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}

function saveUnboldLines(s: Set<string>) {
  try {
    localStorage.setItem(`${BOOK_KEY}_unbold_lines`, JSON.stringify([...s]));
  } catch { /* quota exceeded / private mode — override just won't persist */ }
}



// Approved reader-scene illustrations are keyed by the opening of the passage the
// reader highlighted, so the artwork can sit directly above that passage.
function sceneMatchText(text: string): string {
  // Letters, marks and digits only: a stored highlight and the page text differ in
  // spacing, line breaks, dashes, dandas and ** markers, so compare without them.
  return text.replace(/\*\*/g, "").normalize("NFC").replace(/[^\p{L}\p{M}\p{N}]+/gu, "");
}
function sceneKeyOf(text: string): string {
  return sceneMatchText(text).slice(0, 80);
}

// Which section each approved illustration sits above: the first section that
// holds the start of its passage, probed from two points in case the very start
// is a label the renderer adds. An illustration that matches nothing (its text was
// edited, or the page re-OCR'd) goes above the page's first section rather than
// silently disappearing.
// Only images our own storage serves are shown: reader_scenes accepts writes from
// the public key, so a row could otherwise point the book at any image.
const SCENE_ART_PREFIX = "https://etfmndcrchundvgtvmot.supabase.co/storage/v1/object/public/";

function placeSceneArt<T extends { key: string }>(sectionTexts: string[], art: T[] | undefined, fallbackIndex = 0, sectionKinds?: string[]): Map<number, T[]> {
  const placed = new Map<number, T[]>();
  if (!art?.length || sectionTexts.length === 0) return placed;
  // Search every section as one string, so a highlight that starts near the end of
  // a section or runs across two is still found, then map the hit to its section.
  const starts: number[] = [];
  let joined = "";
  for (const t of sectionTexts) { starts.push(joined.length); joined += sceneMatchText(t); }
  const sectionAt = (offset: number) => {
    let i = 0;
    while (i + 1 < starts.length && starts[i + 1] <= offset) i++;
    return i;
  };
  // The word-by-word gloss (shabdarth) quotes phrases of the translation, so a
  // short highlight often matches there first; prefer a hit in any other section.
  const sectionOf = (needle: string) => {
    let from = 0;
    let gloss = -1;
    for (;;) {
      const hit = joined.indexOf(needle, from);
      if (hit < 0) return gloss;
      const sec = sectionAt(hit);
      if (sectionKinds?.[sec] !== "shabdarth") return sec;
      if (gloss < 0) gloss = sec;
      from = hit + 1;
    }
  };
  for (const a of art) {
    // The whole stored key first (up to 80 letters), then two shorter probes in
    // case the very start is a label the renderer adds.
    let at = a.key.length >= 4 ? sectionOf(a.key) : -1;
    for (const from of [0, 12]) {
      if (at >= 0) break;
      const probe = a.key.slice(from, from + 24);
      if (probe.length < 4) break;
      at = sectionOf(probe);
    }
    const slot = at >= 0 ? at : Math.min(Math.max(0, fallbackIndex), sectionTexts.length - 1);
    placed.set(slot, [...(placed.get(slot) ?? []), a]);
  }
  return placed;
}

const SECTION_KIND_LABELS: Record<SectionKind, { label: string; color: string; bg: string }> = {
  shlok:     { label: "Shlok",      color: "text-blue-700",   bg: "bg-blue-100 border-blue-300" },
  shabdarth: { label: "Shabdarth",  color: "text-pink-700",   bg: "bg-pink-100 border-pink-300" },
  anuvad:    { label: "Anuvad",     color: "text-stone-900",  bg: "bg-stone-100 border-stone-300" },
  tatparya:  { label: "Tatparya",   color: "text-green-700",  bg: "bg-green-100 border-green-300" },
  text:      { label: "Text",       color: "text-stone-600",  bg: "bg-stone-100 border-stone-300" },
};

/** A chapter from the server chapter-index endpoint. */
interface ChapterEntry {
  globalNumber: number;     // unique across all parts
  part: string;             // lowercase short code from the DB: "adi" | "madhya" | "antya"
                            // ("-lila"-suffixed / mixed-case legacy values tolerated via partKey())
  number: number;           // chapter number within the part
  title: string;
  pageNumber: number;       // first page of the chapter
  batchNumber: number;
  ocrStatus?: string;
}

// Sensible order for the three lilas.
// Order keys MUST match what the API returns. The chaitanya_chapters DB
// stores `part` as lowercase short codes ('adi' / 'madhya' / 'antya'), so
// PART_ORDER uses those same strings. Mixed-case or "-lila"-suffixed values
// are also tolerated via partKey() normalization so legacy or future data
// shapes don't silently fall into the "other" bucket.
const PART_ORDER = ["adi", "madhya", "antya"];
function partKey(part: string): string {
  if (!part) return "";
  const k = part.toLowerCase();
  if (k.startsWith("adi")) return "adi";
  if (k.startsWith("madhya")) return "madhya";
  if (k.startsWith("antya")) return "antya";
  return k;
}
function getPartOrder(part: string): number {
  const idx = PART_ORDER.indexOf(partKey(part));
  return idx >= 0 ? idx : PART_ORDER.length + (part?.charCodeAt(0) ?? 0);
}

// Display labels for each lila (Hindi + English). Keyed by the same
// short codes as PART_ORDER; partKey() normalizes input.
const PART_LABELS: Record<string, { hi: string; en: string }> = {
  adi:    { hi: "आदि-लीला",    en: "Adi-lila" },
  madhya: { hi: "मध्य-लीला",   en: "Madhya-lila" },
  antya:  { hi: "अंत्य-लीला",  en: "Antya-lila" },
};

function partLabelHi(part: string): string {
  return PART_LABELS[partKey(part)]?.hi || part;
}

const API_BASE = `/api/${BOOK_KEY}`;

// ── Sarvam TTS (via Supabase Edge Function proxy — keeps the API key server-side) ──

const TTS_CACHE_PREFIX = "tts_v2_";
const TTS_CACHE_INDEX_KEY = "tts_v2_index";

function ttsTextHash(text: string): string {
  const norm = text.normalize("NFC").trim().replace(/\s+/g, " ").slice(0, 400);
  try { return btoa(unescape(encodeURIComponent(norm))); }
  catch { return norm.length + "_" + norm.charCodeAt(0) + "_" + norm.charCodeAt(norm.length - 1); }
}

function ttsCacheRead(key: string): Blob | null {
  try {
    const b64 = localStorage.getItem(TTS_CACHE_PREFIX + key);
    if (!b64) return null;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    ttsCacheTouch(key);
    return new Blob([bytes], { type: "audio/mpeg" });
  } catch { return null; }
}

function ttsCacheTouch(key: string): void {
  try {
    const idxRaw = localStorage.getItem(TTS_CACHE_INDEX_KEY);
    const idx: Record<string, number> = idxRaw ? JSON.parse(idxRaw) : {};
    idx[key] = Date.now();
    localStorage.setItem(TTS_CACHE_INDEX_KEY, JSON.stringify(idx));
  } catch { /* */ }
}

function ttsCacheWrite(key: string, buffer: ArrayBuffer): void {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const b64 = btoa(binary);
  // Update the index FIRST, then write the blob. If the blob write fails we
  // roll the index entry back. This guarantees a blob never exists without an
  // index entry — orphaned blobs would be invisible to eviction forever.
  // (An index entry without a blob is harmless: reads miss, eviction cleans it.)
  const addToIndex = () => {
    const idxRaw = localStorage.getItem(TTS_CACHE_INDEX_KEY);
    const idx: Record<string, number> = idxRaw ? JSON.parse(idxRaw) : {};
    idx[key] = Date.now();
    localStorage.setItem(TTS_CACHE_INDEX_KEY, JSON.stringify(idx));
  };
  const removeFromIndex = () => {
    try {
      const idxRaw = localStorage.getItem(TTS_CACHE_INDEX_KEY);
      const idx: Record<string, number> = idxRaw ? JSON.parse(idxRaw) : {};
      if (key in idx) {
        delete idx[key];
        localStorage.setItem(TTS_CACHE_INDEX_KEY, JSON.stringify(idx));
      }
    } catch { /* */ }
  };
  const trySet = () => localStorage.setItem(TTS_CACHE_PREFIX + key, b64);
  try {
    addToIndex();
    trySet();
  } catch {
    // Quota exceeded — evict oldest 25% of entries (never our fresh key) and retry
    try {
      const idxRaw = localStorage.getItem(TTS_CACHE_INDEX_KEY);
      const idx: Record<string, number> = idxRaw ? JSON.parse(idxRaw) : {};
      const entries = Object.entries(idx).filter(([k]) => k !== key).sort((a, b) => a[1] - b[1]);
      const drop = Math.max(1, Math.floor(entries.length * 0.25));
      for (let i = 0; i < drop; i++) {
        const [k] = entries[i];
        try { localStorage.removeItem(TTS_CACHE_PREFIX + k); } catch { /* */ }
        delete idx[k];
      }
      idx[key] = Date.now();
      localStorage.setItem(TTS_CACHE_INDEX_KEY, JSON.stringify(idx));
      trySet();
    } catch {
      removeFromIndex(); // blob write still failed — don't leave a dangling index entry
    }
  }
}

async function sarvamStreamPlay(text: string): Promise<HTMLAudioElement> {
  const hash = ttsTextHash(text);

  const cached = ttsCacheRead(hash);
  if (cached) {
    const audio = new Audio(URL.createObjectURL(cached));
    const p = audio.play();
    if (p && typeof p.then === "function") {
      p.catch((err) => console.error("[TTS] cached play rejected:", err?.name || err));
    }
    return audio;
  }

  // Proxied through a Supabase Edge Function so the Sarvam key stays
  // server-side. The proxy streams back the same response format.
  const response = await fetch(`${SUPABASE_URL}/functions/v1/sarvam-tts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      text,
      target_language_code: "hi-IN",
      speaker: "gokul",
      model: "bulbul:v3",
      pace: 1,
      speech_sample_rate: 24000,
      output_audio_codec: "mp3",
      enable_preprocessing: true,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`TTS HTTP ${response.status}: ${errText.substring(0, 200)}`);
  }

  const buffer = await response.arrayBuffer();
  const blob = new Blob([buffer], { type: "audio/mpeg" });
  const audio = new Audio(URL.createObjectURL(blob));
  const playResult = audio.play();
  if (playResult && typeof playResult.then === "function") {
    playResult.catch((err) => {
      console.error("[TTS] audio.play() rejected:", err?.name || err);
    });
  }
  try { ttsCacheWrite(hash, buffer); } catch { /* */ }
  return audio;
}

// ── Supabase direct access ──────────────────────────────────────────────
const SUPABASE_URL = "https://etfmndcrchundvgtvmot.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0Zm1uZGNyY2h1bmR2Z3R2bW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc2NDE1MTIsImV4cCI6MjA2MzIxNzUxMn0.7GXS820xSFcUy2TRdbspN7s-NP3sgKFFtUP-Zw0Qbrs";

function sbFetch(path: string, opts?: RequestInit) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(opts?.headers || {}),
    },
  });
}

// Per-book Supabase table names so chaitanya edits/bookmarks don't collide
// with the bhagavatam reader. These tables can be created with the same
// schema as their bhagavatam_* counterparts.
const TBL_PAGE_EDITS    = `${BOOK_KEY}_page_edits`;
const TBL_BOOKMARKS     = `${BOOK_KEY}_bookmarks`;

// Match chapter headings: "Chapter <anything>" or "अध्याय <any-hindi-word-or-digit>"
const CHAPTER_RE = /^(?:Chapter\s+\S+|अध्याय\s+(?:[ऀ-ॿ]+(?:\s+[ऀ-ॿ]+){0,2}|\d+))\s*$/iu;

// ── Helpers ────────────────────────────────────────────────────────────────────

function isGarbagePage(text: string): boolean {
  if (!text || text.length < 20) return true;
  const devanagari = (text.match(/[ऀ-ॿ]/gu) || []).length;
  const total = text.replace(/\s/g, "").length;
  if (total === 0) return true;
  if (devanagari / total < 0.4) return true;
  const ascii = (text.match(/[a-zA-Z0-9@#$%^&*(){}\[\]|\\<>]/gu) || []).length;
  if (total > 0 && ascii / total > 0.25) return true;
  return false;
}

function isStandalonePageNumber(line: string): boolean {
  return /^\d{1,5}[\]\)]*$/.test(line.trim());
}

function stripLeadingPageNumber(line: string): string {
  // A page whose printed number the scan mangled can leave a line that is nothing
  // but a stray bracket or pipe (page 1935 begins with a bare "]"), which then
  // renders as its own paragraph. Drop those outright.
  return line
    .replace(/^\d{2,5}[\]\)]*\s+/, "")
    .replace(/^[\[\]()|{}<>*.,'"`~^_-]{1,3}\s*$/u, "");
}

// Inline markdown-bold renderer — converts **text** runs to <strong>.
// Used everywhere we render `sec.lines` so users can highlight text and bold it.
// Plain text passes through unchanged.
//
// BUG FIX (multi-line bold): a **...** span can open on one line of a section
// and close on a later line (e.g. a 3-line shlok wrapped in a single ** pair).
// Splitting/rendering line-by-line left each line with an unbalanced "**",
// so nothing matched and the literal asterisks were shown. We now tokenize
// bold spans across the WHOLE block (all of a section's lines, joined with
// "\n") and then re-split the result back into per-line React nodes so each
// line keeps its own <p> wrapper. If a block has an odd number of "**"
// markers, we treat the block as plain text (do not bold half of it, and do
// not strip the stray asterisks — they're rendered as-is, same as before).
function renderInlineBoldBlock(lines: string[]): React.ReactNode[] {
  const joined = lines.join("\n");
  if (!joined.includes("**")) return lines;

  // Bail out to plain text if "**" markers are unbalanced across the block —
  // never bold only half of an unmatched pair.
  const markerCount = (joined.match(/\*\*/g) || []).length;
  if (markerCount % 2 !== 0) return lines;

  // Tokenize the whole block: alternating plain / bold segments. Bold segments
  // may themselves contain "\n" (spanning multiple lines).
  const tokens = joined.split(/(\*\*[^*]+\*\*)/g);
  type Piece = { bold: boolean; text: string };
  const pieces: Piece[] = tokens
    .filter((tok) => tok.length > 0)
    .map((tok) => {
      if (tok.startsWith("**") && tok.endsWith("**") && tok.length >= 4) {
        return { bold: true, text: tok.slice(2, -2) };
      }
      return { bold: false, text: tok };
    });

  // Re-split the flat piece list back into per-original-line node arrays,
  // splitting any piece that contains "\n" at the line boundaries.
  const perLine: React.ReactNode[][] = lines.map(() => []);
  let lineIdx = 0;
  let keySeq = 0;
  for (const piece of pieces) {
    const segments = piece.text.split("\n");
    segments.forEach((seg, segIdx) => {
      if (seg.length > 0) {
        const node = piece.bold
          ? <strong key={keySeq++}>{seg}</strong>
          : <React.Fragment key={keySeq++}>{seg}</React.Fragment>;
        perLine[lineIdx]?.push(node);
      }
      // A "\n" inside the piece means we've moved to the next source line.
      if (segIdx < segments.length - 1) lineIdx++;
    });
  }
  return perLine;
}

// Back-compat single-line wrapper — used only where a lone line (not a whole
// block/section) is being rendered, e.g. an isolated AI-suggestion preview.
// A "**" that opens and closes on THIS line still renders bold; an unbalanced
// "**" on a single line renders as plain text (falls through unchanged).
function renderInlineBold(line: string): React.ReactNode {
  return renderInlineBoldBlock([line])[0];
}

function cleanOcrText(text: string): string {
  let result = text
    // Repair decomposed vowels. The scan writes ऐ as ए + a combining "े" and औ as
    // ओ + "ो"; a combining sign on an independent vowel has no base to attach to,
    // so the font renders it on a dotted circle — "एेश्वर्य" instead of "ऐश्वर्य".
    .replace(/\u090F[\u0946\u0947]/gu, "\u0910")   // ए + े  → ऐ
    .replace(/\u0913[\u094A\u094B]/gu, "\u0914")   // ओ + ो  → औ
    .replace(/\u0905\u093E/gu, "\u0906")           // अ + ा  → आ
    // A combining mark with no consonant before it (after a space, hyphen or a
    // zero-width joiner the OCR left behind) can only render as a dotted circle.
    .replace(/(^|[\s\-\u200C\u200D])[\u093E-\u094D\u0955-\u0957\u0962\u0963]+/gmu, "$1")
    // The OCR transcribes roughly a quarter of dandas as ASCII pipes, which render
    // as "|" and "|| १९ ||" instead of । and ॥. Restore the real marks.
    .replace(/\|\s*\|/g, "॥")
    .replace(/(?<=[\u0900-\u097F\s])\|/gu, "।")
    .replace(/^(\d{1,5}[\]\)]*)$/gmu, "")
    .replace(/(?<=[ऀ-ॿ\s;,।:—\-\.])\s*\b[a-zA-Z]{1,5}\b\s*[:\|]?\s*(?=[ऀ-ॿ\s;,।:—\-\.])/gu, " ")
    .replace(/(?<=[ऀ-ॿ])\s+[a-zA-Z]{1,4}\s+(?=[ऀ-ॿ])/gu, " ")
    .replace(/©/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[^\S\n]{2,}/g, " ")
    .replace(/;\s*;/g, ";")
    .trim();
  // Reuse the shared text-correction map from bhagwatham-config — same OCR
  // engine, same families of glyph errors, so the fixes carry over cleanly.
  result = applyTextCorrections(result);
  return result;
}

function isChapterHeading(t: string): boolean {
  const cleaned = t.replace(/^\d+\s+/, "");
  if (cleaned.length > 60) return false;
  if (t.includes("पूर्ण हुए") || t.includes("पूर्ण हुआ")) return false;
  if (CHAPTER_RE.test(cleaned)) return true;
  return false;
}

// Detect half-shloka: Sanskrit verse line ending in single danda but no double.
function isHalfShlokaLine(line: string): boolean {
  if (!/।\s*$/.test(line)) return false;
  if (/॥/.test(line)) return false;
  const body = line.replace(/।\s*$/, "").trim();
  if (body.length < 5 || body.length > 120) return false;
  const dev = (body.match(/[ऀ-ॿ]/gu) || []).length;
  const total = body.replace(/\s/g, "").length;
  if (total === 0 || dev / total < 0.7) return false;
  if (/^(तात्पर्य|शब्दार्थ|अनुवाद|अध्याय|भाग|Chapter)/iu.test(body)) return false;
  if ((body.includes("—") || body.includes("--")) && body.includes(";")) return false;
  const visarga = (body.match(/ः/gu) || []).length;
  const sanskritEndings = (body.match(/(?:स्य|ेन|ाय|ात्|ेषु|ानाम्|ेभ्यः|ाभिः|म्\s|म्$)/gu) || []).length;
  const sanskritParticles = (body.match(/(?:^|\s)(?:च|एव|हि|तु|अपि|वै|यः|सः|यदा|तदा|तथा|इति|एषः)(?:\s|$)/gu) || []).length;
  const hindiPP = (body.match(/(?:^|\s)(?:का|की|के|को|में|पर|से|ने|तक|और|कि|जब|तब|नहीं|प्रति|बिना|साथ|लिए|बारे|जैसे|क्योंकि|इसलिए|द्वारा|वाला|वाले|वाली|अपने|अपनी|उन्हें|इन्हें|नामक|अन्तर्गत|अंतर्गत)(?:\s|$)/gu) || []).length;
  const hindiVerb = /(?:है[ँं]?|हैं|था|थे|थी|गया|गयी|गई|गये|किया|करें|रहा|रहे|रही|सकता|सकते|सकती|सके|चाहिए|होता|होती|होते|हुआ|हुई|हुए|चले|दिया|लिया|कहा|पूर्ण हुए|समाप्त)(?:\s|।|$)/u.test(body);
  // Chapter-end colophon ("इस प्रकार ... नामक ... अध्याय ... पूर्ण हुए।"). It ends in a
  // single danda like a half-shloka, and "अध्याय" ends in "ाय" which the case-ending
  // test counts as a Sanskrit signal, so one false signal outvoted the Hindi evidence.
  if (/(?:^|\s)(?:इस प्रकार|नामक)(?:\s|$)/u.test(body) && /(?:अध्याय|स्कन्ध|पूर्ण हुए|समाप्त)/u.test(body)) return false;
  if (hindiPP >= 2) return false;
  if (hindiVerb && (visarga + sanskritEndings) < 2) return false;
  return (visarga + sanskritEndings + sanskritParticles) >= 1;
}

// The lines of a page exactly as RenderContent reads them: cleaned, page numbers
// dropped, "" for blank lines. Cached by text: the page loop asks for the same
// pages on every render.
const pageLinesCache = new Map<string, string[]>();
function pageLines(text: string): string[] {
  const hit = pageLinesCache.get(text);
  if (hit) return hit;
  const result = cleanOcrText(text).split("\n")
    .map((l) => (l.trim() ? stripLeadingPageNumber(l) : ""))
    .filter((l) => l === "" || !isStandalonePageNumber(l));
  if (pageLinesCache.size > 500) pageLinesCache.clear();
  pageLinesCache.set(text, result);
  return result;
}

function getPageEndKind(text: string, nextPageText?: string): string {
  if (!text) return "text";
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  let lastKind = "text";
  let insideTatparya = false;
  for (const line of lines) {
    if (/^तात्पर्य/u.test(line)) { lastKind = "tatparya"; insideTatparya = true; }
    else if (/^अनुवाद/u.test(line)) { lastKind = "anuvad"; insideTatparya = false; }
    else if (/^शब्दार्थ/u.test(line)) { lastKind = "shabdarth"; insideTatparya = false; }
    else if (/॥/u.test(line)) {
      if (insideTatparya) {
        lastKind = "ref-shlok";
      } else {
        lastKind = "shlok";
        insideTatparya = false;
      }
    }
    else if (isHalfShlokaLine(line)) {
      lastKind = insideTatparya ? "ref-shlok" : "shlok";
    }
    else if (/^(अध्याय|भाग|Chapter)/iu.test(line)) { lastKind = "text"; insideTatparya = false; }
    else if (lastKind === "shabdarth" && !(line.includes("—") || line.includes("--")) && !line.includes(";")) {
      lastKind = "anuvad"; insideTatparya = false;
    }
    else if (lastKind === "ref-shlok" && insideTatparya) {
      lastKind = "tatparya";
    }
    else if (lastKind === "shlok" && !/॥/u.test(line)) {
      lastKind = "anuvad";
    }
  }
  if (lastKind === "ref-shlok" && nextPageText && pageStartsWithNumberedShlokContinuation(nextPageText)) {
    const lastDevLine = [...lines].reverse().find(l => /[ऀ-ॿ]/.test(l)) || "";
    const endsAsHalf = /।\s*$/.test(lastDevLine) && !/॥/.test(lastDevLine);
    if (endsAsHalf) {
      lastKind = "shlok";
    }
  }
  // A page ending with the opening lines of the verse the next page closes with
  // ॥ N ॥ ends in that shlok, however the loop above classed those lines.
  if (nextPageText && openVerseTailLength(pageLines(text), numberedVerseHeadLength(pageLines(nextPageText))) > 0) {
    return "shlok";
  }
  return lastKind;
}

function pageStartsWithNumberedShlokContinuation(text: string): boolean {
  if (!text) return false;
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean).filter(l => !isStandalonePageNumber(l));
  let scanned = 0;
  for (const line of lines) {
    if (scanned > 3) return false;
    if (/^(तात्पर्य|शब्दार्थ|अनुवाद)/u.test(line)) return false;
    if (/^(अध्याय|भाग|Chapter)/iu.test(line)) return false;
    if (isChapterHeading(line)) return false;
    if (/(?:है[ँं]?|हैं|था|थी|गया|गयी|किया|रहा|होता|करता)(?:\s|।|$)/u.test(line)) return false;
    if (/॥\s*[\d१२३४५६७८९०]+\s*॥/u.test(line)) return true;
    if (/॥/u.test(line)) return false;
    scanned++;
  }
  return false;
}

// ── Reader Identity Modal ────────────────────────────────────────────────────

function ReaderIdentityModal({ onSave, onClose }: { onSave: (id: string, name: string) => void; onClose: () => void }) {
  const [contact, setContact] = useState("");
  const [name, setName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = contact.trim().toLowerCase();
    if (!trimmed) return;
    onSave(trimmed, name.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
            <BookMarked className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h3 className="font-serif text-lg font-bold text-stone-800">Save Bookmark</h3>
            <p className="text-xs text-stone-500">Save your reading progress</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-stone-600 mb-1">Email or Phone *</label>
            <input
              type="text" value={contact} onChange={(e) => setContact(e.target.value)}
              placeholder="email@example.com or 9876543210"
              className="w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300"
              autoFocus required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-600 mb-1">Your Name (optional)</label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-stone-100 text-stone-600 rounded-xl text-sm font-semibold hover:bg-stone-200 transition-colors"
            >
              Cancel
            </button>
            <button type="submit"
              className="flex-1 px-4 py-2.5 bg-orange-600 text-white rounded-xl text-sm font-semibold hover:bg-orange-700 transition-colors"
            >
              Save
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── Bookmark Panel ─────────────────────────────────────────────────────

function BookmarkPanel({ bookmarks, onJump, onDelete, isLoggedIn, onLogin }: {
  bookmarks: BookmarkEntry[];
  onJump: (b: BookmarkEntry) => void;
  onDelete: (b: BookmarkEntry) => void;
  isLoggedIn: boolean;
  onLogin: () => void;
}) {
  if (!isLoggedIn) {
    return (
      <div className="px-4 py-8 text-center">
        <div className="w-12 h-12 mx-auto mb-3 bg-orange-100 rounded-full flex items-center justify-center">
          <LogIn className="w-5 h-5 text-orange-600" />
        </div>
        <p className="text-sm font-semibold text-stone-700 mb-1">Sign in to see your bookmarks</p>
        <p className="text-[11px] text-stone-500 mb-4 leading-relaxed">
          Save your reading progress with an email or phone — your bookmarks sync across devices.
        </p>
        <button
          onClick={onLogin}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-semibold transition-colors"
        >
          <LogIn className="w-3.5 h-3.5" /> Sign in
        </button>
      </div>
    );
  }
  if (bookmarks.length === 0) {
    return (
      <div className="px-4 py-6 text-center">
        <Bookmark className="w-6 h-6 text-stone-300 mx-auto mb-2" />
        <p className="text-xs text-stone-400">No bookmarks yet</p>
        <p className="text-[10px] text-stone-300 mt-1">Tap the bookmark icon while reading</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 px-2">
      {bookmarks.map((b) => (
        <div key={b.id} className="flex items-center gap-2 group">
          <button
            onClick={() => onJump(b)}
            className="flex-1 text-left px-3 py-2 rounded-lg hover:bg-orange-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Bookmark className="w-3.5 h-3.5 text-orange-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-stone-700 truncate">
                  {/* page_number is synthesized (batch*100000 + page) — show the per-chapter page */}
                  {b.label || (b.chapter_title ? b.chapter_title.split("—")[0].trim() : `Page ${b.page_number % 100000}`)}
                </p>
                <p className="text-[10px] text-stone-400">
                  Page {b.page_number % 100000}
                  {b.chapter_title && ` · ${b.chapter_title.split("—")[0].trim()}`}
                </p>
              </div>
            </div>
          </button>
          <button
            onClick={() => onDelete(b)}
            className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50 text-stone-400 hover:text-red-500 transition-all"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Content Renderer ───────────────────────────────────────────────────────

function RenderContent({ text, textEn, lang, themeKey = "light", pageNumber, overrides, onOverridesChange, prevPageEndKind, nextPageStartsNumberedShlok, nextPageVerseHeadLines, unboldLines, sceneArt }: {
  text: string;
  textEn?: string;
  lang: "hi" | "en";
  themeKey?: Theme;
  pageNumber?: number;
  overrides?: SectionOverride[];
  onOverridesChange?: (pageNum: number, overrides: SectionOverride[]) => void;
  prevPageEndKind?: string;
  nextPageStartsNumberedShlok?: boolean;
  nextPageVerseHeadLines?: number;
  unboldLines?: Set<string>;
  sceneArt?: Array<{ id: number; key: string; image_url: string }>;
}) {
  const t = THEME_STYLES[themeKey];

  // ── Section Editor state ────────────────────────────────────────────
  // Hooks MUST be declared unconditionally before the English-mode early
  // return below — otherwise toggling `lang` changes the hook order between
  // renders and React crashes.
  const [editMode, setEditMode] = useState(false);
  const [selStart, setSelStart] = useState<number | null>(null);
  const [selEnd, setSelEnd] = useState<number | null>(null);

  if (lang === "en" && textEn) {
    const enLines = textEn.split("\n")
      .filter((l) => l.trim() && !isStandalonePageNumber(l))
      .map((l) => stripLeadingPageNumber(l));
    const renderedEnLines = renderInlineBoldBlock(enLines); // bold state carries across lines
    return (
      <div className="space-y-4">
        {enLines.map((l, i) => (
          <p key={i} className={`leading-[1.8] ${t.text} mb-1`}>{renderedEnLines[i]}</p>
        ))}
      </div>
    );
  }

  // Blank lines are kept as "" markers — the only record of where real paragraphs
  // end. See the Bhagavatam reader: dropping them meant prose could not reflow.
  const lines = cleanOcrText(text).split("\n")
    .map((l) => (l.trim() ? stripLeadingPageNumber(l) : ""))
    .filter((l) => l === "" || !isStandalonePageNumber(l));

  type Section = { kind: "chapter" | "shlok" | "ref-shlok" | "shabdarth" | "anuvad" | "tatparya" | "text"; lines: string[] };
  const sections: Section[] = [];
  const continuableKinds = ["tatparya", "anuvad", "ref-shlok", "shlok", "shabdarth"];
  const initialKind = (prevPageEndKind && continuableKinds.includes(prevPageEndKind)) ? prevPageEndKind as Section["kind"] : "text";
  let current: Section = { kind: initialKind, lines: [] };

  const flush = () => { if (current.lines.length > 0) sections.push(current); };

  // Hindi-postposition vs Sanskrit-inflection classifier — same hybrid
  // detector used by the bhagavatam reader. Lives intentionally as inline
  // code so any per-book tweaks (e.g. Bengali-Sanskrit chaitanya verses)
  // can be done here later without touching shared lib.
  const countHindiPostpositions = (line: string): number => {
    const matches = line.match(/(?:^|\s)(?:का|की|के|को|में|पर|से|ने|तक|और|या|भी|तो|ही|यह|वह|जो|इस|उस|कि|जब|तब|नहीं|प्रति|बिना|साथ|लिए|बारे|जैसे|क्योंकि|इसलिए|फिर|अभी|कभी|सभी|किसी|अपने|उनके|इनके|जिसमें|जिससे|जिसको|उन्हें|इन्हें|जिन्हें|उसे|इसे|मुझे|हमें|तुम्हें|उन्होंने|अपनी|अपना)(?:\s|[।,;:\)]|$)/gu);
    return matches ? matches.length : 0;
  };
  const HINDI_VERB_RE = /(?:है[ँं]?|हैं|हैँ|था|थे|थी|गया|गयी|गई|किया|करें|करे|रहा|सकता|चाहिए|हुई|हुए|होता|होती|होते|करते|करता|करना|बताया|कहा|सुना|दिया|लिया|पड़ा|आया|चुके|चुका|रहे|रही|जाता|जाती|जाते|मिलता|रखा|बचा|डाला|बनाकर|कहलाता|कहलाती|सकती|सकते|देखे|लगती|लगते|भोगता|जानता|उठाते|करोगे|करेगा|करेगी|करेंगे|दिखाया|सुनाया|बैठकर|होकर|करके|लाकर|जाकर|दिखाते|चलाते|बताते|सुनाते|पालते|रहते|चलते|बनाते|मानते|जानते|कहते|देते|लेते|आते|होनी|चाहती|चाहते|पाते|दिखती|मिलती|बनती|चलती|आती|पाती|सके|सका|सकी|सकें|दिखा|पाया|पाये|पाई|लगा|लगे|लगी|हुआ|गए|चाहा)(?:\s|[।,;:\)]|$)/u;

  const countVisarga = (line: string): number => (line.match(/ः/gu) || []).length;
  const SANSKRIT_PARTICLES_RE = /(?:^|\s)(?:च|एव|हि|तु|अपि|वै|न|यदा|तदा|तथा|इति|किम्|तत्|एषः|सः|यः|अथ|परम्)(?:\s|[।॥,;:\)]|$)/gu;
  const countSanskritParticles = (line: string): number => {
    const matches = line.match(SANSKRIT_PARTICLES_RE);
    return matches ? matches.length : 0;
  };
  const countSanskritEndings = (line: string): number => {
    const matches = line.match(/(?:स्य|ेन|ाय|ात्|ेषु|ानाम्|ेभ्यः|ाभिः|ायाः|म्\s)/gu);
    return matches ? matches.length : 0;
  };
  const sanskritScore = (line: string): number =>
    countVisarga(line) * 4 + countSanskritParticles(line) * 3 + countSanskritEndings(line) * 3;

  const isVerseLike = (line: string) => {
    if (line.length > 120 || line.length < 5) return false;
    const dev = (line.match(/[ऀ-ॿ]/gu) || []).length;
    const total = line.replace(/\s/g, "").length;
    if (total === 0 || dev / total < 0.7) return false;
    if (/^(तात्पर्य|शब्दार्थ|अनुवाद)/u.test(line)) return false;
    if ((line.includes("—") || line.includes("--")) && line.includes(";")) return false;

    const hindiPP = countHindiPostpositions(line);
    const hasHindiVerb = HINDI_VERB_RE.test(line);
    const sScore = sanskritScore(line);

    if (sScore >= 8) return true;

    if (hindiPP >= 2) return false;
    if (hasHindiVerb) {
      if (sScore >= 4) return true;
      return false;
    }
    return true;
  };

  const hasDoubleViramAhead = (fromIdx: number, maxLook: number = 3) => {
    for (let j = fromIdx; j < Math.min(lines.length, fromIdx + maxLook); j++) {
      const lt = lines[j].trim();
      if (/॥/u.test(lt)) return true;
      if (/^(तात्पर्य|शब्दार्थ|अनुवाद)/u.test(lt)) return false;
      if (isChapterHeading(lt)) return false;
      if (HINDI_VERB_RE.test(lt) || countHindiPostpositions(lt) >= 2) return false;
    }
    return false;
  };

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    // A blank line closes the paragraph: flush it as its own section of the same
    // kind so multi-paragraph purports stay separated and each block can reflow.
    if (!t) {
      if (current.lines.length > 0) { const k = current.kind; flush(); current = { kind: k, lines: [] }; }
      continue;
    }

    if (isChapterHeading(t)) {
      flush();
      sections.push({ kind: "chapter", lines: [t] });
      current = { kind: "text", lines: [] };
      continue;
    }

    if (/^तात्पर्य/u.test(t)) {
      flush();
      current = { kind: "tatparya", lines: [] };
      const rest = t.replace(/^तात्पर्य\s*[:：\-—।]\s*/u, "").trim();
      if (rest) current.lines.push(rest);
      continue;
    }

    if (/^शब्दार्थ/u.test(t)) {
      flush();
      if (sections.length > 0 && (sections[sections.length - 1].kind === "text" || sections[sections.length - 1].kind === "ref-shlok")) {
        sections[sections.length - 1].kind = "shlok";
      }
      current = { kind: "shabdarth", lines: [] };
      continue;
    }

    if (/॥/u.test(t) && t.length < 200) {
      const hasVerseNumber = /॥\s*[\d१२३४५६७८९०]+\s*॥/u.test(t);
      const shlokKind = (!hasVerseNumber && (current.kind === "tatparya" || current.kind === "ref-shlok")) ? "ref-shlok" : "shlok";
      if (current.kind !== "shlok" && current.kind !== "ref-shlok") {
        flush();
        current = { kind: shlokKind, lines: [] };
      } else if (hasVerseNumber && current.kind === "ref-shlok") {
        current.kind = "shlok";
        if (sections.length > 0 && sections[sections.length - 1].kind === "ref-shlok") {
          sections[sections.length - 1].kind = "shlok";
        }
      }
      current.lines.push(t);
      continue;
    }

    if ((current.kind === "shlok" || current.kind === "ref-shlok") && isVerseLike(t)) {
      current.lines.push(t);
      continue;
    }

    if (current.kind !== "shlok" && current.kind !== "ref-shlok" && isVerseLike(t) && hasDoubleViramAhead(i + 1)) {
      const shlokKind = current.kind === "tatparya" ? "ref-shlok" : "shlok";
      flush();
      current = { kind: shlokKind, lines: [t] };
      continue;
    }

    if (current.kind !== "shlok" && current.kind !== "ref-shlok" && isHalfShlokaLine(t)) {
      const shlokKind = (current.kind === "tatparya") ? "ref-shlok" : "shlok";
      flush();
      current = { kind: shlokKind, lines: [t] };
      continue;
    }

    if (current.kind === "shabdarth") {
      const hasDash = t.includes("—") || t.includes("--") || /\S-\s/.test(t);
      const hasSemicolon = t.includes(";");
      const endsWithDanda = /।\s*\.?\s*$/.test(t);

      if (hasDash || hasSemicolon) {
        current.lines.push(t);
        if (endsWithDanda) {
          flush();
          current = { kind: "anuvad", lines: [] };
        }
        continue;
      }

      if (/^अनुवाद/u.test(t)) {
        const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : "";
        const nextHasDash = nextLine.includes("—") || nextLine.includes("--") || /\S-\s/.test(nextLine);
        const nextHasSemicolon = nextLine.includes(";");
        if (nextHasDash || nextHasSemicolon) {
          continue;
        }
      }

      flush();
      current = { kind: "anuvad", lines: [t] };
      continue;
    }

    if (current.kind === "anuvad") {
      current.lines.push(t);
      continue;
    }

    if (current.kind === "shlok") {
      flush();
      current = { kind: "anuvad", lines: [t] };
      continue;
    }

    if (current.kind === "ref-shlok") {
      flush();
      current = { kind: "tatparya", lines: [t] };
      continue;
    }

    current.lines.push(t);
  }
  flush();

  for (let si = 0; si < sections.length - 1; si++) {
    if (sections[si].kind === "text" && sections[si + 1].kind === "shlok") {
      const textLines = sections[si].lines;
      const hindiVerbRE = /(?:है|हैं|था|थी|थे|होता|करता|गया|किया|दिया|लिया|रहा)(?:\s|[।,]|$)/u;
      const noHindiVerbs = textLines.every(l => !hindiVerbRE.test(l));
      const allShort = textLines.every(l => l.length < 100);
      if (allShort && noHindiVerbs) {
        sections[si + 1].lines = [...textLines, ...sections[si + 1].lines];
        sections.splice(si, 1);
        si--;
      }
    }
  }

  if (nextPageStartsNumberedShlok && sections.length > 0) {
    const last = sections[sections.length - 1];
    if (last.kind === "ref-shlok") {
      const lastLine = last.lines[last.lines.length - 1] || "";
      const endsAsHalf = /।\s*$/.test(lastLine) && !/॥/.test(lastLine);
      if (endsAsHalf) {
        last.kind = "shlok";
      }
    }
  }

  // ── Cross-page reconciliation: a verse opened at the page end ───────
  // The next page's first lines close a numbered verse (॥ N ॥) and this page
  // ends with that verse's opening lines. They rarely all end in a danda, so line
  // by line they became purport text, a quoted verse and a fresh "तात्पर्य :"
  // paragraph. Take the whole opening as one shlok; the next page then continues
  // it (prevPageEndKind "shlok", see getPageEndKind).
  // Guard: the trailing section lines must be exactly those page lines, else the
  // sections are left as they are.
  {
    const tail = openVerseTailLength(lines, nextPageVerseHeadLines ?? 0);
    if (tail > 0) {
      const tailLines = lines.filter((l) => l.trim()).slice(-tail).map((l) => l.trim());
      const trailing: string[] = [];
      for (let si = sections.length - 1; si >= 0 && trailing.length < tail; si--) {
        trailing.unshift(...sections[si].lines);
      }
      const matches = trailing.length >= tail && trailing.slice(-tail).every((l, k) => l === tailLines[k]);
      if (matches) {
        let remaining = tail;
        while (remaining > 0 && sections.length > 0) {
          const last = sections[sections.length - 1];
          const take = Math.min(remaining, last.lines.length);
          last.lines.splice(last.lines.length - take, take);
          remaining -= take;
          if (last.lines.length === 0) sections.pop();
        }
        sections.push({ kind: "shlok", lines: tailLines });
      }
    }
  }

  if (overrides && overrides.length > 0) {
    const lineTypes: SectionKind[] = [];
    const lineTexts: string[] = [];
    for (const sec of sections) {
      for (const l of sec.lines) {
        lineTypes.push(sec.kind === "chapter" || sec.kind === "ref-shlok" ? sec.kind as unknown as SectionKind : sec.kind as SectionKind);
        lineTexts.push(l);
      }
    }
    for (const ov of overrides) {
      for (let li = ov.startLine; li <= Math.min(ov.endLine, lineTypes.length - 1); li++) {
        lineTypes[li] = ov.kind;
      }
    }
    sections.length = 0;
    let curKind: string = lineTypes[0] || "text";
    let curLines: string[] = [];
    for (let li = 0; li < lineTexts.length; li++) {
      if (lineTypes[li] !== curKind && curLines.length > 0) {
        sections.push({ kind: curKind as Section["kind"], lines: curLines });
        curLines = [];
        curKind = lineTypes[li];
      }
      curLines.push(lineTexts[li]);
    }
    if (curLines.length > 0) sections.push({ kind: curKind as Section["kind"], lines: curLines });
  }

  // Flatten sections into lines for the editor. Plain computation, not a
  // hook: `sections` is rebuilt on every render, so the old useMemo never hit
  // its cache anyway — and hooks may not appear after the early return above.
  const editorLines = (() => {
    const result: { text: string; kind: SectionKind; lineIdx: number }[] = [];
    let idx = 0;
    for (const sec of sections) {
      for (const l of sec.lines) {
        const kind = (sec.kind === "chapter" || sec.kind === "ref-shlok") ? "text" : sec.kind as SectionKind;
        result.push({ text: l, kind, lineIdx: idx++ });
      }
    }
    return result;
  })();

  const handleLineClick = (lineIdx: number) => {
    if (selStart === null) {
      setSelStart(lineIdx);
      setSelEnd(lineIdx);
    } else if (selEnd !== null) {
      setSelEnd(lineIdx);
    }
  };

  const applyKind = (kind: SectionKind) => {
    if (selStart === null || selEnd === null || !pageNumber || !onOverridesChange) return;
    const s = Math.min(selStart, selEnd);
    const e = Math.max(selStart, selEnd);
    const newOverride: SectionOverride = { startLine: s, endLine: e, kind };
    const existing = overrides || [];
    const filtered = existing.filter(o => o.endLine < s || o.startLine > e);
    const merged = [...filtered, newOverride].sort((a, b) => a.startLine - b.startLine);
    onOverridesChange(pageNumber, merged);
    setSelStart(null);
    setSelEnd(null);
  };

  const clearOverrides = () => {
    if (pageNumber && onOverridesChange) {
      onOverridesChange(pageNumber, []);
    }
  };

  if (editMode && pageNumber) {
    const selMin = selStart !== null && selEnd !== null ? Math.min(selStart, selEnd) : -1;
    const selMax = selStart !== null && selEnd !== null ? Math.max(selStart, selEnd) : -1;
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => { setEditMode(false); setSelStart(null); setSelEnd(null); }}
            className="text-[11px] px-2.5 py-1 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-700 font-semibold transition-colors">
            ← Back
          </button>
          <span className="text-[11px] text-stone-500 font-medium">Pg. {pageNumber} — Select lines, then choose type</span>
          {(overrides && overrides.length > 0) && (
            <button onClick={clearOverrides}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-red-100 hover:bg-red-200 text-red-600 font-semibold transition-colors ml-auto">
              Clear All
            </button>
          )}
        </div>

        {selStart !== null && (
          <div className="flex items-center gap-1.5 flex-wrap sticky top-12 z-20 bg-white/95 backdrop-blur py-2 px-1 rounded-lg border border-stone-200 shadow-sm">
            <span className="text-[10px] text-stone-400 font-semibold mr-1">Selected ({selMax - selMin + 1} lines):</span>
            {(Object.keys(SECTION_KIND_LABELS) as SectionKind[]).map((k) => (
              <button key={k} onClick={() => applyKind(k)}
                className={`text-[11px] px-2.5 py-1 rounded-md border font-semibold transition-colors ${SECTION_KIND_LABELS[k].bg} ${SECTION_KIND_LABELS[k].color}`}>
                {SECTION_KIND_LABELS[k].label}
              </button>
            ))}
            <button onClick={() => { setSelStart(null); setSelEnd(null); }}
              className="text-[11px] px-2 py-1 rounded-md bg-stone-100 text-stone-500 hover:bg-stone-200 ml-1">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        <div className="space-y-0.5">
          {editorLines.map((line) => {
            const isSelected = line.lineIdx >= selMin && line.lineIdx <= selMax;
            const kindInfo = SECTION_KIND_LABELS[line.kind] || SECTION_KIND_LABELS.text;
            return (
              <div
                key={line.lineIdx}
                onClick={() => handleLineClick(line.lineIdx)}
                className={`flex items-start gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors select-none ${
                  isSelected ? "bg-orange-100 ring-1 ring-orange-400" : "hover:bg-stone-50"
                }`}
              >
                <span className={`text-[9px] font-mono mt-1 shrink-0 w-4 text-right ${isSelected ? "text-orange-600 font-bold" : "text-stone-300"}`}>
                  {line.lineIdx + 1}
                </span>
                <span className={`text-[10px] shrink-0 mt-0.5 px-1.5 py-0.5 rounded border font-semibold ${kindInfo.bg} ${kindInfo.color}`}>
                  {kindInfo.label}
                </span>
                <span className={`text-[13px] leading-relaxed ${isSelected ? "text-stone-900" : "text-stone-600"}`} style={{ fontFamily: "var(--font-devanagari)" }}>
                  {line.text}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Where each approved scene illustration goes on this page.
  // Art that matches nothing goes above the first section of this page's own text,
  // not above the tail of a passage carried over from the previous page.
  const artPlacement = placeSceneArt(sections.map(sec => sec.lines.join(" ")), sceneArt, sections.length > 1 && sections[0].kind === prevPageEndKind ? 1 : 0, sections.map(sec => sec.kind));

  return (
    <div className="space-y-5 group/page relative">
      {pageNumber && onOverridesChange && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("dev") && (
        <button
          onClick={() => setEditMode(true)}
          className="absolute -right-1 bottom-0 opacity-0 group-hover/page:opacity-60 hover:!opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-stone-100"
          title="Edit section boundaries"
        >
          <Pencil className="w-3.5 h-3.5 text-stone-400" />
        </button>
      )}
      {sections.map((sec, i) => {
        // Approved illustrations render directly above the passage they depict.
        const arts = artPlacement.get(i);
        const artEl = arts ? arts.map(art => (
          <figure key={`art-${art.id}`} className="my-5">
            <img src={art.image_url} alt="" loading="lazy"
              className="w-full max-w-md mx-auto rounded-xl border border-orange-200/60 shadow-sm" />
          </figure>
        )) : null;
        const withArt = (node: React.ReactNode) =>
          artEl ? <React.Fragment key={i}>{artEl}{node}</React.Fragment> : node;
        return withArt((() => {
        switch (sec.kind) {
          case "chapter": {
            return (
              <div key={i} data-section-type="chapter" className="mt-6 mb-4 scroll-mt-20">
                <h3 className={`text-xl sm:text-2xl font-bold ${t.text} mb-3 pb-2 border-b-2 border-orange-300/50`} style={{ fontFamily: "var(--font-devanagari)" }}>
                  {sec.lines.join(" ")}
                </h3>
              </div>
            );
          }
          case "shlok": {
            const isShlokContinuation = i === 0 && prevPageEndKind === "shlok";
            return (
              <div key={i} data-section-type="shlok" className={isShlokContinuation ? "" : "my-5 sm:my-6"}>
                {!isShlokContinuation && i > 0 && sections[i - 1].kind !== "chapter" && (
                  <div className={`mb-4 h-px ${themeKey === "dark" ? "bg-white/5" : themeKey === "sepia" ? "bg-amber-300/30" : "bg-orange-200/40"}`} />
                )}
                <div>
                  {(() => {
                    // Bold state must carry across the verse's lines (BUG FIX: a ** pair
                    // can open/close across multiple lines of the same shlok).
                    const rendered = renderInlineBoldBlock(sec.lines);
                    return sec.lines.map((l, j) => {
                      // Verses are bold by default; a maintainer can lighten a
                      // specific line via the "Remove bold" toolbar (un-bold override).
                      const unbolded = unboldLines?.has(normalizeBoldKey(l));
                      return (
                        <p key={j} className={`${unbolded ? "" : "font-bold "}leading-[1.9] mb-0.5 ${t.text}`} style={{ fontSize: "1.15em", fontFamily: "var(--font-sanskrit)" }}>{rendered[j]}</p>
                      );
                    });
                  })()}
                </div>
              </div>
            );
          }
          case "ref-shlok": {
            const isRefShlokContinuation = i === 0 && prevPageEndKind === "ref-shlok";
            const renderedRefShlok = renderInlineBoldBlock(sec.lines); // bold state carries across lines
            return (
              <div key={i} data-section-type="ref-shlok" className={isRefShlokContinuation ? "" : `pl-4 border-l-2 my-2 ${themeKey === "dark" ? "border-amber-800/40" : themeKey === "sepia" ? "border-[#c4ad80]" : "border-[#c4956a]/40"}`}>
                {sec.lines.map((l, j) => (
                  <p key={j} className={`leading-[1.7] italic mb-0.5 ${isRefShlokContinuation ? "pl-4" : ""} ${themeKey === "dark" ? "text-amber-400/70" : themeKey === "sepia" ? "text-[#6b4020]" : "text-[#8b5a30]"}`} style={{ fontSize: "0.9em", fontFamily: "var(--font-sanskrit)" }}>{renderedRefShlok[j]}</p>
                ))}
              </div>
            );
          }
          case "shabdarth":
            return (
              <div key={i} data-section-type="shabdarth" className="my-3">
                <p className={`font-bold mb-2 text-center ${themeKey === "dark" ? "text-blue-400" : themeKey === "sepia" ? "text-[#1a3a6a]" : "text-[#1a4a8a]"}`} style={{ fontSize: "0.85em", fontFamily: "var(--font-devanagari)" }}>शब्दार्थ</p>
                {sec.lines.map((l, j) => {
                  const parts = l.split(/(—|--|-\s)/);
                  // Meanings are bold by default; "Clear formatting"/"Remove bold"
                  // on the selection lightens them via the un-bold override.
                  const unbolded = unboldLines?.has(normalizeDashKey(l));
                  return (
                    <p key={j} className={`leading-[1.7] mb-0.5 ${themeKey === "dark" ? "text-blue-300/80" : themeKey === "sepia" ? "text-[#1a3a6a]" : "text-[#1a4a8a]"}`} style={{ fontSize: "0.8em", fontFamily: "var(--font-devanagari)" }}>
                      {parts.map((part, k) => {
                        if (part === "—" || part === "--" || part === "- ") return <span key={k}>—</span>;
                        const isMeaning = k > 0 && (parts[k - 1] === "—" || parts[k - 1] === "--" || parts[k - 1] === "- ");
                        return isMeaning && !unbolded
                          ? <strong key={k} className={themeKey === "dark" ? "text-blue-200" : themeKey === "sepia" ? "text-[#0a2a5a]" : "text-[#0a2a5a]"}>{part}</strong>
                          : <span key={k}>{part}</span>;
                      })}
                    </p>
                  );
                })}
              </div>
            );
          case "anuvad": {
            const isAnuvadContinuation = i === 0 && prevPageEndKind === "anuvad";
            const renderedAnuvad = renderInlineBoldBlock([sec.lines.join(" ")])[0];
            return (
              <div key={i} data-section-type="anuvad" className={isAnuvadContinuation ? "" : "mt-3"}>
                {/* One reflowing paragraph — the OCR breaks at PRINT line ends. */}
                <p className={`leading-[2] mb-1 ${t.text}`} style={{ fontSize: "0.95em", fontFamily: "var(--font-devanagari)" }}>{renderedAnuvad}</p>
              </div>
            );
          }
          case "tatparya": {
            const isContinuation = i === 0 && (prevPageEndKind === "tatparya" || prevPageEndKind === "ref-shlok");
            const renderedTatparya = renderInlineBoldBlock([sec.lines.join(" ")])[0];
            // Label belongs at the top of the purport, not above every paragraph.
            const showTatparyaLabel = !isContinuation && (i === 0 || sections[i - 1].kind !== "tatparya");
            return (
              <div key={i} data-section-type="tatparya" className={isContinuation ? "" : "mt-4 sm:mt-5"}>
                <p className={`leading-[2] mb-1 ${t.text}`} style={{ fontSize: "0.95em", fontFamily: "var(--font-devanagari)" }}>
                  {showTatparyaLabel && <><span className="font-semibold">तात्पर्य :</span>{" "}</>}
                  {renderedTatparya}
                </p>
              </div>
            );
          }
          default: {
            const renderedText = renderInlineBoldBlock([sec.lines.join(" ")])[0];
            return (
              <div key={i} data-section-type="text">
                <p className={`leading-[1.8] ${t.text} mb-1`} style={{ fontSize: "1em" }}>{renderedText}</p>
              </div>
            );
          }
        }
        })());
      })}
    </div>
  );
}

// ── Step Scroll Progress Indicator ──────────────────────────────────────

type SectionMarker = { type: string; el: HTMLElement };

function StepScrollIndicator({ themeKey }: { themeKey: Theme }) {
  const [markers, setMarkers] = useState<SectionMarker[]>([]);
  const [activeIdx, setActiveIdx] = useState<number>(-1);

  useEffect(() => {
    const refresh = () => {
      const els = document.querySelectorAll<HTMLElement>("[data-section-type]");
      const items: SectionMarker[] = [];
      els.forEach(el => {
        const type = el.getAttribute("data-section-type") || "text";
        items.push({ type, el });
      });
      setMarkers(items);
    };
    const timer = setTimeout(refresh, 800);
    const ro = new ResizeObserver(() => setTimeout(refresh, 100));
    ro.observe(document.body);
    return () => { clearTimeout(timer); ro.disconnect(); };
  }, []);

  useEffect(() => {
    if (markers.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = markers.findIndex(m => m.el === entry.target);
            if (idx >= 0) setActiveIdx(idx);
          }
        }
      },
      { rootMargin: "-20% 0px -60% 0px" }
    );
    markers.forEach(m => observer.observe(m.el));
    return () => observer.disconnect();
  }, [markers]);

  const handleClick = (m: SectionMarker) => {
    m.el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  if (markers.length < 3) return null;

  const palette = {
    light: { inactive: "#d6d3d1", active: "#292524" },
    dark: { inactive: "#57534e", active: "#e7e5e4" },
    sepia: { inactive: "#c4b5a0", active: "#5b4636" },
  }[themeKey];

  const getWidth = (type: string, isActive: boolean) => {
    switch (type) {
      case "chapter":  return isActive ? 20 : 14;
      case "shlok":    return isActive ? 16 : 10;
      case "tatparya": return isActive ? 18 : 12;
      case "shabdarth":return isActive ? 12 : 7;
      case "anuvad":   return isActive ? 14 : 9;
      default:         return isActive ? 12 : 7;
    }
  };

  return (
    <div className="hidden lg:block sticky top-1/2 -translate-y-1/2 shrink-0 z-20 self-start" style={{ width: 28, marginLeft: -52 }}>
      <div className="flex flex-col items-end" style={{ gap: 8 }}>
        {markers.map((m, i) => {
          const isActive = i === activeIdx;
          const w = getWidth(m.type, isActive);
          const opacity = isActive ? 1 : 0.35;

          return (
            <button
              key={i}
              onClick={() => handleClick(m)}
              className="shrink-0 cursor-pointer transition-all duration-200 hover:opacity-80 rounded-full"
              style={{
                width: w,
                height: isActive ? 2.5 : 1.5,
                backgroundColor: isActive ? palette.active : palette.inactive,
                opacity,
                padding: 0,
                border: "none",
              }}
              title={m.type}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Sidebar (Kindle-like index) ─────────────────────────────────────────
// Grouped by `part` — normalized via partKey() to the short codes
// "adi" / "madhya" / "antya" — instead of `canto` (integer 1..12 in
// bhagwatham). Order follows PART_ORDER.

function Sidebar({
  chapters,
  activeChapter,
  isOpen,
  onClose,
  onChapterClick,
  bookmarks,
  onBookmarkJump,
  onBookmarkDelete,
  readerId,
  readerName,
  onLogin,
  onLogout,
}: {
  chapters: ChapterEntry[];
  activeChapter: number | null;
  isOpen: boolean;
  onClose: () => void;
  onChapterClick: (chapter: ChapterEntry) => void;
  bookmarks: BookmarkEntry[];
  onBookmarkJump: (b: BookmarkEntry) => void;
  onBookmarkDelete: (b: BookmarkEntry) => void;
  readerId: string | null;
  readerName: string | null;
  onLogin: () => void;
  onLogout: () => void;
}) {
  const [sidebarTab, setSidebarTab] = useState<"chapters" | "bookmarks">("chapters");
  const [sidebarSearch, setSidebarSearch] = useState("");

  // Normalize through partKey() so expansion state matches the grouping keys
  const rawActivePart = activeChapter
    ? chapters.find(c => c.globalNumber === activeChapter)?.part ?? null
    : null;
  const activePart = rawActivePart ? partKey(rawActivePart) : null;
  const [expandedParts, setExpandedParts] = useState<Set<string>>(
    activePart ? new Set([activePart]) : new Set()
  );

  useEffect(() => {
    if (activePart) {
      setExpandedParts(prev => {
        if (prev.size === 1 && prev.has(activePart)) return prev;
        return new Set([activePart]);
      });
    }
  }, [activePart]);

  // Scroll the sidebar to the current chapter when Contents opens (and when the
  // active chapter changes while open), so the reader lands on their place
  // instead of scrolling to find it. Ref is on the active chapter row below.
  const activeChapterRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!isOpen || sidebarTab !== "chapters") return;
    const t = setTimeout(() => {
      activeChapterRef.current?.scrollIntoView({ block: "center", behavior: "auto" });
    }, 90); // let the active part expand + render first
    return () => clearTimeout(t);
  }, [isOpen, sidebarTab, activeChapter]);

  const togglePart = (part: string) => {
    setExpandedParts(prev => {
      if (prev.has(part)) return new Set();
      return new Set([part]);
    });
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      <aside className={`
        fixed top-0 left-0 h-full w-[85vw] max-w-[18rem] sm:w-72 bg-white border-r border-stone-200 z-50
        transform transition-transform duration-300 ease-in-out overflow-y-auto
        lg:sticky lg:top-20 lg:h-[calc(100vh-5rem)] lg:z-0
        ${isOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        <div className="sticky top-0 bg-white border-b border-stone-100 z-10">
          <div className="px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-0.5">
              <button
                onClick={() => setSidebarTab("chapters")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${sidebarTab === "chapters" ? "bg-white text-orange-700 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}
              >
                <span className="flex items-center gap-1.5"><BookMarked className="w-3.5 h-3.5" /> Contents</span>
              </button>
              <button
                data-tab="bookmarks"
                onClick={() => setSidebarTab("bookmarks")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${sidebarTab === "bookmarks" ? "bg-white text-orange-700 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}
              >
                <span className="flex items-center gap-1.5">
                  <Bookmark className="w-3.5 h-3.5" /> Bookmarks
                  {bookmarks.length > 0 && <span className="bg-orange-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center">{bookmarks.length}</span>}
                </span>
              </button>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded" title="Minimize sidebar">
              <X className="w-4 h-4 text-stone-500" />
            </button>
          </div>
        </div>

        {sidebarTab === "bookmarks" ? (
          <div className="py-3">
            <BookmarkPanel
              bookmarks={bookmarks}
              onJump={onBookmarkJump}
              onDelete={onBookmarkDelete}
              isLoggedIn={!!readerId}
              onLogin={onLogin}
            />
          </div>
        ) : (
          <>
            <div className="px-3 py-2 border-b border-stone-100">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
                <input
                  type="text" placeholder="Search chapters..." value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-orange-200 focus:border-orange-300"
                />
                {sidebarSearch && (
                  <button onClick={() => setSidebarSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                    <X className="w-3 h-3 text-stone-400" />
                  </button>
                )}
              </div>
            </div>
            <nav className="py-2">
              {chapters.length === 0 ? (
                <p className="px-4 py-3 text-xs text-stone-400">No chapters available yet</p>
              ) : (
                (() => {
                  const filteredChapters = sidebarSearch.trim()
                    ? chapters.filter(ch =>
                        ch.title.toLowerCase().includes(sidebarSearch.toLowerCase()) ||
                        ch.part.toLowerCase().includes(sidebarSearch.toLowerCase()) ||
                        `chapter ${ch.number}`.includes(sidebarSearch.toLowerCase())
                      )
                    : chapters;

                  // Group chapters by normalized part key so "adi", "Adi-lila"
                  // etc. all land in the same bucket, preserve sensible order
                  const partGroups = new Map<string, ChapterEntry[]>();
                  for (const ch of filteredChapters) {
                    const key = partKey(ch.part);
                    if (!partGroups.has(key)) partGroups.set(key, []);
                    partGroups.get(key)!.push(ch);
                  }
                  const sortedEntries = Array.from(partGroups.entries())
                    .sort((a, b) => getPartOrder(a[0]) - getPartOrder(b[0]));

                  return sortedEntries.map(([part, chs]) => {
                    const isExpanded = sidebarSearch.trim() ? true : expandedParts.has(part);
                    const hasActiveChapter = chs.some(ch => ch.globalNumber === activeChapter);
                    const partInfo = PART_LABELS[partKey(part)] || { hi: part, en: part };
                    return (
                    <div key={part}>
                      <button
                        onClick={() => togglePart(part)}
                        className={`w-full px-3 py-2.5 flex items-center justify-between sticky top-0 z-[5] transition-all cursor-pointer group ${
                          hasActiveChapter
                            ? "bg-gradient-to-r from-orange-600 to-orange-500 shadow-md"
                            : "bg-white hover:bg-stone-50 border-b border-stone-100"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black shrink-0 ${
                            hasActiveChapter
                              ? "bg-white/25 text-white ring-2 ring-white/40"
                              : "bg-orange-100 text-orange-700"
                          }`} style={{ fontFamily: "var(--font-devanagari)" }}>
                            {partInfo.hi.split("-")[0].charAt(0) || part.charAt(0)}
                          </div>
                          <div className="min-w-0 text-left">
                            <p className={`text-sm font-bold truncate ${hasActiveChapter ? "text-white" : "text-stone-800"}`} style={{ fontFamily: "var(--font-devanagari)" }}>
                              {partInfo.hi}
                            </p>
                            <p className={`text-[11px] truncate ${hasActiveChapter ? "text-orange-100" : "text-stone-400"}`}>
                              {partInfo.en}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                            hasActiveChapter ? "bg-white/20 text-white" : "bg-stone-100 text-stone-500"
                          }`}>
                            {chs.length}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className={`w-4 h-4 ${hasActiveChapter ? "text-white/70" : "text-stone-400"}`} />
                          ) : (
                            <ChevronDown className={`w-4 h-4 ${hasActiveChapter ? "text-white/70" : "text-stone-400"}`} />
                          )}
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="pb-1">
                          {chs.map((ch) => {
                            const isActive = activeChapter === ch.globalNumber;
                            const shortTitle = ch.title.split("—")[0].trim();
                            const subtitle = ch.title.includes("—") ? ch.title.split("—").slice(1).join("—").trim() : "";
                            // Chaitanya OCR may still be in progress per chapter. Surface that status.
                            const status = ch.ocrStatus || "ready";
                            const statusBadge = status !== "ready"
                              ? (status === "processing" ? "Processing" : status === "queued" ? "Queued" : status === "failed" ? "Failed" : status)
                              : null;
                            return (
                              <button
                                key={ch.globalNumber}
                                ref={isActive ? activeChapterRef : null}
                                onClick={() => onChapterClick(ch)}
                                className={`w-full text-left px-4 py-2.5 flex items-start gap-3 transition-all hover:bg-orange-50/60 ${
                                  isActive ? "bg-orange-50 border-r-2 border-orange-500" : ""
                                }`}
                              >
                                <div className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center shrink-0 mt-0.5">
                                  <span className="text-xs font-bold text-stone-400">{ch.number}</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className={`text-sm font-semibold truncate ${isActive ? "text-orange-700" : "text-stone-700"}`} style={{ fontFamily: "var(--font-devanagari)" }}>
                                    {shortTitle}
                                  </p>
                                  {subtitle && (
                                    <p className="text-[11px] text-stone-400 truncate mt-0.5" style={{ fontFamily: "var(--font-devanagari)" }}>{subtitle}</p>
                                  )}
                                  {statusBadge && (
                                    <p className="text-[10px] text-amber-600 mt-0.5 font-semibold">{statusBadge}</p>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );});
                })()
              )}
            </nav>
          </>
        )}

        <div className="px-3 py-3 border-t border-stone-100 mt-2">
          {/* Sign out is a labelled button that asks first (ReaderAccountCard). */}
          <ReaderAccountCard readerId={readerId} readerName={readerName} onLogin={onLogin} onLogout={onLogout} />
        </div>

        <div className="px-4 py-4 border-t border-stone-100">
          <p className="text-[10px] text-stone-400 leading-relaxed" style={{ fontFamily: "var(--font-devanagari)" }}>
            श्रील प्रभुपाद द्वारा हिंदी अनुवाद एवं तात्पर्य — BBT
          </p>
          <a href="https://www.sarvam.ai" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 mt-2 text-[9px] text-stone-400 hover:text-stone-600 transition-colors">
            Powered by
            <img src="https://www.sarvam.ai/sarvam-logo.svg" alt="Sarvam AI" className="h-3 opacity-40" onError={(e) => { (e.target as HTMLImageElement).outerHTML = '<span class="font-semibold">Sarvam AI</span>'; }} />
          </a>
        </div>
      </aside>
    </>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────

export default function Chaitanya() {
  const isDevMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("dev");
  const [chapters, setChapters] = useState<ChapterEntry[]>([]);
  const [allPages, setAllPages] = useState<PageContent[]>([]);
  const [loading, setLoading] = useState(true);
  // True when the chapter index couldn't be fetched (or came back empty) —
  // renders an error state with a retry button instead of an endless spinner.
  const [indexError, setIndexError] = useState(false);
  // Map<globalNumber → page-index-in-allPages> so we can navigate by chapter.
  // Page numbers in chaitanya are per-chapter (each chapter is its own batch),
  // so we synthesize a contiguous reading sequence across chapter boundaries.
  const batchCacheRef = useRef<Map<number, PageContent[]>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");
  const [sectionOverrides, setSectionOverrides] = useState<PageOverrides>(loadSectionOverrides);
  const handleOverridesChange = useCallback((pageNum: number, newOverrides: SectionOverride[]) => {
    // Compute the next value first, then set state and persist OUTSIDE the
    // updater — React may defer/double-invoke updater functions, so they
    // must stay side-effect free.
    const next = { ...sectionOverrides };
    if (newOverrides.length === 0) { delete next[pageNum]; } else { next[pageNum] = newOverrides; }
    setSectionOverrides(next);
    saveSectionOverrides(next);
  }, [sectionOverrides]);
  // Per-line "un-bold" overrides: verse lines a maintainer chose to render at
  // normal weight (the "Remove bold" toolbar on a shlok). Device-local + reversible.
  const [unboldLines, setUnboldLines] = useState<Set<string>>(loadUnboldLines);
  const handleUnboldChange = useCallback((next: Set<string>) => {
    setUnboldLines(next);
    saveUnboldLines(next);
  }, []);
  // Approved reader-scene illustrations, shown inside the book above their passage.
  const [sceneArtByPage, setSceneArtByPage] = useState<Map<number, Array<{ id: number; key: string; image_url: string }>>>(new Map());
  useEffect(() => {
    (async () => {
      try {
        const res = await sbFetch(`reader_scenes?select=id,page_number,selected_text,image_url&book=eq.${BOOK_KEY}&approved=is.true&image_generated=is.true`);
        if (!res.ok) return;
        const rows = await res.json() as Array<{ id: number; page_number: number | null; selected_text: string; image_url: string }>;
        const m = new Map<number, Array<{ id: number; key: string; image_url: string }>>();
        for (const r of rows) {
          if (!r.page_number || !r.image_url || !r.image_url.startsWith(SCENE_ART_PREFIX)) continue;
          const list = m.get(r.page_number) || [];
          list.push({ id: r.id, key: sceneKeyOf(r.selected_text), image_url: r.image_url });
          m.set(r.page_number, list);
        }
        setSceneArtByPage(m);
      } catch { /* illustrations are optional — the book still reads fine */ }
    })();
  }, []);

  // ── Source editor (CodeMirror) — dev-gated per-page raw-text editing ──────────
  const [editSourcePage, setEditSourcePage] = useState<number | null>(null);
  const savePageSource = useCallback(async (pn: number, newText: string) => {
    setAllPages(prev => prev.map(p => (p.pageNumber === pn ? { ...p, text: newText } : p)));
    const res = await sbFetch(TBL_PAGE_EDITS, {
      method: "POST",
      headers: { Prefer: "return=representation,resolution=merge-duplicates" },
      body: JSON.stringify({ page_number: pn, text: newText, edited_at: new Date().toISOString(), applied_to_git: false }),
    });
    if (!res.ok) throw new Error(describeFailure(res.status, await res.text().catch(() => "")));
  }, []);
  const runAiFixSpan = useCallback(async ({ selectedText, contextBefore, contextAfter, pageNumber }: AiFixArgs): Promise<string | null> => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/bhagavatam-correct-text`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ selected_text: selectedText, context_before: contextBefore, context_after: contextAfter, page_number: pageNumber }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({} as { error?: string }));
      throw new Error(describeFailure(res.status, err));
    }
    const data = await res.json();
    return ((data?.suggested_text as string) || "").trim() || null;
  }, []);
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1024);
  const [activeChapter, setActiveChapter] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [lang, setLang] = useState<"hi" | "en">("hi");
  const [readerId, setReaderId] = useState<string | null>(() => (localStorage.getItem(`${BOOK_KEY}_reader_id`) || "").toLowerCase() || null);
  const [readerName, setReaderName] = useState<string | null>(() => localStorage.getItem(`${BOOK_KEY}_reader_name`));
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([]);
  const [showIdentityModal, setShowIdentityModal] = useState(false);
  const [bookmarkSaved, setBookmarkSaved] = useState(false);
  const [settings, setSettings] = useState<ReadingSettings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [scrollChapter, setScrollChapter] = useState<string | null>(null);
  const [visiblePageNum, setVisiblePageNum] = useState<number | null>(null);
  const [editingPageNum, setEditingPageNum] = useState(false);
  const [pageInputValue, setPageInputValue] = useState("");
  const pageInputRef = useRef<HTMLInputElement>(null);
  const [focusMode, setFocusMode] = useState(false);
  const PAGES_PER_VIEW = 20;
  const contentRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const pendingChapterRef = useRef<ChapterEntry | null>(null);

  const [summarizeModal, setSummarizeModal] = useState<{
    fromPage: number; toPage: number; summary: string; loading: boolean;
  } | null>(null);

  const handleSummarize = useCallback(async (from: number, to: number) => {
    if (from > to || from < 1) return;
    setSummarizeModal({ fromPage: from, toPage: to, summary: "", loading: true });

    // `from`/`to` are DISPLAY page numbers (per-chapter, restarting at 1).
    // allPages holds SYNTHESIZED numbers (batchNumber * 100000 + page), so
    // resolve the currently open chapter's batch prefix and compare against
    // prefix + from/to — otherwise the range never matches any page.
    const activeCh = activeChapter != null
      ? chapters.find(c => c.globalNumber === activeChapter)
      : undefined;
    const prefix = activeCh
      ? activeCh.batchNumber * 100000
      : Math.floor((visiblePageNum || allPages[0]?.pageNumber || 0) / 100000) * 100000;
    const pageTexts = allPages
      .filter(p => p.pageNumber >= prefix + from && p.pageNumber <= prefix + to)
      .map(p => p.text)
      .join("\n\n");

    if (!pageTexts.trim()) {
      setSummarizeModal(prev => prev ? { ...prev, summary: "No content found for this page range.", loading: false } : null);
      return;
    }

    // Client-side smart extraction — no server-side summarize endpoint exists
    // for chaitanya yet. The bhagwatham reader's server fallback was tied to
    // /api/bhagwatham/summarize; we degrade gracefully to client extraction.
    const lines = pageTexts.split("\n").map(l => l.trim()).filter(Boolean);
    const bullets: string[] = [];
    const chapterHeadings: string[] = [];
    const tatparyaLines: string[] = [];
    const anuvadLines: string[] = [];
    let inTatparya = false;
    let inAnuvad = false;

    for (const line of lines) {
      if (/^(अध्याय|Chapter)/iu.test(line) && line.length < 100) {
        chapterHeadings.push(line);
        inTatparya = false; inAnuvad = false;
        continue;
      }
      if (/^तात्पर्य/u.test(line)) { inTatparya = true; inAnuvad = false; continue; }
      if (/^अनुवाद/u.test(line)) { inAnuvad = true; inTatparya = false; continue; }
      if (/^(शब्दार्थ|श्लोक)/u.test(line)) { inTatparya = false; inAnuvad = false; continue; }

      if (inTatparya && line.length > 30) {
        tatparyaLines.push(line);
        if (tatparyaLines.length >= 15) inTatparya = false;
      }
      if (inAnuvad && line.length > 20) {
        anuvadLines.push(line);
        if (anuvadLines.length >= 10) inAnuvad = false;
      }
    }

    if (chapterHeadings.length > 0) bullets.push(`विषय: ${chapterHeadings.join(", ")}`);
    if (anuvadLines.length > 0) {
      bullets.push("अनुवाद सार:");
      const unique = [...new Set(anuvadLines)].slice(0, 3);
      unique.forEach(l => bullets.push(`  • ${l.length > 150 ? l.slice(0, 150) + "…" : l}`));
    }
    if (tatparyaLines.length > 0) {
      bullets.push("तात्पर्य के मुख्य बिंदु:");
      const unique = [...new Set(tatparyaLines)].slice(0, 5);
      unique.forEach(l => bullets.push(`  • ${l.length > 150 ? l.slice(0, 150) + "…" : l}`));
    }

    if (bullets.length === 0) {
      bullets.push("इन पृष्ठों से सारांश निकाला नहीं जा सका।");
    }

    setSummarizeModal(prev => prev ? { ...prev, summary: bullets.join("\n"), loading: false } : null);
  }, [allPages, chapters, activeChapter, visiblePageNum]);

  // Fetch chapter index from server. On failure (network error, non-JSON
  // response such as the SPA index.html on Vercel, or an empty list) stop the
  // loading spinner and surface a visible error state with a retry button.
  const fetchChapterIndex = useCallback(async () => {
    setIndexError(false);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/chapter-index`);
      const ct = res.headers.get("content-type") || "";
      if (!res.ok || !ct.includes("application/json")) {
        setIndexError(true);
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (!data.chapters?.length) {
        setIndexError(true);
        setLoading(false);
        return;
      }
      const entries: ChapterEntry[] = data.chapters.map((c: any) => ({
        globalNumber: c.globalNumber,
        part: c.part,
        number: c.number,
        title: c.title,
        pageNumber: c.pageNumber ?? 1,
        batchNumber: c.batchNumber ?? c.globalNumber,
        ocrStatus: c.ocrStatus,
      }));
      // Sort: by part order, then by chapter-number within the part.
      entries.sort((a, b) => {
        const pa = getPartOrder(a.part);
        const pb = getPartOrder(b.part);
        if (pa !== pb) return pa - pb;
        return a.number - b.number;
      });
      setChapters(entries);
    } catch (err) {
      console.warn("[chaitanya] chapter-index fetch failed:", err);
      setIndexError(true);
      setLoading(false);
    }
  }, []);

  // Fetch a single batch (= one chapter's pages). Synthesize globally-unique
  // page numbers: prefix each batch's pages with `globalNumber * 100000` so
  // they never collide with another chapter's pages. The original per-chapter
  // page number (`p.pageNumber`) is retained as `originalPageNumber` for
  // display in the top bar.
  const fetchBatch = useCallback(async (globalNumber: number): Promise<PageContent[]> => {
    if (batchCacheRef.current.has(globalNumber)) {
      return batchCacheRef.current.get(globalNumber)!;
    }
    try {
      const res = await fetch(`${API_BASE}/batch/${globalNumber}`);
      // On Vercel a MISSING static file returns the SPA index.html with HTTP
      // 200 — require a JSON content-type before parsing or json() throws.
      const ct = res.headers.get("content-type") || "";
      if (!res.ok || !ct.includes("application/json")) return [];
      const batch: BatchData = await res.json();
      const pages = (batch.pages || [])
        .filter((p: PageContent) => !isGarbagePage(p.text))
        .map((p: PageContent) => ({
          ...p,
          // Synthesize unique global page number so different chapters don't
          // collide on page 1, page 2, etc.
          pageNumber: globalNumber * 100000 + (p.pageNumber || 0),
        }));
      batchCacheRef.current.set(globalNumber, pages);
      return pages;
    } catch (err) {
      console.warn(`[chaitanya] batch/${globalNumber} fetch failed:`, err);
      return [];
    }
  }, []);

  // Load page edits from Supabase and apply over the in-memory text.
  const applyPageEdits = useCallback(async (pages: PageContent[]): Promise<PageContent[]> => {
    try {
      const editRes = await sbFetch(`${TBL_PAGE_EDITS}?select=page_number,text,text_en`);
      if (!editRes.ok) return pages;
      const rows: Array<{ page_number: number; text?: string; text_en?: string }> = await editRes.json();
      if (rows.length === 0) return pages;
      const editsByPage = new Map<number, { text?: string; textEn?: string }>();
      for (const r of rows) {
        editsByPage.set(r.page_number, { text: r.text || undefined, textEn: r.text_en || undefined });
      }
      return pages.map(p => {
        const e = editsByPage.get(p.pageNumber);
        if (!e) return p;
        return { ...p, text: e.text ?? p.text, textEn: e.textEn ?? p.textEn };
      });
    } catch {
      return pages;
    }
  }, []);

  // Load all ready chapter batches up-front (chaitanya is far smaller than
  // bhagwatham — ~17 chapters in Adi-lila vs 12,000 pages of bhagavatam).
  const fetchAllContent = useCallback(async (chs: ChapterEntry[]) => {
    setLoading(true);
    try {
      // Only fetch batches whose OCR is ready. Queued/processing chapters
      // simply won't appear in the reading flow yet.
      const ready = chs.filter(c => !c.ocrStatus || c.ocrStatus === "ready");
      const results = await Promise.all(ready.map(c => fetchBatch(c.batchNumber)));
      const merged: PageContent[] = [];
      ready.forEach((c, i) => {
        for (const p of results[i]) merged.push(p);
      });
      // Sort pages so they read part → chapter → page within chapter.
      merged.sort((a, b) => a.pageNumber - b.pageNumber);
      const withEdits = await applyPageEdits(merged);
      setAllPages(withEdits);

      // If a chapter was clicked before content loaded, navigate now.
      if (pendingChapterRef.current) {
        const ch = pendingChapterRef.current;
        pendingChapterRef.current = null;
        navigateToChapter(ch, withEdits);
      }
    } finally {
      setLoading(false);
    }
  }, [fetchBatch, applyPageEdits]);

  // Compute the first page-number for a chapter inside `pages`.
  const findChapterFirstPageNum = (ch: ChapterEntry, pages: PageContent[]): number | null => {
    // We synthesized page numbers as `batchNumber * 100000 + originalPage`.
    const prefix = ch.batchNumber * 100000;
    const first = pages.find(p => p.pageNumber >= prefix && p.pageNumber < prefix + 100000);
    return first?.pageNumber ?? null;
  };

  const navigateToChapter = useCallback((ch: ChapterEntry, pagesArg?: PageContent[]) => {
    const pages = pagesArg || allPages;
    const firstNum = findChapterFirstPageNum(ch, pages);
    if (firstNum == null) {
      // Content for this chapter isn't loaded yet — likely still in OCR
      // queue. Surface this to the user.
      if (ch.ocrStatus && ch.ocrStatus !== "ready") {
        alert(`Chapter "${ch.title}" is still being processed (status: ${ch.ocrStatus}). Please check back later.`);
      } else {
        // Chapter claims to be ready but yielded zero pages (e.g. its batch
        // file is missing on the server) — tell the user instead of a no-op.
        alert("यह अध्याय अभी उपलब्ध नहीं है — कृपया बाद में देखें");
      }
      return;
    }
    const pageIdx = pages.findIndex(p => p.pageNumber === firstNum);
    if (pageIdx < 0) return;
    const viewPage = Math.floor(pageIdx / PAGES_PER_VIEW) + 1;
    setCurrentPage(viewPage);
    requestAnimationFrame(() => {
      setTimeout(() => {
        const el = document.getElementById(`chapter-${ch.globalNumber}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        else {
          const pageEl = document.querySelector(`[data-page-num="${firstNum}"]`);
          if (pageEl) pageEl.scrollIntoView({ behavior: "smooth", block: "start" });
          else window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }, 120);
    });
  }, [allPages]);

  // ── Bookmark functions ──────────────────────────────────────────────────
  const fetchBookmarks = useCallback(async (rid?: string) => {
    const id = rid || readerId;
    if (!id) return;
    try {
      const res = await sbFetch(`${TBL_BOOKMARKS}?reader_id=eq.${encodeURIComponent(id)}&order=created_at.desc`);
      const data: BookmarkEntry[] = await res.json();
      setBookmarks(Array.isArray(data) ? data : []);
    } catch { /* */ }
  }, [readerId]);

  const saveBookmark = useCallback(async () => {
    if (!readerId) { setShowIdentityModal(true); return; }

    const pageNum = visiblePageNum || allPages[(currentPage - 1) * PAGES_PER_VIEW]?.pageNumber;
    if (!pageNum) return;

    const currentChapter = chapters.slice().reverse().find(ch => {
      const prefix = ch.batchNumber * 100000;
      return pageNum >= prefix && pageNum < prefix + 100000;
    });

    let lineAnchor: string | null = null;
    try {
      const pageEl = document.querySelector(`[data-page-num="${pageNum}"]`);
      if (pageEl) {
        const topP = findTopmostVisibleParagraph(pageEl as HTMLElement);
        const text = topP?.textContent?.trim() || "";
        lineAnchor = text.substring(0, 80) || null;
      }
    } catch { /* */ }

    try {
      const res = await sbFetch(bookmarkUpsertPath(TBL_BOOKMARKS), {
        method: "POST",
        headers: { Prefer: BOOKMARK_UPSERT_PREFER },
        body: JSON.stringify({
          reader_id: readerId,
          reader_name: readerName,
          page_number: pageNum,
          chapter_number: currentChapter?.number || null,
          chapter_title: currentChapter?.title || null,
          line_anchor: lineAnchor,
          updated_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        alert("Bookmark could not be saved — please try again.");
        return;
      }
      await fetchBookmarks();
      setBookmarkSaved(true);
      setTimeout(() => setBookmarkSaved(false), 2000);
    } catch {
      alert("Bookmark could not be saved — please try again.");
    }
  }, [readerId, readerName, allPages, currentPage, visiblePageNum, chapters, fetchBookmarks]);

  // Latest-saveBookmark ref so the global "B" keydown listener (bound once
  // per page-change) always calls the fresh closure without re-binding.
  const saveBookmarkRef = useRef(saveBookmark);
  saveBookmarkRef.current = saveBookmark;

  const deleteBookmark = useCallback(async (b: BookmarkEntry) => {
    if (!readerId) return;
    try {
      const res = await sbFetch(`${TBL_BOOKMARKS}?id=eq.${b.id}&reader_id=eq.${encodeURIComponent(readerId)}`, { method: "DELETE" });
      if (!res.ok) {
        alert("Bookmark could not be deleted — please try again.");
        return;
      }
      setBookmarks(prev => prev.filter(x => x.id !== b.id));
    } catch {
      alert("Bookmark could not be deleted — please try again.");
    }
  }, [readerId]);

  const handleBookmarkJump = useCallback((b: BookmarkEntry) => {
    setSearchQuery("");
    const pageIdx = allPages.findIndex(p => p.pageNumber === b.page_number);
    if (pageIdx >= 0) {
      const viewPage = Math.floor(pageIdx / PAGES_PER_VIEW) + 1;
      setCurrentPage(viewPage);
      const ch = chapters.slice().reverse().find(c => {
        const prefix = c.batchNumber * 100000;
        return b.page_number >= prefix && b.page_number < prefix + 100000;
      });
      if (ch) {
        setActiveChapter(ch.globalNumber);
        setScrollChapter(ch.title);
      }
      setTimeout(() => {
        const pageEl = document.querySelector(`[data-page-num="${b.page_number}"]`);
        if (!pageEl) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }

        if (b.line_anchor && b.line_anchor.length > 4) {
          const needle = b.line_anchor.trim().substring(0, 60);
          const ps = pageEl.querySelectorAll("p");
          let match: HTMLParagraphElement | null = null;
          for (const p of ps) {
            const txt = (p as HTMLElement).textContent?.trim() || "";
            if (txt.startsWith(needle.substring(0, 30)) || txt.includes(needle.substring(0, 40))) {
              match = p as HTMLParagraphElement;
              break;
            }
          }
          if (match) {
            match.scrollIntoView({ behavior: "smooth", block: "start" });
            match.style.transition = "background-color 0.4s";
            const prevBg = match.style.backgroundColor;
            match.style.backgroundColor = "rgba(251, 191, 36, 0.35)";
            setTimeout(() => { if (match) match.style.backgroundColor = prevBg; }, 1500);
            return;
          }
        }
        pageEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 250);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPages, chapters]);

  const handleIdentitySave = useCallback((id: string, name: string) => {
    localStorage.setItem(`${BOOK_KEY}_reader_id`, id);
    if (name) localStorage.setItem(`${BOOK_KEY}_reader_name`, name);
    setReaderId(id);
    setReaderName(name || null);
    setShowIdentityModal(false);
    fetchBookmarks(id);
  }, [fetchBookmarks]);

  // Initial load: chapter index, then content, then bookmarks (if signed in).
  useEffect(() => {
    (async () => {
      await fetchChapterIndex();
    })();
  }, [fetchChapterIndex]);

  useEffect(() => {
    if (chapters.length === 0) return;
    void fetchAllContent(chapters);
  }, [chapters, fetchAllContent]);

  useEffect(() => {
    if (readerId) fetchBookmarks();
  }, [readerId, fetchBookmarks]);

  const totalViewPages = Math.max(1, Math.ceil(allPages.length / PAGES_PER_VIEW));
  const startIdx = (currentPage - 1) * PAGES_PER_VIEW;
  const visiblePages = allPages.slice(startIdx, startIdx + PAGES_PER_VIEW);

  const displayPages = searchQuery.trim()
    ? allPages.filter((p) => {
        const q = searchQuery.toLowerCase();
        if (lang === "en" && p.textEn) return p.textEn.toLowerCase().includes(q);
        return p.text.toLowerCase().includes(q) || (p.textEn?.toLowerCase().includes(q));
      })
    : visiblePages;

  const goToPage = (page: number) => {
    setCurrentPage(page);
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Convert displayed (original) page number back to a synthesized one when
  // the user types into the page-number input box. Per-chapter numbering
  // restarts at 1, so search WITHIN the active chapter first — a global
  // `% 100000` scan would always land in the first chapter. Fall back to the
  // global scan only when the active chapter has no such page.
  const goToOriginalPageNum = (pageNum: number) => {
    const activeCh = activeChapter != null
      ? chapters.find(c => c.globalNumber === activeChapter)
      : undefined;
    const prefix = activeCh
      ? activeCh.batchNumber * 100000
      : Math.floor((visiblePageNum || allPages[0]?.pageNumber || 0) / 100000) * 100000;
    let matchIdx = allPages.findIndex(
      p => p.pageNumber >= prefix + pageNum && p.pageNumber < prefix + 100000,
    );
    if (matchIdx < 0) {
      matchIdx = allPages.findIndex(p => (p.pageNumber % 100000) >= pageNum);
    }
    if (matchIdx >= 0) {
      const viewPage = Math.floor(matchIdx / PAGES_PER_VIEW) + 1;
      setCurrentPage(viewPage);
      setTimeout(() => {
        const el = document.querySelector(`[data-page-num="${allPages[matchIdx].pageNumber}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        else window.scrollTo({ top: 0, behavior: "smooth" });
      }, 200);
    }
  };

  const handleChapterClick = (ch: ChapterEntry) => {
    setSearchQuery("");
    setActiveChapter(ch.globalNumber);
    if (allPages.length === 0) {
      pendingChapterRef.current = ch;
      return;
    }
    navigateToChapter(ch);
  };

  // Find next/prev chapter for the "next chapter / prev chapter" navigation.
  const currentChapterEntry = useMemo(() => {
    if (activeChapter == null) return null;
    return chapters.find(c => c.globalNumber === activeChapter) || null;
  }, [activeChapter, chapters]);

  const goToAdjacentChapter = (direction: "prev" | "next") => {
    if (!currentChapterEntry) return;
    const idx = chapters.findIndex(c => c.globalNumber === currentChapterEntry.globalNumber);
    if (idx < 0) return;
    const targetIdx = direction === "next" ? idx + 1 : idx - 1;
    if (targetIdx < 0 || targetIdx >= chapters.length) return;
    handleChapterClick(chapters[targetIdx]);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          if (currentPage > 1) goToPage(currentPage - 1);
          break;
        case "ArrowRight":
          e.preventDefault();
          if (currentPage < totalViewPages) goToPage(currentPage + 1);
          break;
        case "/":
          e.preventDefault();
          searchRef.current?.focus();
          break;
        case "Escape":
          setSidebarOpen(false);
          setShowSettings(false);
          setSearchQuery("");
          (document.activeElement as HTMLElement)?.blur();
          break;
        case "f":
          if (!e.ctrlKey && !e.metaKey) setFocusMode(prev => !prev);
          break;
        case "b":
          // Call through the ref — saveBookmark captured directly here would
          // be stale (this effect's deps intentionally exclude it).
          if (!e.ctrlKey && !e.metaKey) saveBookmarkRef.current();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentPage, totalViewPages]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll chapter tracking
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            const num = parseInt(id.replace("chapter-", ""), 10);
            const ch = chapters.find(c => c.globalNumber === num);
            if (ch) {
              setScrollChapter(ch.title);
              setActiveChapter(ch.globalNumber);
            }
          }
        }
      },
      { rootMargin: "-100px 0px -60% 0px" }
    );
    const headings = document.querySelectorAll("[id^='chapter-']");
    headings.forEach(h => observer.observe(h));
    return () => observer.disconnect();
  }, [displayPages, chapters]);

  // Scroll page tracking
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        let latestNum = 0;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const num = parseInt(entry.target.getAttribute("data-page-num") || "0", 10);
            if (num > latestNum) latestNum = num;
          }
        }
        if (latestNum > 0) setVisiblePageNum(latestNum);
      },
      { rootMargin: "-80px 0px -30% 0px" }
    );
    const pageEls = document.querySelectorAll("[data-page-num]");
    pageEls.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [displayPages]);

  const theme = THEME_STYLES[settings.theme];

  // Display page number: strip the batch-prefix so the reader sees the original
  // per-chapter page number, not the synthesized global one.
  const displayPageNum = (synth: number): number => synth % 100000;

  const firstPageNum = visiblePages[0]?.pageNumber ?? (displayPages[0]?.pageNumber ?? 0);
  const currentVisiblePage = visiblePageNum || firstPageNum;
  const currentDisplayPage = displayPageNum(currentVisiblePage);

  // Build the chapter title bar string:
  //   "श्री चैतन्य चरितामृत — {part-hi} — अध्याय {n}"
  const titleBarText = useMemo(() => {
    if (!currentChapterEntry) return "श्री चैतन्य चरितामृत";
    return `श्री चैतन्य चरितामृत — ${partLabelHi(currentChapterEntry.part)} — अध्याय ${currentChapterEntry.number}`;
  }, [currentChapterEntry]);

  return (
    <Layout>
      <SEOHead
        title="श्री चैतन्य चरितामृत — Chaitanya Charitamrit"
        description="श्री चैतन्य चरितामृत — श्रील कृष्णदास कविराज गोस्वामी द्वारा रचित, श्रील प्रभुपाद द्वारा हिंदी अनुवाद एवं तात्पर्य सहित।"
        structuredData={{
          "@context": "https://schema.org", "@type": "Book",
          name: "श्री चैतन्य चरितामृत", alternateName: "Chaitanya Charitamrit",
          inLanguage: "hi",
        }}
      />

      {showIdentityModal && (
        <ReaderIdentityModal
          onSave={handleIdentitySave}
          onClose={() => setShowIdentityModal(false)}
        />
      )}

      <div className="flex min-h-screen">
        <Sidebar
          chapters={chapters}
          activeChapter={activeChapter}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onChapterClick={handleChapterClick}
          bookmarks={bookmarks}
          onBookmarkJump={handleBookmarkJump}
          onBookmarkDelete={deleteBookmark}
          readerId={readerId}
          readerName={readerName}
          onLogin={() => setShowIdentityModal(true)}
          onLogout={() => {
            localStorage.removeItem(`${BOOK_KEY}_reader_id`);
            localStorage.removeItem(`${BOOK_KEY}_reader_name`);
            setReaderId(null);
            setReaderName(null);
            setBookmarks([]);
          }}
        />

        <main ref={contentRef} className={`flex-1 min-w-0 ${theme.bg} transition-colors duration-300`}>
          <VoiceEditToolbar book={{ key: BOOK_KEY, pageEditsTable: TBL_PAGE_EDITS }} allPages={allPages} setAllPages={setAllPages} unboldLines={unboldLines} onUnboldChange={handleUnboldChange} />
          {/* Source editor (CodeMirror) — dev-gated full-screen raw-text editor */}
          {editSourcePage != null && (() => {
            const pg = allPages.find(p => p.pageNumber === editSourcePage);
            if (!pg) return null;
            const prevPn = allPages.some(p => p.pageNumber === editSourcePage - 1) ? editSourcePage - 1 : undefined;
            const nextPn = allPages.some(p => p.pageNumber === editSourcePage + 1) ? editSourcePage + 1 : undefined;
            return (
              <React.Suspense fallback={<div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/90 dark:bg-stone-900/90"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>}>
                <SourceEditor
                  key={editSourcePage}
                  pageNumber={editSourcePage}
                  initialText={pg.text}
                  dark={settings.theme === "dark"}
                  renderPreview={(t) => (
                    <RenderContent text={t} lang={lang} themeKey={settings.theme} pageNumber={editSourcePage ?? undefined} unboldLines={unboldLines} />
                  )}
                  onSave={savePageSource}
                  requestAiFix={runAiFixSpan}
                  onClose={() => setEditSourcePage(null)}
                  prevPageNumber={prevPn}
                  nextPageNumber={nextPn}
                  onNavigate={setEditSourcePage}
                />
              </React.Suspense>
            );
          })()}

          {/* Top bar */}
          <div className={`sticky top-14 z-30 ${theme.surface} backdrop-blur-sm border-b ${theme.border} px-2 sm:px-4 md:px-6 py-1.5 sm:py-2`}>
            <div className="max-w-3xl mx-auto flex items-center gap-1.5 sm:gap-2 md:gap-3">
              {!focusMode && (
                <button
                  onClick={() => { setSidebarOpen(true); }}
                  className={`lg:hidden p-2 hover:bg-stone-100 rounded-lg transition-colors`}
                  aria-label="Open contents"
                >
                  <List className={`w-5 h-5 ${theme.muted}`} />
                </button>
              )}

              <div className={`flex items-center gap-1 sm:gap-2 text-[11px] sm:text-xs ${theme.muted} min-w-0`}>
                <BookOpen className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 hidden sm:block" />
                {editingPageNum ? (
                  <form className="flex items-center gap-1 whitespace-nowrap" onSubmit={(e) => {
                    e.preventDefault();
                    const num = parseInt(pageInputValue, 10);
                    if (num > 0) goToOriginalPageNum(num);
                    setEditingPageNum(false);
                  }}>
                    <span>Pg.</span>
                    <input
                      ref={pageInputRef}
                      type="number" min={1}
                      value={pageInputValue}
                      onChange={(e) => setPageInputValue(e.target.value)}
                      onBlur={() => setEditingPageNum(false)}
                      onKeyDown={(e) => { if (e.key === "Escape") setEditingPageNum(false); }}
                      className="w-14 px-1 py-0.5 bg-white border border-orange-300 rounded text-xs text-stone-700 text-center focus:outline-none focus:ring-1 focus:ring-orange-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      autoFocus
                    />
                  </form>
                ) : scrollChapter ? (
                  <>
                    <span className="text-orange-600 font-bold shrink-0" style={{ fontFamily: "var(--font-devanagari)" }}>{currentChapterEntry ? partLabelHi(currentChapterEntry.part) : ""}</span>
                    <span className="truncate font-semibold" style={{ fontFamily: "var(--font-devanagari)" }}>{scrollChapter?.split("—")[0].trim()}</span>
                    {scrollChapter?.includes("—") && (
                      <span className={`truncate ${theme.muted} hidden sm:inline`} style={{ fontFamily: "var(--font-devanagari)" }}>— {scrollChapter.split("—").slice(1).join("—").trim()}</span>
                    )}
                    <span
                      className="whitespace-nowrap cursor-pointer hover:text-orange-600 transition-colors shrink-0"
                      onClick={() => { setPageInputValue(String(currentDisplayPage)); setEditingPageNum(true); setTimeout(() => pageInputRef.current?.select(), 50); }}
                      title="Type page number"
                    >Pg. {currentDisplayPage}</span>
                  </>
                ) : allPages.length > 0 && !searchQuery ? (
                  <span
                    className="whitespace-nowrap cursor-pointer hover:text-orange-600 transition-colors"
                    onClick={() => { setPageInputValue(String(currentDisplayPage)); setEditingPageNum(true); setTimeout(() => pageInputRef.current?.select(), 50); }}
                    title="Type page number"
                  >
                    Pg. {currentDisplayPage}
                  </span>
                ) : searchQuery ? (
                  <span>{displayPages.length} results</span>
                ) : (
                  <span>Loading...</span>
                )}
              </div>

              <div className="relative flex-1 min-w-0 max-w-[8rem] sm:max-w-xs ml-auto">
                <Search className="absolute left-2 sm:left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 sm:w-3.5 sm:h-3.5 text-stone-400" />
                <input
                  ref={searchRef}
                  type="text" placeholder="Search..." value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-7 sm:pl-8 pr-3 py-1 sm:py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-[11px] sm:text-xs text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-orange-200 focus:border-orange-300 transition-all"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                    <X className="w-3 h-3 text-stone-400" />
                  </button>
                )}
              </div>

              <button
                onClick={() => setLang(lang === "hi" ? "en" : "hi")}
                className="px-1.5 sm:px-2 py-1 sm:py-1.5 bg-stone-100 border border-stone-200 rounded-lg text-[11px] sm:text-xs font-semibold text-stone-700 hover:bg-stone-200 transition-all active:scale-95 shrink-0"
                title={lang === "hi" ? "Switch to English" : "हिंदी में पढ़ें"}
              >
                {lang === "hi" ? "हि" : "EN"}
              </button>

              <button
                onClick={saveBookmark}
                className={`relative p-1 sm:p-1.5 rounded-lg transition-all active:scale-95 shrink-0 ${
                  bookmarkSaved ? "bg-orange-100 text-orange-600" : `hover:bg-stone-100 ${theme.muted} hover:text-orange-600`
                }`}
                title="Bookmark (B)"
              >
                <Bookmark className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${bookmarkSaved ? "fill-orange-500" : ""}`} />
              </button>
              {bookmarks.length > 0 && (
                <button
                  onClick={() => { setSidebarOpen(true); setTimeout(() => { const el = document.querySelector('[data-tab="bookmarks"]') as HTMLElement; el?.click(); }, 100); }}
                  className={`relative p-1 sm:p-1.5 rounded-lg transition-all active:scale-95 hover:bg-stone-100 ${theme.muted} hover:text-orange-600 hidden sm:block shrink-0`}
                  title="View bookmarks"
                >
                  <List className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">{bookmarks.length}</span>
                </button>
              )}

              <button
                onClick={() => setSummarizeModal({ fromPage: currentDisplayPage || 1, toPage: (currentDisplayPage || 1) + 9, summary: "", loading: false })}
                className={`p-1 sm:p-1.5 rounded-lg transition-all active:scale-95 shrink-0 hover:bg-stone-100 ${theme.muted} hover:text-orange-600`}
                title="Summarize Pages"
              >
                <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>

              <div className="relative shrink-0">
                <button
                  data-settings-toggle="reading"
                  onClick={() => setShowSettings(!showSettings)}
                  className={`p-1 sm:p-1.5 rounded-lg transition-all ${showSettings ? "bg-orange-100 text-orange-600" : `hover:bg-stone-100 ${theme.muted}`}`}
                  title="Reading Settings"
                >
                  <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
                <AnimatePresence>
                  {showSettings && <ReadingSettingsPanel settings={settings} onChange={setSettings} onClose={() => setShowSettings(false)} />}
                </AnimatePresence>
              </div>

              <button
                onClick={() => setFocusMode(!focusMode)}
                className={`hidden md:block p-1.5 rounded-lg transition-all shrink-0 ${focusMode ? "bg-orange-100 text-orange-600" : `hover:bg-stone-100 ${theme.muted}`}`}
                title="Focus Mode (F)"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Chapter title bar — "श्री चैतन्य चरितामृत — {part} — अध्याय {n}" */}
          {currentChapterEntry && (
            <div className={`max-w-3xl mx-auto px-4 sm:px-6 pt-3 ${theme.muted} text-[11px] font-semibold tracking-wide`} style={{ fontFamily: "var(--font-devanagari)" }}>
              {titleBarText}
            </div>
          )}

          {/* English not-available notice */}
          {lang === "en" && allPages.length > 0 && !allPages.some((p) => p.textEn) && (
            <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-4">
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-start gap-2.5">
                <Languages className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-amber-700">English translation not yet available</p>
                  <p className="text-[11px] text-amber-600 mt-0.5">
                    Pages processed before Sarvam AI was enabled don't have English translations. Showing Hindi text as fallback.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div
            className="mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 [overflow-wrap:break-word] [word-break:break-word] overflow-x-clip"
            style={{ maxWidth: settings.maxWidth, fontSize: `clamp(13px, ${settings.fontSize}px, ${settings.fontSize}px)`, lineHeight: settings.lineHeight }}
          >
            {indexError ? (
              <div className={`flex flex-col items-center justify-center py-24 ${theme.muted}`}>
                <div className="w-16 h-16 mb-5 bg-orange-100 rounded-2xl flex items-center justify-center">
                  <BookOpen className="w-8 h-8 text-orange-400" />
                </div>
                <p className={`text-sm font-semibold ${theme.text} mb-4 text-center`} style={{ fontFamily: "var(--font-devanagari)" }}>
                  अध्याय सूची लोड नहीं हो पाई — पुनः प्रयास करें
                </p>
                <button
                  onClick={() => { void fetchChapterIndex(); }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> पुनः प्रयास करें
                </button>
              </div>
            ) : loading ? (
              <div className={`flex flex-col items-center justify-center py-24 ${theme.muted}`}>
                <Loader2 className="w-8 h-8 animate-spin mb-4" />
                <p className="text-sm">Loading...</p>
              </div>
            ) : displayPages.length === 0 ? (
              <div className={`flex flex-col items-center justify-center py-24 ${theme.muted}`}>
                <motion.div variants={fadeInUp} initial="hidden" animate="visible" className="text-center">
                  <div className="w-16 h-16 mx-auto mb-5 bg-orange-100 rounded-2xl flex items-center justify-center">
                    <BookOpen className="w-8 h-8 text-orange-400" />
                  </div>
                  <h3 className={`font-serif text-xl font-bold ${theme.text} mb-2`}>
                    {searchQuery ? "No results found" : "No pages ready yet"}
                  </h3>
                  <p className={`${theme.muted} text-sm max-w-sm mx-auto mb-5`}>
                    {searchQuery ? "Try different keywords." : "Chapters are being processed. Please check back soon."}
                  </p>
                </motion.div>
              </div>
            ) : (
              <div className="flex items-start">
                <StepScrollIndicator themeKey={settings.theme} />
                <div className="flex-1 min-w-0">
                  {displayPages.map((page, pageIdx) => {
                    let prevPage = pageIdx > 0 ? displayPages[pageIdx - 1] : null;
                    if (!prevPage && !searchQuery.trim()) {
                      const allIdx = allPages.findIndex(p => p.pageNumber === page.pageNumber);
                      if (allIdx > 0) prevPage = allPages[allIdx - 1];
                    }
                    const prevEndKind = prevPage ? getPageEndKind(prevPage.text, page.text) : undefined;
                    let nextPage = pageIdx < displayPages.length - 1 ? displayPages[pageIdx + 1] : null;
                    if (!nextPage && !searchQuery.trim()) {
                      const allIdx = allPages.findIndex(p => p.pageNumber === page.pageNumber);
                      if (allIdx >= 0 && allIdx < allPages.length - 1) nextPage = allPages[allIdx + 1];
                    }
                    const nextPageStartsNumberedShlok = nextPage ? pageStartsWithNumberedShlokContinuation(nextPage.text) : false;
                    const nextPageVerseHeadLines = nextPage ? numberedVerseHeadLength(pageLines(nextPage.text)) : 0;
                    const hidePageDivider = prevEndKind === "shlok" || prevEndKind === "ref-shlok";

                    // First page of a chapter? Inject a chapter anchor so the
                    // intersection observer + handleChapterClick can navigate.
                    const ch = chapters.find(c => {
                      const prefix = c.batchNumber * 100000;
                      return page.pageNumber >= prefix && page.pageNumber < prefix + 100000;
                    });
                    const isFirstPageOfChapter = ch
                      ? findChapterFirstPageNum(ch, allPages) === page.pageNumber
                      : false;

                    return (
                      <div key={page.pageNumber} data-page-num={page.pageNumber}>
                        {isDevMode && (
                          <div className="flex justify-end">
                            <button
                              onClick={() => setEditSourcePage(page.pageNumber)}
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-stone-400 hover:text-orange-600 px-2 py-0.5 rounded transition-colors"
                              title="Edit this page's raw source in the CodeMirror editor"
                            >
                              <Pencil className="w-3 h-3" /> Edit source
                            </button>
                          </div>
                        )}
                        {isFirstPageOfChapter && ch && (
                          <div id={`chapter-${ch.globalNumber}`} className="mt-6 mb-4 scroll-mt-20">
                            <p className={`text-[11px] uppercase tracking-widest ${theme.muted} font-semibold mb-1`}>
                              {partLabelHi(ch.part)}
                            </p>
                            <h2 className={`text-xl sm:text-2xl font-bold ${theme.text} mb-3 pb-2 border-b-2 border-orange-300/50`} style={{ fontFamily: "var(--font-devanagari)" }}>
                              {ch.title}
                            </h2>
                          </div>
                        )}
                        {pageIdx > 0 && !hidePageDivider && !isFirstPageOfChapter && settings.showPageNumbers && (
                          <div className={`flex items-center gap-3 my-8 sm:my-10 ${theme.muted}`}>
                            <div className={`flex-1 h-px ${settings.theme === "dark" ? "bg-white/10" : settings.theme === "sepia" ? "bg-amber-300/40" : "bg-orange-200/60"}`} />
                            <span className="text-[10px] font-medium opacity-50 shrink-0 px-2">· {displayPageNum(page.pageNumber)} ·</span>
                            <div className={`flex-1 h-px ${settings.theme === "dark" ? "bg-white/10" : settings.theme === "sepia" ? "bg-amber-300/40" : "bg-orange-200/60"}`} />
                          </div>
                        )}
                        {pageIdx > 0 && hidePageDivider && !isFirstPageOfChapter && settings.showPageNumbers && (
                          <p className={`text-[10px] ${theme.muted} font-medium text-right mt-1 mb-1 opacity-40`}>· {displayPageNum(page.pageNumber)} ·</p>
                        )}
                        {pageIdx === 0 && !isFirstPageOfChapter && settings.showPageNumbers && <p className={`text-[10px] ${theme.muted} font-medium text-right mt-0 mb-2 opacity-40`}>· {displayPageNum(page.pageNumber)} ·</p>}
                        <RenderContent
                          text={page.text}
                          textEn={page.textEn}
                          lang={lang}
                          themeKey={settings.theme}
                          pageNumber={page.pageNumber}
                          overrides={sectionOverrides[page.pageNumber]}
                          onOverridesChange={isDevMode ? handleOverridesChange : undefined}
                          prevPageEndKind={prevEndKind}
                          nextPageStartsNumberedShlok={nextPageStartsNumberedShlok}
                          nextPageVerseHeadLines={nextPageVerseHeadLines}
                          unboldLines={unboldLines}
                          sceneArt={sceneArtByPage.get(page.pageNumber)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Prev / Next chapter navigation */}
            {!searchQuery && currentChapterEntry && (
              <div className={`flex items-center justify-between gap-3 mt-10 mb-2 pt-6 border-t ${theme.border}`}>
                <button
                  onClick={() => goToAdjacentChapter("prev")}
                  disabled={chapters[0]?.globalNumber === currentChapterEntry.globalNumber}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 ${theme.surface} border ${theme.border} rounded-lg text-xs font-semibold ${theme.text} hover:border-orange-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed`}
                  title="Previous chapter"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> पिछला अध्याय
                </button>
                <button
                  onClick={() => goToAdjacentChapter("next")}
                  disabled={chapters[chapters.length - 1]?.globalNumber === currentChapterEntry.globalNumber}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 ${theme.surface} border ${theme.border} rounded-lg text-xs font-semibold ${theme.text} hover:border-orange-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed`}
                  title="Next chapter"
                >
                  अगला अध्याय <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Pagination */}
            {!searchQuery && totalViewPages > 1 && (
              <div className={`flex items-center justify-center gap-2 mt-6 mb-6 pb-4 border-t ${theme.border} pt-6`}>
                <button onClick={() => goToPage(1)} disabled={currentPage <= 1}
                  className={`px-2 py-1.5 ${theme.surface} border ${theme.border} rounded-lg text-[10px] font-semibold ${theme.text} hover:border-orange-300 transition-all disabled:opacity-30 hidden sm:block`}
                >
                  First
                </button>
                <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 ${theme.surface} border ${theme.border} rounded-lg text-xs font-semibold ${theme.text} hover:border-orange-300 transition-all disabled:opacity-30`}
                >
                  <ChevronLeft className="w-3 h-3" /> Prev
                </button>

                {Array.from({ length: Math.min(totalViewPages, 7) }, (_, i) => {
                  let pageNum: number;
                  if (totalViewPages <= 7) pageNum = i + 1;
                  else if (currentPage <= 4) pageNum = i + 1;
                  else if (currentPage >= totalViewPages - 3) pageNum = totalViewPages - 6 + i;
                  else pageNum = currentPage - 3 + i;
                  return (
                    <button key={pageNum} onClick={() => goToPage(pageNum)}
                      className={`w-8 h-8 rounded-lg text-xs font-semibold transition-all ${
                        pageNum === currentPage
                          ? "bg-orange-600 text-white"
                          : `${theme.surface} border ${theme.border} ${theme.text} hover:border-orange-300`
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalViewPages}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 ${theme.surface} border ${theme.border} rounded-lg text-xs font-semibold ${theme.text} hover:border-orange-300 transition-all disabled:opacity-30`}
                >
                  Next <ChevronRight className="w-3 h-3" />
                </button>
                <button onClick={() => goToPage(totalViewPages)} disabled={currentPage >= totalViewPages}
                  className={`px-2 py-1.5 ${theme.surface} border ${theme.border} rounded-lg text-[10px] font-semibold ${theme.text} hover:border-orange-300 transition-all disabled:opacity-30 hidden sm:block`}
                >
                  Last
                </button>
              </div>
            )}

            {/* Footer */}
            <div className={`text-center py-6 border-t ${theme.border}`}>
              <p className={`text-[10px] ${theme.muted} leading-relaxed max-w-md mx-auto`} style={{ fontFamily: "var(--font-devanagari)" }}>
                श्री चैतन्य चरितामृत — श्रील कृष्णदास कविराज गोस्वामी द्वारा रचित, श्रील प्रभुपाद द्वारा हिंदी अनुवाद एवं तात्पर्य।
                भक्तिवेदान्त बुक ट्रस्ट (BBT) द्वारा प्रकाशित।
              </p>
              <a href="https://www.sarvam.ai" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 mt-3 text-[10px] text-stone-400 hover:text-stone-600 transition-colors">
                Powered by
                <img src="https://www.sarvam.ai/sarvam-logo.svg" alt="Sarvam AI" className="h-4 opacity-50 hover:opacity-80 transition-opacity" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              </a>
            </div>
          </div>
        </main>
      </div>

      {/* Summarize modal */}
      <AnimatePresence>
        {summarizeModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setSummarizeModal(null); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto"
            >
              <div className="p-5 border-b border-stone-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-orange-100 rounded-xl flex items-center justify-center">
                    <Sparkles className="w-4.5 h-4.5 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-stone-800 text-base">Summarize Pages</h3>
                    <p className="text-[11px] text-stone-400">Get key points from a page range</p>
                  </div>
                </div>
                <button onClick={() => setSummarizeModal(null)} className="p-1.5 hover:bg-stone-100 rounded-full">
                  <X className="w-4 h-4 text-stone-400" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-[11px] font-semibold text-stone-500 mb-1 block">From Page</label>
                    <input
                      type="number" min={1}
                      value={summarizeModal.fromPage}
                      onChange={(e) => setSummarizeModal(prev => prev ? { ...prev, fromPage: Number(e.target.value) } : null)}
                      className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                    />
                  </div>
                  <span className="text-stone-300 mt-5">→</span>
                  <div className="flex-1">
                    <label className="text-[11px] font-semibold text-stone-500 mb-1 block">To Page</label>
                    <input
                      type="number" min={1}
                      value={summarizeModal.toPage}
                      onChange={(e) => setSummarizeModal(prev => prev ? { ...prev, toPage: Number(e.target.value) } : null)}
                      className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                    />
                  </div>
                </div>

                {!summarizeModal.loading && !summarizeModal.summary && (
                  <button
                    onClick={() => handleSummarize(summarizeModal.fromPage, summarizeModal.toPage)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-semibold text-sm transition-colors active:scale-[0.98]"
                  >
                    <Sparkles className="w-4 h-4" /> Generate Summary
                  </button>
                )}

                {summarizeModal.loading && (
                  <div className="flex flex-col items-center gap-3 py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                    <p className="text-sm text-stone-500 font-medium">Analyzing pages {summarizeModal.fromPage}–{summarizeModal.toPage}…</p>
                  </div>
                )}

                {summarizeModal.summary && !summarizeModal.loading && (
                  <div className="space-y-3">
                    <div className="bg-orange-50 border border-orange-200/50 rounded-xl p-4">
                      <p className="text-[11px] font-bold text-orange-600 mb-2 uppercase tracking-wider">
                        Summary — Pages {summarizeModal.fromPage} to {summarizeModal.toPage}
                      </p>
                      <div className="text-sm text-stone-700 leading-relaxed whitespace-pre-line" style={{ fontFamily: "var(--font-devanagari)" }}>
                        {summarizeModal.summary}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(summarizeModal.summary);
                          alert("Summary copied!");
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-xl text-xs font-semibold transition-colors"
                      >
                        Copy
                      </button>
                      <button
                        onClick={() => setSummarizeModal(prev => prev ? { ...prev, summary: "", loading: false } : null)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-xl text-xs font-semibold transition-colors"
                      >
                        <RefreshCw className="w-3 h-3" /> New Range
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating bookmark FAB */}
      <motion.button
        onClick={saveBookmark}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        title={readerId ? "Save bookmark for current line" : "Sign in to save bookmarks"}
        className={`fixed right-4 sm:right-6 top-1/2 -translate-y-1/2 z-40 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-colors ${
          bookmarkSaved
            ? "bg-orange-500 text-white"
            : "bg-white text-orange-600 hover:bg-orange-50 border-2 border-orange-200"
        }`}
        aria-label="Bookmark this line"
      >
        {bookmarkSaved ? <Check className="w-5 h-5" /> : <Bookmark className={`w-5 h-5 ${bookmarkSaved ? "fill-white" : ""}`} />}
        {bookmarkSaved && (
          <motion.span
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute -top-9 right-0 whitespace-nowrap text-[11px] font-semibold bg-stone-800 text-white px-2.5 py-1 rounded-md shadow-lg"
          >
            Saved!
          </motion.span>
        )}
      </motion.button>
    </Layout>
  );
}
