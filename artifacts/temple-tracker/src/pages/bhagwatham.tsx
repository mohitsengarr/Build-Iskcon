import React, { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { type AiFixArgs } from "@/components/SourceEditor";
// Lazy — CodeMirror is heavy and only loaded when a maintainer opens the editor,
// so it never ships in the reader's critical path.
const SourceEditor = React.lazy(() => import("@/components/SourceEditor"));
import { fadeInUp, fadeIn } from "@/lib/animations";
import { applyTextCorrections } from "@/lib/bhagwatham-config";
import {
  BookOpen, ChevronLeft, ChevronRight, Loader2,
  RefreshCw, Search, BookMarked, Sparkles,
  List, X, ChevronDown, ChevronUp, Image as ImageIcon, Languages,
  Download, Share2, Bookmark, Trash2, LogIn, Volume2, Square, Check,
  Settings, Sun, Moon, Type, Minus, Plus, Maximize2, Undo2, Pencil, Wand2, Send, Bold, Eraser, GripHorizontal,
  CornerDownLeft, Combine, Keyboard, Delete,
} from "lucide-react";

// ── Reading Settings ─────────────────────────────────────────────────────────

type Theme = "light" | "dark" | "sepia";

interface ReadingSettings {
  fontSize: number;   // 14-24
  lineHeight: number; // 1.6-2.4
  maxWidth: number;   // 640-960
  theme: Theme;
  showPageNumbers: boolean; // the · N · dividers between pages
}

const DEFAULT_SETTINGS: ReadingSettings = { fontSize: 15, lineHeight: 1.8, maxWidth: 768, theme: "light", showPageNumbers: true };

function loadSettings(): ReadingSettings {
  try {
    const raw = localStorage.getItem("bhagwatham_settings");
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch { return DEFAULT_SETTINGS; }
}

function saveSettings(s: ReadingSettings) {
  try {
    localStorage.setItem("bhagwatham_settings", JSON.stringify(s));
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

  // Close on outside click / Esc. Click on the gear toggle is intentionally
  // ignored (it has its own onClick handler that flips state).
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Ignore clicks inside the panel
      if (panelRef.current && panelRef.current.contains(target)) return;
      // Ignore clicks on the gear button that opens this panel
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

      {/* Font size */}
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

      {/* Line height */}
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

      {/* Content width */}
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

      {/* Theme */}
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
  batchNumber: number; startPage: number; endPage: number;
  processedAt: string; pages: PageContent[];
}
interface Progress {
  lastProcessedPage: number; totalPagesProcessed: number;
  totalPagesInPdf: number; batchSize: number;
  batchesCompleted: number; lastProcessedAt: string | null; status: string;
}
interface ContentResponse {
  batches: BatchData[];
  pagination: { page: number; limit: number; totalBatches: number; totalPages: number; hasMore: boolean };
}
interface ChapterImageInfo {
  chapterNumber: number; chapterTitle: string;
  imagePath: string; prompt: string; generatedAt: string;
  sceneIndex?: number; descriptionHi?: string;
}
interface ImageManifest { images: ChapterImageInfo[]; lastUpdated: string }

interface BookmarkEntry {
  id: string;
  reader_id: string;
  reader_name?: string;
  page_number: number;
  chapter_number?: number;
  chapter_title?: string;
  label?: string;
  /** First ~60 chars of the line that was at the top of the viewport when saved. */
  line_anchor?: string | null;
  created_at: string;
}

/** Find the topmost <p> element visible inside a given page container. */
function findTopmostVisibleParagraph(pageEl: HTMLElement): HTMLParagraphElement | null {
  const ps = pageEl.querySelectorAll("p");
  // headerBuffer accounts for the sticky top bar (~70px on most screens)
  const headerBuffer = 90;
  let best: HTMLParagraphElement | null = null;
  let bestTop = Infinity;
  for (const p of ps) {
    const rect = (p as HTMLElement).getBoundingClientRect();
    // Skip elements that have no content
    if (!(p as HTMLElement).textContent?.trim()) continue;
    // The paragraph is "visible at the top" if its top is just below the header
    // and within the viewport. Prefer the one with the smallest positive distance
    // from the header line.
    const distFromHeader = rect.top - headerBuffer;
    if (rect.bottom > headerBuffer && distFromHeader < bestTop && distFromHeader > -rect.height) {
      bestTop = distFromHeader;
      best = p as HTMLParagraphElement;
    }
  }
  return best;
}

/** Manual section override — user marks line ranges with a specific type */
type SectionKind = "shlok" | "shabdarth" | "anuvad" | "tatparya" | "text";
interface SectionOverride {
  startLine: number; // 0-based line index
  endLine: number;   // inclusive
  kind: SectionKind;
}

// Page overrides map: pageNumber → overrides
type PageOverrides = Record<number, SectionOverride[]>;

function loadSectionOverrides(): PageOverrides {
  try {
    const raw = localStorage.getItem("bhagwatham_section_overrides");
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveSectionOverrides(o: PageOverrides) {
  try {
    localStorage.setItem("bhagwatham_section_overrides", JSON.stringify(o));
  } catch { /* quota exceeded / private mode — overrides just won't persist */ }
}

// ── Per-line "un-bold" overrides ──────────────────────────────────────────────
// Shlok (Sanskrit verse) lines render bold BY DESIGN (BBT print convention — see
// the `font-bold` on the shlok <p>). That bold is structural CSS, NOT `**` markdown,
// so the "Remove bold" toolbar (which only strips `**`) can never lighten a verse —
// it silently no-ops. This lets a maintainer mark specific verse lines to render at
// normal weight; the renderer honours it and "Make bold" toggles it back. Keyed by
// the normalized line text (device-local, non-destructive, reversible) so it survives
// re-pagination. `**` and whitespace are collapsed so the source line and the
// rendered-DOM selection normalize to the same key.
function normalizeBoldKey(line: string): string {
  // Danda-insensitive: the OCR emits both "।" and an ASCII "|" for the same mark,
  // and normalising pipes for display would otherwise invalidate keys stored
  // before that change.
  return line.replace(/\*\*/g, "").replace(/[|॥]/g, "।").replace(/\s+/g, " ").trim();
}

// Key for शब्दार्थ (word-meaning) lines. Their meanings are bolded by the RENDERER
// (<strong>), not by `**`, so they need the same un-bold override as verses — but
// the renderer prints every separator as "—" whatever the source used ("—", "--"
// or "- "), so a rendered-text key would never equal a source-line key. Collapsing
// each dash run to a single "—" makes both sides normalize identically.
function normalizeDashKey(line: string): string {
  return normalizeBoldKey(line).replace(/[-‐-―−]+/g, "—").replace(/\s*—\s*/g, "—");
}

// Tidy the AI's replacement before it goes into the page source.
// The OCR keeps a newline at every PRINTED line end, and the renderer turns each
// source line into its own rendered line. The model re-wraps prose at different
// points, so its output rendered as ragged half-width lines. In prose we collapse
// single newlines to spaces (the paragraph then reflows naturally to full width)
// while keeping blank lines, which are real paragraph breaks. Verses are left
// alone — there a single newline separates the half-lines and is meaningful.
// Also fixes the doubled single-danda splice artifact ("होगा। ।").
function tidyAiText(text: string, isVerse: boolean): string {
  let out = text;
  if (!isVerse) {
    out = out.replace(/([^\n])\n(?!\n)/g, "$1 ");
  }
  out = out
    .replace(/।[ \t]*।/g, "।")   // "। ।" → "।"  (॥ is one char, untouched)
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n");
  return out.trim();
}

function loadUnboldLines(): Set<string> {
  try {
    const raw = localStorage.getItem("bhagwatham_unbold_lines");
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}

function saveUnboldLines(s: Set<string>) {
  try {
    localStorage.setItem("bhagwatham_unbold_lines", JSON.stringify([...s]));
  } catch { /* quota exceeded / private mode — override just won't persist */ }
}


// Approved reader-scene illustrations are keyed by the opening of the passage the
// reader highlighted, so the artwork can be placed directly above that passage.
function sceneKeyOf(text: string): string {
  return text.replace(/\*\*/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
}

// BBT print-style section colors
const SECTION_KIND_LABELS: Record<SectionKind, { label: string; color: string; bg: string }> = {
  shlok:     { label: "Shlok",      color: "text-blue-700",   bg: "bg-blue-100 border-blue-300" },
  shabdarth: { label: "Shabdarth",  color: "text-pink-700",   bg: "bg-pink-100 border-pink-300" },
  anuvad:    { label: "Anuvad",     color: "text-stone-900",  bg: "bg-stone-100 border-stone-300" },
  tatparya:  { label: "Tatparya",   color: "text-green-700",  bg: "bg-green-100 border-green-300" },
  text:      { label: "Text",       color: "text-stone-600",  bg: "bg-stone-100 border-stone-300" },
};

/** A chapter detected from the OCR content */
interface ChapterEntry {
  number: number;
  skandh: number;
  globalNumber: number; // unique across all skandhs
  title: string;
  pageNumber: number;
}

/** Skandh (Canto) metadata */
const SKANDH_NAMES: Record<number, { hi: string; en: string }> = {
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

const API_BASE = "/api/bhagwatham";
// For mutations (DELETE/POST/PATCH) — falls back to local API in dev. On Vercel,
// set VITE_PUBLIC_API_URL to an ngrok/Cloudflare tunnel pointing at the live server.
const MUTATION_API_BASE = `${import.meta.env.VITE_PUBLIC_API_URL || ""}/api/bhagwatham`;
const isMutationApiConfigured = () =>
  Boolean(import.meta.env.VITE_PUBLIC_API_URL) || (typeof window !== "undefined" && window.location.hostname === "localhost");

// ── Sarvam TTS (via Supabase Edge Function proxy — keeps the API key server-side) ──

// ── TTS audio cache (localStorage; persistent per-device) ─────────────────────
// Saves Sarvam credits — every shlok/word fetched once is reused for the life
// of the device. Key = stable hash of normalized text. Audio is stored as
// base64 MP3 (typical 15–80 KB per shlok). Eviction on quota error: drop
// oldest 25% of entries by access time.
const TTS_CACHE_PREFIX = "tts_v2_";
const TTS_CACHE_INDEX_KEY = "tts_v2_index"; // tracks last-access timestamps

function ttsTextHash(text: string): string {
  const norm = text.normalize("NFC").trim().replace(/\s+/g, " ").slice(0, 400);
  try {
    return btoa(unescape(encodeURIComponent(norm)));
  } catch {
    return norm.length + "_" + norm.charCodeAt(0) + "_" + norm.charCodeAt(norm.length - 1);
  }
}

function ttsCacheRead(key: string): Blob | null {
  try {
    const b64 = localStorage.getItem(TTS_CACHE_PREFIX + key);
    if (!b64) return null;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    ttsCacheTouch(key); // mark as recently used
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
  // Chunked base64 encode (avoids stack overflow on 100KB+ buffers)
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

/**
 * Stream TTS audio from Sarvam HTTP API and play in real-time.
 * Cached in localStorage so repeated listens of the same text are free.
 * Returns the Audio element (already playing) so callers can track/stop it.
 */
async function sarvamStreamPlay(text: string): Promise<HTMLAudioElement> {
  const hash = ttsTextHash(text);

  // L1: localStorage cache — instant, no network, no credits used.
  const cached = ttsCacheRead(hash);
  if (cached) {
    const audio = new Audio(URL.createObjectURL(cached));
    const p = audio.play();
    if (p && typeof p.then === "function") {
      p.catch((err) => console.error("[TTS] cached play rejected:", err?.name || err));
    }
    return audio;
  }

  // Cache miss — fetch via the Supabase Edge Function proxy so the Sarvam
  // key stays server-side. The proxy streams back the same response format.
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

  // Blob path keeps the click → play in one synchronous chain so autoplay
  // policy doesn't block. Buffer is also fed to the cache (fire-and-forget).
  const buffer = await response.arrayBuffer();
  const blob = new Blob([buffer], { type: "audio/mpeg" });
  const audio = new Audio(URL.createObjectURL(blob));
  const playResult = audio.play();
  if (playResult && typeof playResult.then === "function") {
    playResult.catch((err) => {
      console.error("[TTS] audio.play() rejected:", err?.name || err);
    });
  }
  // Persist to cache after the audio starts playing — never blocks the UX.
  try { ttsCacheWrite(hash, buffer); } catch { /* */ }
  return audio;
}

// ── Supabase direct access (for bookmarks — works on both Replit & Vercel) ──
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

const HINDI_NUMS: Record<string, number> = {
  // 1–10
  एक: 1, दो: 2, तीन: 3, चार: 4, पाँच: 5, पांच: 5, छः: 6, छह: 6,
  सात: 7, आठ: 8, नौ: 9, दस: 10,
  // 11–20
  ग्यारह: 11, बारह: 12, तेरह: 13, चौदह: 14, पन्द्रह: 15, पंद्रह: 15,
  सोलह: 16, सत्रह: 17, अठारह: 18, उन्नीस: 19, बीस: 20,
  // 21–30
  इक्कीस: 21, बाईस: 22, तेईस: 23, चौबीस: 24, पच्चीस: 25,
  छब्बीस: 26, सत्ताईस: 27, सताईस: 27, अट्ठाईस: 28,
  उनतीस: 29, उन्तीस: 29, तीस: 30,
  // 31–40
  इकतीस: 31, बत्तीस: 32, तैंतीस: 33, चौंतीस: 34,
  पैंतीस: 35, छत्तीस: 36, सैंतीस: 37, अड़तीस: 38,
  उनतालीस: 39, चालीस: 40,
  // 41–50
  इकतालीस: 41, बयालीस: 42, तैंतालीस: 43, चवालीस: 44,
  पैंतालीस: 45, छियालीस: 46, छियालिस: 46, सैंतालीस: 47,
  अड़तालीस: 48, उनचास: 49, पचास: 50,
  // 51–60
  इक्यावन: 51, बावन: 52, तिरपन: 53, चौवन: 54, पचपन: 55,
  छप्पन: 56, सत्तावन: 57, अट्ठावन: 58, उनसठ: 59, साठ: 60,
  // 61–70
  इकसठ: 61, बासठ: 62, तिरसठ: 63, चौंसठ: 64, पैंसठ: 65,
  छियासठ: 66, सतसठ: 67, सड़सठ: 67, अड़सठ: 68, उनहत्तर: 69, सत्तर: 70,
  // 71–80
  इकहत्तर: 71, बहत्तर: 72, तिहत्तर: 73, चौहत्तर: 74, पचहत्तर: 75,
  छिहत्तर: 76, सतहत्तर: 77, अठहत्तर: 78, उन्यासी: 79, उनासी: 79, अस्सी: 80,
  // 81–90
  इक्यासी: 81, बयासी: 82, तिरासी: 83, चौरासी: 84, पिचासी: 85, पचासी: 85,
  छियासी: 86, सत्तासी: 87, अट्ठासी: 88, नवासी: 89, नब्बे: 90,
  // 91–99
  इक्यानवे: 91, इक्यानबे: 91, बानवे: 92, बानबे: 92,
  तिरानवे: 93, तिरानबे: 93, चौरानवे: 94, चौरानबे: 94,
  पचानवे: 95, पचानबे: 95, छियानवे: 96, छियानबे: 96,
  सत्तानवे: 97, सत्तानबे: 97, अट्ठानवे: 98, अट्ठानबे: 98,
  निन्यानवे: 99, निन्यानबे: 99,
  // 100 (standalone)
  सौ: 100,
  // OCR spelling variants
  तेइस: 23, तेइेस: 23, छियलीस: 46, पचीस: 25, सत्ताइस: 27,
};

const HINDI_HUNDREDS: Record<string, number> = {
  एक: 100, दो: 200, तीन: 300, चार: 400, पाँच: 500, पांच: 500,
};

/** Parse compound Hindi numbers like "एक सौ इक्कीस" → 121 or simple "बीस" → 20 */
function parseHindiNumber(text: string): number {
  const trimmed = text.trim();
  if (HINDI_NUMS[trimmed] !== undefined) return HINDI_NUMS[trimmed];
  const sauMatch = trimmed.match(/^(.+?)\s+सौ(?:\s+(.+))?$/u);
  if (sauMatch) {
    const hundredVal = HINDI_HUNDREDS[sauMatch[1].trim()];
    if (hundredVal) {
      const remainder = sauMatch[2]?.trim();
      if (!remainder) return hundredVal;
      const unit = HINDI_NUMS[remainder];
      if (unit !== undefined) return hundredVal + unit;
    }
  }
  return 0;
}

// Match chapter headings: "Chapter <anything>" or "अध्याय <any-hindi-word-or-digit>"
const CHAPTER_RE = /^(?:Chapter\s+\S+|अध्याय\s+(?:[\u0900-\u097F]+(?:\s+[\u0900-\u097F]+){0,2}|\d+))\s*$/iu;

// OCR-mangled chapter headings mapped to correct chapter numbers.
// Skandh 1: "Chapter 278 अध्याय" → ch 8, "Chapter it" → ch 9
// Skandh 2: "(शुषा दो" → ch 2, "Chapter 3:" → ch 6 (छ→3, ः→:), "(नौ" → ch 9
// Note: "Chapter 36" (OCR of "Chapter आठ") handled contextually in buildChapterIndex
const OCR_CHAPTER_FIXES: Record<string, { num: number; label: string }> = {
  "Chapter 278 अध्याय": { num: 8, label: "अध्याय आठ" },
  "Chapter it": { num: 9, label: "अध्याय नौ" },
  "(शुषा दो": { num: 2, label: "अध्याय दो" },
  "Chapter 3:": { num: 6, label: "अध्याय छह" },
  "(नौ": { num: 9, label: "अध्याय नौ" },
  "Chapter 36": { num: 8, label: "अध्याय आठ" },
  "Chapter छ:": { num: 6, label: "अध्याय छह" },
  "छल्नीस": { num: 26, label: "अध्याय छब्बीस" },
  "अदुईस": { num: 28, label: "अध्याय अट्ठाईस" },
  "Chapter इक्तीस": { num: 21, label: "अध्याय इक्कीस" }, // OCR "इक्कीस"(21) → "इक्तीस"(looks like 31)
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function isGarbagePage(text: string): boolean {
  if (!text || text.length < 20) return true;
  const devanagari = (text.match(/[\u0900-\u097F]/gu) || []).length;
  const total = text.replace(/\s/g, "").length;
  if (total === 0) return true;
  if (devanagari / total < 0.4) return true;
  const ascii = (text.match(/[a-zA-Z0-9@#$%^&*(){}\[\]|\\<>]/gu) || []).length;
  if (total > 0 && ascii / total > 0.25) return true;
  return false;
}

function isStandalonePageNumber(line: string): boolean {
  // Lines that are just a number or number with bracket (OCR page numbers like "43", "430", "42]")
  return /^\d{1,5}[\]\)]*$/.test(line.trim());
}

function stripLeadingPageNumber(line: string): string {
  // Remove leading page numbers like "430 सूत उवाच" → "सूत उवाच", "422 तात्पर्यं" → "तात्पर्यं"
  // Only strip 2+ digit numbers to avoid stripping numbered lists like "1) श्रवण"
  // Also handles brackets: "42] दर्शन" → "दर्शन"
  return line.replace(/^\d{2,5}[\]\)]*\s+/, "");
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
  // Preserve known OCR chapter headings before cleaning
  const OCR_PRESERVES = Object.keys(OCR_CHAPTER_FIXES);
  let result = text;
  const placeholders: Array<{ placeholder: string; original: string }> = [];
  for (const key of OCR_PRESERVES) {
    if (result.includes(key)) {
      const ph = `__OCR_FIX_${placeholders.length}__`;
      placeholders.push({ placeholder: ph, original: key });
      result = result.replace(key, ph);
    }
  }
  result = result
    // The OCR transcribes roughly a quarter of dandas as ASCII pipes, which render
    // as "|" and "|| १९ ||" instead of । and ॥. Restore the real marks.
    .replace(/\|\s*\|/g, "॥")
    .replace(/(?<=[\u0900-\u097F\s])\|/gu, "।")
    // Remove standalone page number lines BEFORE collapsing whitespace
    // e.g., "6\n\nशब्दार्थं" → "\n\nशब्दार्थं" (prevents "6 शब्दार्थं" after collapse)
    .replace(/^(\d{1,5}[\]\)]*)$/gmu, "")
    .replace(/(?<=[\u0900-\u097F\s;,।:—\-\.])\s*\b[a-zA-Z]{1,5}\b\s*[:\|]?\s*(?=[\u0900-\u097F\s;,।:—\-\.])/gu, " ")
    .replace(/(?<=[\u0900-\u097F])\s+[a-zA-Z]{1,4}\s+(?=[\u0900-\u097F])/gu, " ")
    .replace(/©/g, "")
    // Collapse multiple blank lines into one newline, but preserve single newlines
    .replace(/\n{3,}/g, "\n\n")
    // Collapse horizontal whitespace (spaces/tabs) but NOT newlines
    .replace(/[^\S\n]{2,}/g, " ")
    .replace(/;\s*;/g, ";")
    .trim();
  // Restore OCR chapter heading placeholders
  for (const { placeholder, original } of placeholders) {
    result = result.replace(placeholder, original);
  }
  // Apply centralized text corrections (from bhagwatham-config.ts)
  result = applyTextCorrections(result);
  return result;
}

function extractChapterNum(line: string): number {
  // 1. OCR fixes take priority
  for (const [key, fix] of Object.entries(OCR_CHAPTER_FIXES)) {
    if (line.includes(key) || line.includes(fix.label)) return fix.num;
  }
  // 2. Try compound Hindi number parser ("एक सौ इक्कीस" = 121)
  const afterHeading = line.replace(/^(?:अध्याय|Chapter)\s*/iu, "").trim();
  if (afterHeading) {
    const compound = parseHindiNumber(afterHeading);
    if (compound > 0) return compound;
  }
  // 3. Simple Hindi word lookup (fallback)
  for (const [word, num] of Object.entries(HINDI_NUMS)) {
    if (line.includes(word)) return num;
  }
  // 4. Arabic digit fallback
  const numMatch = line.match(/\d+/);
  if (numMatch) {
    const n = parseInt(numMatch[0], 10);
    if (n > 0 && n <= 500) return n;
  }
  return 0;
}

function toHindiChapterLine(t: string): string {
  const cleaned = t.replace(/^\d+\s+/, "");
  // Check OCR fixes first
  for (const [key, fix] of Object.entries(OCR_CHAPTER_FIXES)) {
    if (cleaned.includes(key) || t.includes(key)) return fix.label;
  }
  return cleaned.replace(/^Chapter\s*/i, "अध्याय ");
}

function isChapterHeading(t: string): boolean {
  // Strip leading page numbers that OCR sometimes picks up (e.g., "42 Chapter दो")
  const cleaned = t.replace(/^\d+\s+/, "");
  // Reject long lines — real chapter headings are short
  if (cleaned.length > 60) return false;
  if (t.includes("पूर्ण हुए") || t.includes("पूर्ण हुआ")) return false;
  if (CHAPTER_RE.test(cleaned)) return true;
  // Check known OCR-mangled headings
  for (const key of Object.keys(OCR_CHAPTER_FIXES)) {
    if (cleaned.includes(key) || t.includes(key)) return true;
  }
  return false;
}

// ── Skandh (Canto) page-range anchors ─────────────────────────────────────
// Derived from OCR title pages, colophons, and "Chapter एक" markers.
// Using page ranges is far more robust than detecting chapter-number resets.
const SKANDH_PAGE_RANGES: Array<{ skandh: number; startPage: number }> = [
  { skandh: 1,  startPage: 1 },
  { skandh: 2,  startPage: 874 },
  { skandh: 3,  startPage: 1399 },
  { skandh: 4,  startPage: 2617 },
  { skandh: 5,  startPage: 3900 },
  { skandh: 6,  startPage: 4540 },
  { skandh: 7,  startPage: 5204 },
  { skandh: 8,  startPage: 5849 },
  { skandh: 9,  startPage: 6373 },
  { skandh: 10, startPage: 7080 },
  { skandh: 11, startPage: 9059 },
  { skandh: 12, startPage: 9500 },
];

function getSkandh(pageNumber: number): number {
  for (let i = SKANDH_PAGE_RANGES.length - 1; i >= 0; i--) {
    if (pageNumber >= SKANDH_PAGE_RANGES[i].startPage) return SKANDH_PAGE_RANGES[i].skandh;
  }
  return 1;
}

// ── Build chapter index from all loaded pages ─────────────────────────────────

function buildChapterIndex(allPages: PageContent[]): ChapterEntry[] {
  const chapters: ChapterEntry[] = [];
  let globalCounter = 0;
  const lastChapterPerSkandh = new Map<number, number>();

  for (const page of allPages) {
    if (isGarbagePage(page.text)) continue;

    const skandh = getSkandh(page.pageNumber);
    const lines = page.text.split("\n");

    // ToC detection: if a page has 2+ chapter heading lines, skip them all
    const chapterHeadingCount = lines.filter((l) => isChapterHeading(l.trim())).length;
    if (chapterHeadingCount >= 2) continue;

    for (const line of lines) {
      const t = line.trim();
      if (isChapterHeading(t)) {
        const hindiLine = toHindiChapterLine(t);
        const num = extractChapterNum(hindiLine);
        if (num > 0) {
          const lastNum = lastChapterPerSkandh.get(skandh) ?? 0;
          // Skip backward jumps within same skandh (likely false positives)
          if (num < lastNum && lastNum > 2) continue;
          // Skip duplicates within same skandh
          if (chapters.find((c) => c.number === num && c.skandh === skandh)) continue;
          const idx = lines.indexOf(line);
          const subtitle = lines.slice(idx + 1, idx + 3).map((l) => l.trim()).filter(Boolean).join(" ");
          globalCounter++;
          lastChapterPerSkandh.set(skandh, num);
          chapters.push({
            number: num,
            skandh,
            globalNumber: globalCounter,
            title: hindiLine + (subtitle ? ` — ${subtitle}` : ""),
            pageNumber: page.pageNumber,
          });
        }
      }
    }
  }
  const sorted = chapters.sort((a, b) => a.skandh !== b.skandh ? a.skandh - b.skandh : a.number - b.number);
  sorted.forEach((ch, i) => { ch.globalNumber = i + 1; });
  return sorted;
}

// ── Image Card with Download & Share ──────────────────────────────────────────

function ImageCard({ img, alt }: { img: { url: string; description: string }; alt: string }) {
  const handleDownload = async () => {
    try {
      const response = await fetch(img.url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bhagwatham-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(img.url, "_blank");
    }
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        const response = await fetch(img.url);
        const blob = await response.blob();
        const file = new File([blob], "bhagwatham.jpg", { type: "image/jpeg" });
        await navigator.share({
          title: "श्रीमद्भागवतम् — Build ISKCON",
          text: img.description,
          files: [file],
        });
      } else {
        // Fallback: copy image URL
        await navigator.clipboard.writeText(window.location.origin + img.url);
        alert("Link copied! You can share it anywhere.");
      }
    } catch {
      // User cancelled or error
    }
  };

  return (
    <div className="rounded-2xl overflow-hidden shadow-lg border border-orange-200/40 bg-white">
      <img src={img.url} alt={alt} className="w-full h-auto object-cover" loading="lazy" />
      <div className="px-3 py-2.5 flex items-center justify-between gap-2">
        <p className="text-[11px] text-stone-600 leading-relaxed flex-1">{img.description}</p>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleDownload}
            className="p-1.5 rounded-lg hover:bg-orange-100 text-stone-500 hover:text-orange-700 transition-colors"
            title="Download"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={handleShare}
            className="p-1.5 rounded-lg hover:bg-orange-100 text-stone-500 hover:text-orange-700 transition-colors"
            title="Share"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
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

// ── Bookmark Panel (in sidebar) ─────────────────────────────────────────────

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
                  {b.label || (b.chapter_title ? b.chapter_title.split("—")[0].trim() : `Page ${b.page_number}`)}
                </p>
                <p className="text-[10px] text-stone-400">
                  Page {b.page_number}
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

// Detect half-shloka: a Sanskrit verse line ending in single danda (।) but no double (॥).
// Used to bridge shlokas split across page boundaries (e.g. first half ends page 1523,
// second half starts page 1524).
function isHalfShlokaLine(line: string): boolean {
  // Must end in single danda (with optional trailing whitespace)
  if (!/।\s*$/.test(line)) return false;
  // Must NOT contain double danda (that would be a full shloka)
  if (/॥/.test(line)) return false;
  // Strip the trailing danda for content analysis
  const body = line.replace(/।\s*$/, "").trim();
  if (body.length < 5 || body.length > 120) return false;
  // Must be predominantly Devanagari
  const dev = (body.match(/[\u0900-\u097F]/gu) || []).length;
  const total = body.replace(/\s/g, "").length;
  if (total === 0 || dev / total < 0.7) return false;
  // Must NOT start with section markers
  if (/^(तात्पर्य|शब्दार्थ|अनुवाद|अध्याय|स्कन्ध|Chapter)/iu.test(body)) return false;
  // Must NOT be shabdarth (has dash + semicolon)
  if ((body.includes("—") || body.includes("--")) && body.includes(";")) return false;
  // Must have Sanskrit signals: visarga (ः) or Sanskrit case endings
  const visarga = (body.match(/ः/gu) || []).length;
  const sanskritEndings = (body.match(/(?:स्य|ेन|ाय|ात्|ेषु|ानाम्|ेभ्यः|ाभिः|म्\s|म्$)/gu) || []).length;
  const sanskritParticles = (body.match(/(?:^|\s)(?:च|एव|हि|तु|अपि|वै|यः|सः|यदा|तदा|तथा|इति|एषः)(?:\s|$)/gu) || []).length;
  // Hindi-prose disqualifiers
  const hindiPP = (body.match(/(?:^|\s)(?:का|की|के|को|में|पर|से|ने|तक|और|कि|जब|तब|नहीं|प्रति|बिना|साथ|लिए|बारे|जैसे|क्योंकि|इसलिए)(?:\s|$)/gu) || []).length;
  const hindiVerb = /(?:है[ँं]?|हैं|था|थे|थी|गया|गयी|किया|करें|रहा|सकता|चाहिए|होता|होती)(?:\s|।|$)/u.test(body);
  if (hindiPP >= 2) return false;
  if (hindiVerb && (visarga + sanskritEndings) < 2) return false;
  // Strong Sanskrit signal (one or more Sanskrit-only markers)
  return (visarga + sanskritEndings + sanskritParticles) >= 1;
}

// ── Determine what section kind a page ends with (for cross-page continuity) ──
// Optional `nextPageText`: if supplied and the page would otherwise end in a
// half-shloka classified as ref-shlok (because we were inside tatparya context),
// but the next page begins with a numbered shlok continuation (e.g. `॥ ११ ॥`),
// the verse is actually a main shlok, not a ref-shlok. Upgrade the end kind so
// the next page's first section renders as a shlok continuation (no divider,
// no left border, no italic-brown styling).
function getPageEndKind(text: string, nextPageText?: string): string {
  if (!text) return "text";
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  let lastKind = "text";
  let insideTatparya = false; // track whether we're inside a tatparya block
  for (const line of lines) {
    if (/^तात्पर्य/u.test(line)) { lastKind = "tatparya"; insideTatparya = true; }
    else if (/^अनुवाद/u.test(line)) { lastKind = "anuvad"; insideTatparya = false; }
    else if (/^शब्दार्थ/u.test(line)) { lastKind = "shabdarth"; insideTatparya = false; }
    else if (/॥/u.test(line)) {
      if (insideTatparya) {
        lastKind = "ref-shlok"; // ref-shlok inside tatparya
      } else {
        lastKind = "shlok";
        insideTatparya = false;
      }
    }
    // Half-shloka: verse-like Sanskrit line ending in । only — start of a 2-line shloka
    // that continues on the next page. Treat the page as ending in shlok/ref-shlok.
    else if (isHalfShlokaLine(line)) {
      lastKind = insideTatparya ? "ref-shlok" : "shlok";
    }
    else if (/^(अध्याय|स्कन्ध|Chapter)/iu.test(line)) { lastKind = "text"; insideTatparya = false; }
    // Detect implicit shabdarth→anuvad transition:
    // shabdarth lines have "—" or "--" with ";", anuvad lines don't
    else if (lastKind === "shabdarth" && !(line.includes("—") || line.includes("--")) && !line.includes(";")) {
      lastKind = "anuvad"; insideTatparya = false;
    }
    // After ref-shlok (inside tatparya), non-verse prose = back to tatparya
    else if (lastKind === "ref-shlok" && insideTatparya) {
      lastKind = "tatparya";
    }
    // After shlok, non-verse Hindi prose = anuvad
    else if (lastKind === "shlok" && !/॥/u.test(line)) {
      lastKind = "anuvad";
    }
  }
  // Cross-page upgrade: a half-shloka ending classified as ref-shlok (because of
  // surrounding tatparya context) gets promoted to shlok if the next page starts
  // with a numbered-shlok continuation. The verse's number lives on the next page.
  // Guard: only fire when the page actually ends in a half-shloka (single danda,
  // no ॥) — a complete cited ref-shlok terminating in ॥ must not be reclassified.
  if (lastKind === "ref-shlok" && nextPageText && pageStartsWithNumberedShlokContinuation(nextPageText)) {
    const lastDevLine = [...lines].reverse().find(l => /[ऀ-ॿ]/.test(l)) || "";
    const endsAsHalf = /।\s*$/.test(lastDevLine) && !/॥/.test(lastDevLine);
    if (endsAsHalf) {
      lastKind = "shlok";
    }
  }
  return lastKind;
}

// ── Peek next page: does it begin with the closing half of a numbered shlok? ──
// True when the first verse-like line on the page (before any tatparya/शब्दार्थ/
// अनुवाद marker or chapter heading) carries a `॥ N ॥` numbered terminator,
// meaning the previous page's trailing half-shloka was the first half of that
// numbered verse and should render as a main shlok, not a ref-shlok.
function pageStartsWithNumberedShlokContinuation(text: string): boolean {
  if (!text) return false;
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean).filter(l => !isStandalonePageNumber(l));
  let scanned = 0;
  for (const line of lines) {
    if (scanned > 3) return false; // peek only first ~3 verse-like lines
    // Stop at section markers — half-shloka cannot continue past these
    if (/^(तात्पर्य|शब्दार्थ|अनुवाद)/u.test(line)) return false;
    if (/^(अध्याय|स्कन्ध|Chapter)/iu.test(line)) return false;
    if (isChapterHeading(line)) return false;
    // Hindi prose — not a verse continuation
    if (/(?:है[ँं]?|हैं|था|थी|गया|गयी|किया|रहा|होता|करता)(?:\s|।|$)/u.test(line)) return false;
    // Numbered shlok terminator — confirms continuation
    if (/॥\s*[\d१२३४५६७८९०]+\s*॥/u.test(line)) return true;
    // Unnumbered ॥ — standalone ref-shlok or different verse, not a continuation
    if (/॥/u.test(line)) return false;
    scanned++;
  }
  return false;
}

// ── On-screen Devanagari keyboard ────────────────────────────────────────
//
// Opens inside the selection toolbar's "Manual fix" mode. Provides a textarea
// pre-filled with the user's selection plus tappable rows of Devanagari
// vowels, consonants, matras, numerals, and punctuation. Each key inserts at
// the current cursor position; backspace deletes the char before the cursor.
// The textarea also accepts the user's physical keyboard, so a desktop reader
// with an OS Hindi IME can keep using it.
//
// Layout: 5 grouped rows, monospace-ish grid so keys line up cleanly.

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

  // Insert text at the current cursor position (or replace selection).
  // After insertion, restore focus and place the caret right after the
  // inserted span so consecutive key taps build up naturally.
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

  // Backspace: delete the character immediately before the caret (or the
  // current selection if any). Mirrors the OS keyboard's backspace.
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
      // Has selection — delete it
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

  // Focus the textarea on mount so the user can immediately type / tap keys
  useEffect(() => {
    const t = textareaRef.current;
    if (!t) return;
    t.focus();
    // Place caret at end so the existing text isn't accidentally overwritten
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
          // Ctrl/Cmd + Enter saves; plain Enter inserts a newline (multiline allowed)
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSave(value);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
      />

      {/* Devanagari character grid */}
      <div className="space-y-1.5" onMouseDown={e => e.preventDefault()}>
        {/* Vowels */}
        <div className="flex flex-wrap gap-1 justify-center">
          {DEVA_VOWELS.map(c => <Key key={c} ch={c} />)}
        </div>
        {/* Consonant rows */}
        {DEVA_CONSONANTS.map((row, ri) => (
          <div key={ri} className="flex flex-wrap gap-1 justify-center">
            {row.map(c => <Key key={c} ch={c} />)}
          </div>
        ))}
        {/* Matras row */}
        <div className="flex flex-wrap gap-1 justify-center pt-1 border-t border-emerald-200/60">
          {DEVA_MATRAS.map(c => <Key key={c} ch={c} />)}
        </div>
        {/* Digits + punctuation */}
        <div className="flex flex-wrap gap-1 justify-center">
          {DEVA_DIGITS.map(c => <Key key={c} ch={c} />)}
        </div>
        <div className="flex flex-wrap gap-1 justify-center">
          {DEVA_PUNCT.map(c => <Key key={c} ch={c} />)}
        </div>
        {/* Space + backspace */}
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

      {/* Save / cancel */}
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

// Escape a string for literal use inside a RegExp.
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Robust selection locator (BUG 2) ────────────────────────────────────────
// `page.text.indexOf(selectedText)` returns -1 whenever the rendered/selected
// text doesn't byte-match the raw page source — e.g. because:
//   (i)   the source has "**bold**" markers that the rendered <strong> selection
//         doesn't include;
//   (ii)  whitespace/newline normalization differs (rendered text collapses
//         lines/spaces; source keeps "\n" and OCR spacing);
//   (iii) the DOM selection swept up rendering-only glyphs.
// This helper tries progressively looser strategies and returns the FIRST hit
// as {index, matchLength} — the caller should slice/replace using that
// (index, matchLength) pair, never a naive `.replace(selectedText, ...)`
// (which can silently hit the wrong occurrence, or fail outright).
function locateSelectionInSource(sourceText: string, selectedText: string): { index: number; matchLength: number } | null {
  if (!sourceText || !selectedText) return null;

  // 1. Exact match.
  {
    const idx = sourceText.indexOf(selectedText);
    if (idx >= 0) return { index: idx, matchLength: selectedText.length };
  }

  // 2. Exact match on the trimmed selection (handles leading/trailing
  //    whitespace picked up by the DOM Selection API).
  const trimmedSel = selectedText.trim();
  if (trimmedSel && trimmedSel !== selectedText) {
    const idx = sourceText.indexOf(trimmedSel);
    if (idx >= 0) return { index: idx, matchLength: trimmedSel.length };
  }

  // 3. Whitespace-flexible match: every run of whitespace in the selection
  //    matches any run of whitespace in the source. This handles rendered
  //    selections that space-join what is, in the source, several lines
  //    separated by "\n" (or OCR runs of multiple spaces).
  const buildWhitespaceFlexibleRegex = (s: string): string =>
    s.split(/(\s+)/).map((chunk) => (/^\s+$/.test(chunk) ? "\\s+" : escapeRegExp(chunk))).join("");
  try {
    const re = new RegExp(buildWhitespaceFlexibleRegex(trimmedSel || selectedText));
    const m = re.exec(sourceText);
    if (m) return { index: m.index, matchLength: m[0].length };
  } catch { /* malformed regex — fall through */ }

  // 4. Bold-insensitive match: strip "**" from both the source and the
  //    selection, whitespace-flexible-match the stripped selection against
  //    the stripped source, then map the hit back to the ORIGINAL source
  //    offsets so the caller can still slice/replace the real (bold-marker-
  //    including) text.
  if (sourceText.includes("**") || selectedText.includes("**")) {
    const strippedSel = (trimmedSel || selectedText).replace(/\*\*/g, "");
    if (strippedSel) {
      // Map: index in the "**"-stripped source → index in the original source.
      const strippedToOriginal: number[] = [];
      let stripped = "";
      for (let i = 0; i < sourceText.length; i++) {
        if (sourceText[i] === "*" && sourceText[i + 1] === "*") { i++; continue; }
        stripped += sourceText[i];
        strippedToOriginal.push(i);
      }
      try {
        const re = new RegExp(buildWhitespaceFlexibleRegex(strippedSel));
        const m = re.exec(stripped);
        if (m && m[0].length > 0) {
          const strippedStart = m.index;
          const strippedEnd = m.index + m[0].length - 1;
          const originalStart = strippedToOriginal[strippedStart];
          const originalEndCharIdx = strippedToOriginal[strippedEnd];
          if (originalStart !== undefined && originalEndCharIdx !== undefined) {
            // Extend the end past any trailing "**" that belongs to the same
            // bold span so the located span includes the closing markers.
            let originalEnd = originalEndCharIdx + 1;
            if (sourceText[originalEnd] === "*" && sourceText[originalEnd + 1] === "*") originalEnd += 2;
            return { index: originalStart, matchLength: originalEnd - originalStart };
          }
        }
      } catch { /* malformed regex — fall through */ }
    }
  }

  // 5. Nothing matched — caller keeps its existing alert/fallback behavior.
  return null;
}

// ── Selection Toolbar (Listen / Meaning / AI fix for highlighted text) ────

function VoiceEditToolbar({ allPages, setAllPages, unboldLines, onUnboldChange }: { allPages: PageContent[]; setAllPages: React.Dispatch<React.SetStateAction<PageContent[]>>; unboldLines: Set<string>; onUnboldChange: (next: Set<string>) => void }) {
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
  // Tracks ~40 chars before and after the selection from the rendered DOM.
  // Used by applyEdit to disambiguate when the same text appears in multiple
  // sections of the page (e.g. shabdarth + shlok + anuvad all repeat words).
  const selectionContextRef = useRef<{ before: string; after: string }>({ before: "", after: "" });
  // Snapshotted at selection-change time: whether the current selection sits
  // inside a bold (font-weight ≥ 600 or <strong>) span in the rendered DOM.
  // Used as a fallback when the source-text bold-marker detection fails
  // because the selection only partially overlaps the **...** span.
  const [selectionIsBoldDom, setSelectionIsBoldDom] = useState(false);
  // Whether the selection sits inside a shlok (verse) section — the only place
  // the structural un-bold override applies.
  const [selectionInShlok, setSelectionInShlok] = useState(false);
  // Normalized RENDERED-line keys of the shlok <p>s the selection intersects,
  // captured at selection time. These EXACTLY match the shlok renderer's
  // normalizeBoldKey(sec.lines[j]) keys, so un-bold is immune to OCR-cleaning.
  const selectionShlokKeysRef = useRef<string[]>([]);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // TTS state — matches ShlokSpeaker pattern (loading → playing → stop)
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

  // AI correction suggestion (preview-and-confirm flow)
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<{
    suggested_text: string;
    explanation: string;
    changes: Array<{ from: string; to: string; reason: string }>;
    confidence: "high" | "medium" | "low";
  } | null>(null);
  // Quick AI fix (apply-immediately flow — no preview, no confirmation)
  const [quickFixLoading, setQuickFixLoading] = useState(false);
  // Manual fix mode — opens a textarea + on-screen Devanagari keyboard so the
  // reader can fix typos without needing a Hindi IME installed on their device.
  const [manualFixMode, setManualFixMode] = useState(false);
  const [manualFixText, setManualFixText] = useState("");

  // Cleanup TTS, suggestion & dictionary on unmount or when toolbar hides
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
      // Debounce: wait for selection to stabilise (user stops dragging)
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.toString().trim()) {
          // Don't hide if user is interacting with the toolbar or TTS is playing
          if (!ttsPlaying && !ttsLoading && !toolbarRef.current?.contains(document.activeElement)) {
            setShow(false);
          }
          return;
        }
        const text = sel.toString().trim();
        if (text.length < 2) return;

        // Find which page this selection is in. If the selection crosses a page
        // boundary, prefer the page where MORE of the selection lives — that's
        // the page whose text we'll edit.
        const range = sel.getRangeAt(0);
        const startEl = range.startContainer.parentElement?.closest("[data-page-num]") as HTMLElement | null;
        const endEl = range.endContainer.parentElement?.closest("[data-page-num]") as HTMLElement | null;
        const startPage = startEl ? parseInt(startEl.getAttribute("data-page-num") || "0", 10) : 0;
        const endPage = endEl ? parseInt(endEl.getAttribute("data-page-num") || "0", 10) : 0;
        let pageEl: HTMLElement | null = startEl;
        let pageNum = startPage;
        if (startPage && endPage && startPage !== endPage && startEl && endEl) {
          // Pick whichever page contains more of the selected text
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

        // Capture surrounding context so the replace targets the EXACT occurrence
        // the user highlighted, not a different match earlier on the page.
        // We grab ~40 chars before and after from the page's rendered text.
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
          } catch { /* range walk failed — keep empty contexts */ }
        }

        const rect = range.getBoundingClientRect();
        setPosition({ x: rect.left + rect.width / 2, y: rect.top - 10, bottom: rect.bottom });
        setForceFlipBelow(false);
        setSelectedText(text);
        selectionContextRef.current = { before: ctxBefore, after: ctxAfter };
        pageNumRef.current = pageNum;

        // Detect bold via the rendered DOM: walk up the range's common
        // ancestor and check for <strong>, <b>, or computed font-weight ≥ 600.
        // Catches the case where the source has **हरिः**-- भगवान् ।  but the
        // user selected the whole "हरिः-- भगवान् ।" — markdown-text detection
        // would miss the bold, but the rendered span is still <strong>.
        // Bold detection must work for the natural WHOLE-VERSE gesture too:
        // shloks put font-bold on each per-line <p> but wrap them in a plain
        // <div>, so a multi-line selection's commonAncestorContainer is that
        // NON-bold wrapper. Probe the selection's start/end boundary nodes too,
        // then scan the bold blocks the range actually intersects.
        // Threshold is font-weight >= 700 (Tailwind font-bold = verses) so the
        // font-semibold (600) section labels like "तात्पर्य :" are NOT read as bold;
        // `**` markdown renders as <strong>, still caught by the tag check.
        let domBold = false;
        let shlokKeys: string[] = [];
        try {
          const isBoldFrom = (n: Node | null): boolean => {
            let node: Node | null = n;
            // If a text node, climb to its parent element
            if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
            while (node && node instanceof HTMLElement) {
              const tag = node.tagName?.toUpperCase();
              if (tag === "STRONG" || tag === "B") return true;
              const fw = window.getComputedStyle(node).fontWeight;
              // fontWeight can be "bold" or a numeric string
              if (fw === "bold" || (fw && parseInt(fw, 10) >= 700)) return true;
              // Stop walking once we leave the rendered content tree
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
            // Whole-verse selection: common ancestor is a non-bold wrapper but
            // the selected lines are bold <p>s. Scan the blocks the range hits.
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
          // so the un-bold override is immune to OCR-cleaning (कौ→की, FRINGE/©
          // strips) and page-number stripping that make raw source differ from what
          // is displayed. A sub-line selection still intersects the whole <p>, so it
          // maps to the full-line key; verses are the ONLY structurally-bold content
          // the override applies to, so tatparya/shabdarth never trigger it.
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
        } catch { /* DOM walk failed — leave flags empty */ }
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

  // Click-outside-to-close: if user mousedowns anywhere outside the toolbar,
  // close it. This is independent of the selection-change handler — useful
  // when the user clicks empty whitespace where no selection change fires.
  // (The existing show=false useEffect clears suggestion / dictResult / TTS.)
  useEffect(() => {
    if (!show) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (toolbarRef.current?.contains(target)) return; // click inside toolbar — ignore
      if (ttsPlaying || ttsLoading) return; // let TTS finish
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

    // Strip rendering-only artifacts that the React renderer injects but the
    // raw OCR source doesn't contain — otherwise applyEdit can't find them.
    //   • "तात्पर्य :" prefix added to tatparya section starts
    //   • "· 1587 ·" page-number dividers between pages
    //   • Leading whitespace and surrounding empty lines
    // We adjust BOTH oldText (search target) and newText (replacement) so the
    // user's intended edit lands cleanly on the actual source.
    // Section labels ("तात्पर्य :", "अनुवाद :", "शब्दार्थ :") are injected by the
    // renderer and do NOT exist in page.text. Strip them WHEREVER they appear
    // (interior included, not just the selection start) — keeping any newline so
    // sections stay separate — so a selection spanning e.g. verse → purport still
    // maps to a contiguous run in the source. Only spaces/tabs/nbsp around the
    // label are consumed (not newlines).
    const SECTION_LABEL_RE = /\n[^\S\n]*(?:तात्पर्य|अनुवाद|शब्दार्थ)[^\S\n]*[:：ः][^\S\n]*/gu;
    const stripRenderArtifacts = (s: string): { stripped: string; leftTrim: string; rightTrim: string } => {
      const original = s;
      let leftTrim = "";
      let rightTrim = "";
      let cleaned = s;
      // Leading rendering-only prefixes (only valid at start of selection)
      const leadingRe = /^\s*(?:तात्पर्य\s*[:：]|अनुवाद\s*[:：]|शब्दार्थ\s*[:：])\s*/u;
      const lm = cleaned.match(leadingRe);
      if (lm) {
        leftTrim = lm[0];
        cleaned = cleaned.slice(lm[0].length);
      }
      // Strip embedded page-number dividers anywhere — "· 1587 ·" etc.
      cleaned = cleaned.replace(/\s*[·•∙]\s*\d{1,5}\s*[·•∙]\s*/g, " ").trim();
      // Strip renderer-injected section labels anywhere (interior included).
      cleaned = cleaned.replace(SECTION_LABEL_RE, "\n");
      // Strip surrounding whitespace
      const m2 = cleaned.match(/^(\s*)([\s\S]*?)(\s*)$/);
      if (m2) {
        cleaned = m2[2];
        // Whitespace already accounted for; leftTrim/rightTrim hold prefix/suffix
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
        "Selection is empty after stripping rendering-only text (e.g. 'तात्पर्य :' prefix). Pick the actual content.",
      ), 0);
      return;
    }
    // If we stripped anything from the user's selection, also strip the same
    // prefix/suffix from newText if they wrapped it (e.g. typing the same
    // prefix in their replacement). Otherwise treat newText as-is.
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
    // Mirror the interior section-label strip on the replacement so it matches
    // the (label-free) source span we're about to replace.
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

      // Char class: every quote-like glyph we want to treat as interchangeable.
      // Covers ASCII ' "  curly ' ' " "  low ‚ „  high ‛ ‟  prime ʼ ʻ  grave ` ´
      const QUOTE_CLASS = "[\\u0022\\u0027\\u00B4\\u0060\\u2018\\u2019\\u201A\\u201B\\u201C\\u201D\\u201E\\u201F\\u02BB\\u02BC\\u2032\\u2033]";
      const QUOTE_RE = /["'´`‘’‚‛“”„‟ʻʼ′″]/;

      // Helper: build a regex for arbitrary chunk that's tolerant to
      // whitespace runs, dash variants, danda variants, quote variants,
      // and invisible ZWJ/ZWNJ glue chars common in Devanagari.
      // Devanagari danda `।` / double-danda `॥` and ASCII pipe `|` are commonly
      // swapped by OCR. Same for ASCII colon `:` ↔ Devanagari visarga `ः`.
      // Treat them as interchangeable so the selection matches the source even
      // when the glyphs differ.
      const DANDA_CLASS = "[\\u0964\\u0965\\u007C]";   //  ।  ॥  |
      const VISARGA_CLASS = "[\\u0903\\u003A]";         //  ः  :
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
            // ZWJ/ZWNJ are invisible glue — allow them around any non-space char
            if (ch === "‍" || ch === "‌") return "[\\u200D\\u200C]?";
            return escapeForRegex(ch) + "[\\u200D\\u200C]?";
          })
          .join("");
      };

      let fullNewText = sourceText;

      // STRATEGY 0: Context-anchored replace — find the exact occurrence of
      // `effectiveOld` that has the captured before/after context surrounding it.
      // This disambiguates when the same word appears multiple times on the
      // page (e.g. shabdarth dictionary + shlok + anuvad all use the same word).
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
        } catch { /* lookbehind not supported / regex malformed — fall through */ }
      }

      // STRATEGY 1: Exact replace
      if (fullNewText === sourceText) {
        fullNewText = sourceText.replace(effectiveOld, effectiveNew);
      }

      // STRATEGY 2: Per-character flexible regex
      if (fullNewText === sourceText) {
        try {
          const re = new RegExp(buildFlexibleRegex(effectiveOld));
          fullNewText = sourceText.replace(re, effectiveNew);
        } catch { /* malformed — fall through */ }
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
        const map: number[] = []; // cleaned-index → original-index
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
          .replace(/[॥|]/g, "।")          // double-danda + pipe → single danda
          .replace(/[:]/g, "ः")             // ASCII colon → visarga
          .replace(/["'´`‘’‚‛“”„‟ʻʼ′″]/g, '"')
          .replace(/[‍‌]/g, "")
          .replace(/\s+/g, "");

      // STRATEGY 3: Anchor on first/last 16 stripped chars.
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

      // STRATEGY 4: Word-anchor fallback.
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
        // FALLBACK: try adjacent pages. Sections (tatparya, anuvad, refs to
        // Bhagavad Gita verses, etc.) can flow across page boundaries. The
        // rendered DOM merges them but the source text is still split per
        // page in the OCR — so the captured pageNum might be one page off
        // from where the selection's text actually lives.
        const tryPages = [pageNum - 1, pageNum + 1, pageNum - 2, pageNum + 2];
        for (const tryNum of tryPages) {
          if (tryNum < 1) continue;
          const tryPage = pages.find(p => p.pageNumber === tryNum);
          if (!tryPage) continue;
          const src = tryPage.text;
          let replaced = src.replace(effectiveOld, effectiveNew);
          if (replaced === src) {
            try { replaced = src.replace(new RegExp(buildFlexibleRegex(effectiveOld)), effectiveNew); } catch { /* skip */ }
          }
          if (replaced !== src) {
            console.info(`[applyEdit] matched on adjacent page ${tryNum} (selection-captured page was ${pageNum})`);
            // Use the ADJACENT page's number for both state + persistence
            return [{ pageNumber: tryNum, text: replaced }];
          }
        }

        // STRATEGY 5: Cross-page split. The renderer merges page boundaries
        // (cross-page paragraphs/shlokas), so a selection can legitimately
        // start at the END of one OCR page and continue at the START of the
        // next — no single page contains the whole selection, which is why
        // every strategy above failed. Find the split: the longest suffix of
        // page A's cleaned text that is a prefix of the cleaned selection,
        // with the remainder matching the start of page B's cleaned text.
        // The replacement lands at the end of page A; the consumed prefix of
        // page B is removed.
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
            // Longest k (≥4 cleaned chars on each side) such that
            // cleanedA ends with the selection's first k chars.
            let k = -1;
            const maxK = Math.min(strippedSel.length - 4, A.cleaned.length);
            for (let cand = maxK; cand >= 4; cand--) {
              if (A.cleaned.endsWith(strippedSel.slice(0, cand))) { k = cand; break; }
            }
            if (k < 4) continue;
            const rest = strippedSel.slice(k);
            if (!rest) continue;
            // Page B's OCR source almost always begins with the book's PRINTED
            // page number (e.g. "389\n\n…"), which the renderer strips for display
            // (stripLeadingPageNumber) — so it can never appear in the selection.
            // Comparing raw source against a rendered selection therefore failed
            // here, which is why a sentence running across a page break reported
            // "Couldn't locate the highlighted text". Skip that leading digit run.
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
    if (!edits || edits.length === 0) return; // replace failed — nothing to persist

    // Pure updater — the replacement texts were computed above, outside React.
    // Cross-page splits produce TWO page updates; apply them atomically.
    const editByPage = new Map(edits.map(e => [e.pageNumber, e.text]));
    setAllPages(prev => prev.map(p => editByPage.has(p.pageNumber) ? { ...p, text: editByPage.get(p.pageNumber)! } : p));
    window.getSelection()?.removeAllRanges();
    setAppliedFlash(true);
    setTimeout(() => setAppliedFlash(false), 1500);

    // Persist directly to Supabase — one row per touched page. If the
    // adjacent-page fallback matched a different page than the selection
    // started on, edits[].pageNumber already carries THAT page number;
    // cross-page splits persist both pages.
    for (const edit of edits) {
      try {
        const res = await sbFetch("bhagavatam_page_edits", {
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
          alert(`Save failed (page ${edit.pageNumber}): ${data || res.statusText}`);
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

  // Listen to selected word via Sarvam HTTP streaming TTS — real-time playback
  const listenToWord = useCallback(async () => {
    if (!selectedText) return;

    // Stop if already playing or loading (toggle behaviour)
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
      // Stream from Sarvam Bulbul v3 via HTTP streaming (real-time playback)
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
      // Log the real reason so we can debug — was silently swallowed before.
      console.error("[TTS] Sarvam playback failed:", err);
      setTtsLoading(false);
      const errMsg = err instanceof Error ? err.message : String(err);
      // Surface obvious failures so the user knows something happened
      if (/40\d/.test(errMsg)) {
        alert(`Listen failed: ${errMsg}. The Sarvam API may need a new key.`);
        return;
      }
      // Fallback to browser SpeechSynthesis (often poor Hindi quality, but
      // something is better than silent failure)
      const utterance = new SpeechSynthesisUtterance(selectedText);
      utterance.lang = "hi-IN";
      utterance.rate = 0.7;
      utterance.pitch = 0.8;
      const voices = window.speechSynthesis.getVoices();
      const pick = voices.find(v => v.lang === "sa-IN")
        || voices.find(v => v.lang.startsWith("hi") && !/female|lekha|priya|swati|woman/i.test(v.name))
        || voices.find(v => v.lang.startsWith("hi"));
      if (pick) utterance.voice = pick;
      else console.warn("[TTS] No Hindi voice available in browser fallback");
      utterance.onend = () => setTtsPlaying(false);
      window.speechSynthesis.speak(utterance);
      setTtsPlaying(true);
    }
  }, [selectedText, ttsPlaying]);

  // AI Correction — calls Supabase Edge Function (laptop-independent).
  // Pulls 200 chars of context before & after the selection from the page text
  // so Claude can spot missing words and OCR errors using surrounding meaning.
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
          // 600 chars context per side — gives Claude enough surrounding text
          // to detect section transitions (शब्दार्थ → अनुवाद → तात्पर्य) and
          // make accurate formatting decisions (paragraph breaks, bold heads).
          contextBefore = page.text.substring(Math.max(0, loc.index - 600), loc.index);
          contextAfter = page.text.substring(loc.index + loc.matchLength, loc.index + loc.matchLength + 600);
        }
      }
    }
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/bhagavatam-correct-text`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          selected_text: selectedText,
          context_before: contextBefore,
          context_after: contextAfter,
          page_number: pageNum,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`AI suggest failed: ${err.error || res.statusText}`);
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

  // Quick AI fix — calls the same correction endpoint as requestSuggestion,
  // but applies the suggested text immediately without showing the preview
  // panel. Designed so the reader can highlight a wonky stretch, tap the
  // button, and keep reading — the fix lands in the background and the
  // toolbar closes itself.
  //
  // Failure mode: errors are logged to console.warn (no alert/modal) so a
  // silent network hiccup doesn't break flow. The user can always fall back
  // to the regular AI fix button if they want to see what changed.
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
    // Snapshot the selection now — applyEdit is async and React may
    // unmount the toolbar before the response lands.
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
          selected_text: oldText,
          context_before: contextBefore,
          context_after: contextAfter,
          page_number: pageNum,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.warn("Quick AI fix failed:", err.error || res.statusText);
        return;
      }
      const data = await res.json();
      const newText = tidyAiText((data?.suggested_text || "").trim(), selectionInShlok);
      // Close the toolbar straight away so reading isn't interrupted.
      setShow(false);
      if (newText && newText !== oldText) {
        void applyEdit(oldText, newText);
        recordUndo(oldText, newText, pageNum);
      }
    } catch (err) {
      console.warn("Quick AI fix error:", err);
    } finally {
      setQuickFixLoading(false);
      stopAiGlow();
    }
  }, [selectedText, allPages, quickFixLoading, suggestLoading, applyEdit, recordUndo]);

  // Bold/unbold detection — true if the selection is bolded by ANY signal:
  //   1. Selection literally contains the **...** markers
  //   2. Source has **<exact selection>** somewhere
  //   3. Selection text contains a **...** span inside it (partial overlap)
  //   4. Selection sits inside an unclosed ** in source (count of ** before
  //      the selection is odd → we're inside an open bold span)
  //   5. Fallback: rendered DOM ancestor is <strong>/<b> or has font-weight≥600
  const isCurrentSelectionBold = useMemo(() => {
    if (!selectedText) return false;
    // Cheap text-based checks first
    if (selectedText.startsWith("**") && selectedText.endsWith("**") && selectedText.length >= 4) return true;
    if (selectedText.includes("**")) return true;
    const pageNum = pageNumRef.current;
    const page = pageNum ? allPages.find(p => p.pageNumber === pageNum) : null;
    if (page) {
      if (page.text.includes(`**${selectedText}**`)) return true;
      // Source has a bold span that overlaps / contains the selection.
      // BUG 2 fix: robust locator instead of brittle indexOf.
      const loc = locateSelectionInSource(page.text, selectedText);
      if (loc) {
        const before = page.text.substring(0, loc.index);
        const starsBefore = (before.match(/\*\*/g) || []).length;
        if (starsBefore % 2 === 1) return true; // inside an open bold span
      }
    }
    // Last resort: trust the rendered DOM
    return selectionIsBoldDom;
  }, [selectedText, allPages, selectionIsBoldDom]);

  // Strip bold markers from the selection. Handles every shape:
  //   - **selection**            → peel the wrapping markers
  //   - selection contains **    → strip every `**` inside the selection
  //   - **A**sel**B**            → strip all bold spans that overlap selection
  //   - selection inside **X**   → strip the surrounding bold span markers
  // The reverse path (plain → bold) only fires when no overlap is found.
  const toggleBold = useCallback(() => {
    pulseAiGlow();
    if (!selectedText) return;
    const pageNum = pageNumRef.current;
    const page = pageNum ? allPages.find(p => p.pageNumber === pageNum) : null;

    // CASE A — selection literally wraps the markers: peel them off
    if (selectedText.startsWith("**") && selectedText.endsWith("**") && selectedText.length >= 4) {
      void applyEdit(selectedText, selectedText.slice(2, -2));
      setShow(false);
      return;
    }

    // CASE B — selection contains stray ** anywhere inside: strip them all
    if (selectedText.includes("**")) {
      void applyEdit(selectedText, selectedText.replace(/\*\*/g, ""));
      setShow(false);
      return;
    }

    if (page) {
      // CASE C — source has **selection** exactly: unwrap the pair
      if (page.text.includes(`**${selectedText}**`)) {
        void applyEdit(`**${selectedText}**`, selectedText);
        setShow(false);
        return;
      }

      // CASE D — find any **...** spans that overlap the selection in source.
      // Covers all three remaining shapes: selection is inside the span,
      // span is inside selection, or selection starts/ends mid-span.
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
          // Replace ONE contiguous chunk that contains the selection and all
          // overlapping bold spans, with the same chunk stripped of `**`.
          // This keeps applyEdit's single-source-replace contract intact.
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

    // CASE E — structural verse bold. Shlok verses render bold via CSS
    // (font-bold), not `**`, so there are no markers to strip. Toggle a per-line
    // "un-bold" override, gated on the selection actually being INSIDE a shlok
    // (so tatparya/shabdarth never trigger it). Keys are the rendered <p> line
    // texts captured at selection time (match the renderer exactly). Direction
    // follows the button's own signal — selectionIsBoldDom true ("Remove bold")
    // un-bolds every selected verse line; false ("Make bold") restores them — so a
    // mixed selection can never invert into re-bolding what the user asked to lighten.
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

    // CASE F — plain text → bold it
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
  // Stores the highlighted passage in `reader_scenes` so an image can be generated
  // from it later. Distinct from the AI-extracted *_chapter_scenes: these are
  // human-chosen spans, and the Gallery lists them with their generation status.
  const [sceneSaving, setSceneSaving] = useState(false);
  const [sceneSaved, setSceneSaved] = useState(false);
  const saveScene = useCallback(async () => {
    if (!selectedText || sceneSaving) return;
    setSceneSaving(true);
    try {
      const res = await sbFetch("reader_scenes", {
        method: "POST",
        body: JSON.stringify({
          book: "bhagavatam",
          page_number: pageNumRef.current,
          selected_text: selectedText,
          device_id: localStorage.getItem("bhagwatham_device_id") || null,
          reader_id: localStorage.getItem("bhagwatham_reader_id") || null,
        }),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        alert(`Couldn't save the scene.\n${msg || res.statusText}`);
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

  // Word-doc style edits on the selection:
  // - "New line" pushes the selection onto its own line (newline before it).
  // - "Join" removes the spaces inside the selection (fixes wrongly-split words).
  const insertLineBreak = useCallback(() => {
    pulseAiGlow();
    if (!selectedText) return;
    const trimmed = selectedText.replace(/^\s+/, "");
    // Prefix a paragraph break (blank line) so the selected text starts a new
    // paragraph. The renderer only recognises section breaks on blank lines —
    // a single `\n` got eaten by the prose-paragraph parser.
    applyEdit(selectedText, "\n\n" + trimmed);
    setShow(false);
  }, [selectedText, applyEdit]);

  const removeSpaces = useCallback(() => {
    pulseAiGlow();
    if (!selectedText) return;
    const joined = selectedText.replace(/\s+/g, "");
    if (joined === selectedText) return; // nothing to remove
    applyEdit(selectedText, joined);
    setShow(false);
  }, [selectedText, applyEdit]);

  // Dictionary lookup state
  const [dictResult, setDictResult] = useState<{ word: string; meaning: string; examples: string[] } | null>(null);
  const [dictLoading, setDictLoading] = useState(false);

  const lookupWord = useCallback(async () => {
    if (!selectedText || selectedText.length > 50) return;
    setDictLoading(true);
    setDictResult(null);
    try {
      // Try server-side Claude dictionary first (works in dev mode)
      const res = await fetch("/api/bhagwatham/dictionary", {
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
    } catch { /* server not available — expected on Vercel */ }
    // Fallback: open Shabdkosh dictionary in new tab
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

  // When the AI suggestion OR manual-fix keyboard is open, lock the toolbar to
  // the screen centre so the full panel (Original / Suggested / Changes /
  // buttons OR textarea + Devanagari keyboard) is always visible. Otherwise
  // anchor near the selection: above by default, flipping below if there isn't
  // enough room above.
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
      {/* Backdrop dimming the page when the suggestion panel is open —
          makes the centred modal stand out and gives a click-out target. */}
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
        {(
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
            {/* Action buttons row — preventDefault stops clicks from collapsing text selection */}
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
                title="Remove the spaces between these words (fix wrongly split words)"
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
                title="Edit this text yourself with an on-screen Devanagari keyboard — no Hindi IME needed"
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
            {/* AI suggestion panel — appears when Claude has returned a correction */}
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

                {/* Original — whitespace-pre-wrap preserves OCR line breaks */}
                <div className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold mb-0.5">Original</div>
                <div className="text-sm text-stone-700 mb-2.5 px-2.5 py-1.5 bg-white border border-red-200 rounded line-through decoration-red-400 break-words whitespace-pre-wrap" lang="hi">
                  {selectedText}
                </div>

                {/* Suggested — renders \n as line breaks and **...** as bold */}
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
                      // Snapshot values before clearing — applyEdit is async
                      const oldText = selectedText;
                      const newText = suggestion.suggested_text;
                      const pn = pageNumRef.current;
                      setSuggestion(null);
                      // Keep toolbar open so user can immediately fix more text
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
            {/* Manual fix panel — textarea + on-screen Devanagari keyboard */}
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
            {/* Edit input — single-line quick edit using the user's own keyboard */}
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
        )}
        {/* Dictionary result */}
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

// ── Shlok Text-to-Speech ────────────────────────────────────────────────────

function ShlokSpeaker({ text, themeKey }: { text: string; themeKey: string }) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const speak = useCallback(async () => {
    // Stop if already playing or loading
    if (playing || audioRef.current) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        if (audioRef.current.src) URL.revokeObjectURL(audioRef.current.src);
        audioRef.current = null;
      }
      window.speechSynthesis.cancel();
      setPlaying(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Stream from Sarvam Bulbul v3 via HTTP streaming (real-time playback)
      const audio = await sarvamStreamPlay(text);
      audioRef.current = audio;
      setPlaying(true);
      setLoading(false);

      audio.onended = () => {
        setPlaying(false);
        if (audio.src) URL.revokeObjectURL(audio.src);
        audioRef.current = null;
      };
      audio.onerror = () => {
        console.error("[ShlokSpeaker] audio element error", audio.error);
        setPlaying(false);
        if (audio.src) URL.revokeObjectURL(audio.src);
        audioRef.current = null;
      };
    } catch (err) {
      console.error("[ShlokSpeaker] Sarvam playback failed:", err);
      // Fallback to browser SpeechSynthesis
      setLoading(false);
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "hi-IN";
      utterance.rate = 0.7;
      utterance.pitch = 0.8;
      const voices = window.speechSynthesis.getVoices();
      const pick = voices.find(v => v.lang === "sa-IN")
        || voices.find(v => v.lang.startsWith("hi") && !/female|lekha|priya|swati|woman/i.test(v.name))
        || voices.find(v => v.lang.startsWith("hi"));
      if (pick) utterance.voice = pick;
      utterance.onend = () => setPlaying(false);
      window.speechSynthesis.speak(utterance);
      setPlaying(true);
    }
  }, [text, playing]);

  // Cleanup on unmount
  useEffect(() => () => { audioRef.current?.pause(); window.speechSynthesis.cancel(); }, []);

  return (
    <button
      onClick={speak}
      className={`inline-flex items-center justify-center w-7 h-7 rounded-full transition-all shrink-0 ${
        loading
          ? "bg-stone-100 text-stone-400 cursor-wait"
          : playing
            ? "bg-red-100 text-red-600 hover:bg-red-200"
            : themeKey === "dark" ? "bg-stone-700/50 text-stone-300 hover:bg-stone-600/50" : "bg-stone-100 text-stone-500 hover:bg-stone-200"
      }`}
      title={loading ? "Loading..." : playing ? "Stop" : "Listen to shlok"}
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : playing ? <Square className="w-3 h-3" /> : <Volume2 className="w-3.5 h-3.5" />}
    </button>
  );
}

// ── Content Renderer ───────────────────────────────────────────────────────────

function RenderContent({ text, textEn, lang, chapterImages, themeKey = "light", onRegenerateImages, regeneratingChapters, queuedRegens, onDeleteImage, chapterNumMapper, pageNumber, overrides, onOverridesChange, prevPageEndKind, nextPageStartsNumberedShlok, unboldLines, sceneArt }: { text: string; textEn?: string; lang: "hi" | "en"; chapterImages?: Map<number, Array<{ url: string; description: string; sceneIndex?: number; isInstagram?: boolean }>>; themeKey?: Theme; onRegenerateImages?: (chapterNum: number) => void; regeneratingChapters?: Set<number>; queuedRegens?: Set<number>; onDeleteImage?: (chapterNum: number, sceneIndex: number) => void; chapterNumMapper?: (perSkandhNum: number) => number; pageNumber?: number; overrides?: SectionOverride[]; onOverridesChange?: (pageNum: number, overrides: SectionOverride[]) => void; prevPageEndKind?: string; nextPageStartsNumberedShlok?: boolean; unboldLines?: Set<string>; sceneArt?: Array<{ id: number; key: string; image_url: string }> }) {
  const t = THEME_STYLES[themeKey];

  // ── Section Editor state ────────────────────────────────────────────
  // Hooks MUST be declared unconditionally before the English-mode early
  // return below — otherwise toggling `lang` changes the hook order between
  // renders and React crashes.
  const [editMode, setEditMode] = useState(false);
  const [selStart, setSelStart] = useState<number | null>(null);
  const [selEnd, setSelEnd] = useState<number | null>(null);

  // If English selected and translation available, show English as plain text
  if (lang === "en" && textEn) {
    // Still parse chapter headings from Hindi for anchors/images
    const hiLines = cleanOcrText(text).split("\n").filter((l) => l.trim() && !isStandalonePageNumber(l));
    const chapterAnchors: { chapterNum: number; line: string }[] = [];
    for (const raw of hiLines) {
      const t = raw.trim();
      if (isChapterHeading(t)) {
        const hindiLine = toHindiChapterLine(t);
        const chapNum = extractChapterNum(hindiLine);
        if (chapNum > 0) chapterAnchors.push({ chapterNum: chapNum, line: hindiLine });
      }
    }

    const enLines = textEn.split("\n")
      .filter((l) => l.trim() && !isStandalonePageNumber(l))
      .map((l) => stripLeadingPageNumber(l));
    return (
      <div className="space-y-4">
        {chapterAnchors.map((ch) => {
          const globalNum = ch.chapterNum && chapterNumMapper ? chapterNumMapper(ch.chapterNum) : ch.chapterNum;
          const allImgs = globalNum ? chapterImages?.get(globalNum) : undefined;
          const regularImgs = allImgs?.filter(img => !img.isInstagram);
          const igImgs = allImgs?.filter(img => img.isInstagram);
          return (
            <div key={globalNum} id={`chapter-${globalNum}`} className="mt-6 mb-4 scroll-mt-20">
              <h3 className={`font-serif text-xl sm:text-2xl font-bold ${t.text} mb-3 pb-2 border-b-2 border-orange-300/50`}>
                {ch.line}
              </h3>
              {regularImgs && regularImgs.length > 0 && (
                <div className="my-6 flex flex-col gap-5">
                  {regularImgs.map((img, idx) => (
                    <ImageCard key={idx} img={img} alt={`${ch.line} — दृश्य ${idx + 1}`} />
                  ))}
                </div>
              )}
              {igImgs && igImgs.length > 0 && (
                <div className="my-6 space-y-5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-pink-600/70">Scene Gallery</p>
                  {igImgs.map((img, idx) => (
                    <div key={idx} className="rounded-2xl overflow-hidden shadow-lg border border-stone-200/60 bg-white">
                      <div className="relative">
                        <img src={img.url} alt={`Scene ${idx + 1}`} className="w-full object-cover" loading="lazy" />
                        <div className="absolute top-3 left-3 bg-black/50 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1 rounded-full">Scene {idx + 1}</div>
                      </div>
                      <div className="px-4 py-3">
                        <p className="text-sm text-stone-600 leading-relaxed">{img.description}</p>
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-stone-100">
                          <a href={img.url} download={`bhagavatam-scene-${idx + 1}.jpg`} className="flex items-center gap-1.5 text-[11px] font-medium text-stone-500 hover:text-orange-600 px-2.5 py-1.5 rounded-lg hover:bg-stone-50 transition-colors">
                            <Download className="w-3.5 h-3.5" /> Download
                          </a>
                          <button onClick={() => { if (navigator.share) navigator.share({ title: `Scene ${idx + 1}`, text: img.description, url: img.url }).catch(() => {}); else navigator.clipboard.writeText(img.url).then(() => alert("Link copied!")); }} className="flex items-center gap-1.5 text-[11px] font-medium text-stone-500 hover:text-orange-600 px-2.5 py-1.5 rounded-lg hover:bg-stone-50 transition-colors">
                            <Share2 className="w-3.5 h-3.5" /> Share
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {(() => {
          const renderedEnLines = renderInlineBoldBlock(enLines); // bold state carries across lines
          return enLines.map((l, i) => (
            <p key={i} className={`leading-[1.8] ${t.text} mb-1`}>{renderedEnLines[i]}</p>
          ));
        })()}
      </div>
    );
  }

  // Blank lines are kept as "" markers: they are the ONLY record of where real
  // paragraphs end. Dropping them merged a whole purport into one run of lines,
  // and since each line was rendered as its own <p>, prose could not reflow —
  // at larger font sizes every print line wrapped and left an orphan fragment.
  const lines = cleanOcrText(text).split("\n")
    .map((l) => (l.trim() ? stripLeadingPageNumber(l) : ""))
    .filter((l) => l === "" || !isStandalonePageNumber(l));

  type Section = { kind: "chapter" | "shlok" | "ref-shlok" | "shabdarth" | "anuvad" | "tatparya" | "text"; lines: string[]; chapterNum?: number };
  const sections: Section[] = [];
  // Continue the previous page's section kind across page boundaries
  const continuableKinds = ["tatparya", "anuvad", "ref-shlok", "shlok", "shabdarth"];
  const initialKind = (prevPageEndKind && continuableKinds.includes(prevPageEndKind)) ? prevPageEndKind as Section["kind"] : "text";
  let current: Section = { kind: initialKind, lines: [] };

  const flush = () => { if (current.lines.length > 0) sections.push(current); };

  // Helper: check if a line looks like a Sanskrit verse line (not Hindi prose)
  // Key insight: Sanskrit shlokas use case endings (inflections), NOT Hindi postpositions.
  // Hindi prose uses postpositions like का, की, के, को, में, पर, से, ने as separate words.
  // If a line has 2+ Hindi postpositions, it's definitely prose.
  const countHindiPostpositions = (line: string): number => {
    const matches = line.match(/(?:^|\s)(?:का|की|के|को|में|पर|से|ने|तक|और|या|भी|तो|ही|यह|वह|जो|इस|उस|कि|जब|तब|नहीं|प्रति|बिना|साथ|लिए|बारे|जैसे|क्योंकि|इसलिए|फिर|अभी|कभी|सभी|किसी|अपने|उनके|इनके|जिसमें|जिससे|जिसको)(?:\s|[।,;:\)]|$)/gu);
    return matches ? matches.length : 0;
  };
  const HINDI_VERB_RE = /(?:है[ँं]?|हैं|हैँ|था|थे|थी|गया|गयी|गई|किया|करें|करे|रहा|सकता|चाहिए|हुई|हुए|होता|होती|होते|करते|करता|करना|बताया|कहा|सुना|दिया|लिया|पड़ा|आया|चुके|चुका|रहे|रही|जाता|जाती|जाते|मिलता|रखा|बचा|डाला|बनाकर|कहलाता|कहलाती|सकती|सकते|देखे|लगती|लगते|भोगता|जानता|उठाते|करोगे|करेगा|करेगी|करेंगे|दिखाया|सुनाया|बैठकर|होकर|करके|लाकर|जाकर|दिखाते|चलाते|बताते|सुनाते|पालते|रहते|चलते|बनाते|मानते|जानते|कहते|देते|लेते|आते|होनी|चाहती|चाहते|पाते|दिखती|मिलती|बनती|चलती|आती|पाती)(?:\s|[।,;:\)]|$)/u;

  // ── Positive Sanskrit signals ──────────────────────────────────────────
  // Visarga (ः) count — strong Sanskrit marker, Hindi almost never uses it
  const countVisarga = (line: string): number => (line.match(/ः/gu) || []).length;
  // Sanskrit particles — indeclinables common in shlokas
  const SANSKRIT_PARTICLES_RE = /(?:^|\s)(?:च|एव|हि|तु|अपि|वै|न|यदा|तदा|तथा|इति|किम्|तत्|एषः|सः|यः|अथ|परम्)(?:\s|[।॥,;:\)]|$)/gu;
  const countSanskritParticles = (line: string): number => {
    const matches = line.match(SANSKRIT_PARTICLES_RE);
    return matches ? matches.length : 0;
  };
  // Sanskrit inflectional endings — case suffixes rarely seen in Hindi
  const countSanskritEndings = (line: string): number => {
    const matches = line.match(/(?:स्य|ेन|ाय|ात्|ेषु|ानाम्|ेभ्यः|ाभिः|ायाः|म्\s)/gu);
    return matches ? matches.length : 0;
  };
  // Combined Sanskrit score for a line
  const sanskritScore = (line: string): number =>
    countVisarga(line) * 4 + countSanskritParticles(line) * 3 + countSanskritEndings(line) * 3;

  const isVerseLike = (line: string) => {
    if (line.length > 120 || line.length < 5) return false;
    const dev = (line.match(/[\u0900-\u097F]/gu) || []).length;
    const total = line.replace(/\s/g, "").length;
    if (total === 0 || dev / total < 0.7) return false;
    if (/^(तात्पर्य|शब्दार्थ|अनुवाद)/u.test(line)) return false;
    if ((line.includes("—") || line.includes("--")) && line.includes(";")) return false; // shabdarth

    const hindiPP = countHindiPostpositions(line);
    const hasHindiVerb = HINDI_VERB_RE.test(line);
    const sScore = sanskritScore(line);

    // Strong Sanskrit signals can override weak Hindi signals
    // e.g. a line with 1 postposition but 2 visargas is likely Sanskrit
    if (sScore >= 8) return true; // strong Sanskrit morphology — definitely verse

    // Hindi postposition count: 2+ means definitely Hindi prose, not Sanskrit
    if (hindiPP >= 2) return false;
    // Hindi verb detection
    if (hasHindiVerb) {
      // But if Sanskrit score is decent, it might be a mixed line in verse context
      if (sScore >= 4) return true;
      return false;
    }
    return true;
  };

  // Helper: lookahead to check if ॥ appears within the next N lines
  // Keep maxLook tight (3) to avoid pulling in Hindi prose before the next shlok
  const hasDoubleViramAhead = (fromIdx: number, maxLook: number = 3) => {
    for (let j = fromIdx; j < Math.min(lines.length, fromIdx + maxLook); j++) {
      const lt = lines[j].trim();
      if (/॥/u.test(lt)) return true;
      // Stop looking if we hit a section marker or Hindi prose
      if (/^(तात्पर्य|शब्दार्थ|अनुवाद)/u.test(lt)) return false;
      if (isChapterHeading(lt)) return false;
      if (HINDI_VERB_RE.test(lt) || countHindiPostpositions(lt) >= 2) return false;
    }
    return false;
  };

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    // A blank line closes the current paragraph: flush it as its own section of
    // the SAME kind, so a multi-paragraph purport stays multi-paragraph while each
    // paragraph can be rendered as one reflowing block.
    if (!t) {
      if (current.lines.length > 0) { const k = current.kind; flush(); current = { kind: k, lines: [] }; }
      continue;
    }

    if (isChapterHeading(t)) {
      flush();
      const hindiLine = toHindiChapterLine(t);
      const chapNum = extractChapterNum(hindiLine);
      sections.push({ kind: "chapter", lines: [hindiLine], chapterNum: chapNum });
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
      // If the previous section was "text", "ref-shlok", or "shlok", reclassify as main shlok.
      // Shabdarth ALWAYS follows a main shlok — never a ref-shlok or plain text.
      if (sections.length > 0 && (sections[sections.length - 1].kind === "text" || sections[sections.length - 1].kind === "ref-shlok")) {
        sections[sections.length - 1].kind = "shlok";
      }
      current = { kind: "shabdarth", lines: [] };
      continue;
    }

    // Line contains ॥ — shlok or ref-shlok
    // If inside tatparya: ref-shlok UNLESS it has a verse number (e.g. ॥ ३१ ॥)
    // Numbered verses are ALWAYS main shloks — ref-shloks are unnumbered citations
    if (/॥/u.test(t) && t.length < 200) {
      const hasVerseNumber = /॥\s*[\d१२३४५६७८९०]+\s*॥/u.test(t);
      const shlokKind = (!hasVerseNumber && (current.kind === "tatparya" || current.kind === "ref-shlok")) ? "ref-shlok" : "shlok";
      if (current.kind !== "shlok" && current.kind !== "ref-shlok") {
        flush();
        current = { kind: shlokKind, lines: [] };
      } else if (hasVerseNumber && current.kind === "ref-shlok") {
        // Numbered verse found — this entire block is a main shlok, not ref-shlok
        current.kind = "shlok";
        // Also fix any preceding ref-shlok section that's part of this verse
        if (sections.length > 0 && sections[sections.length - 1].kind === "ref-shlok") {
          sections[sections.length - 1].kind = "shlok";
        }
      }
      current.lines.push(t);
      continue;
    }

    // Already in a shlok — continue if line looks verse-like
    if ((current.kind === "shlok" || current.kind === "ref-shlok") && isVerseLike(t)) {
      current.lines.push(t);
      continue;
    }

    // Not yet in shlok — check if this verse-like line has ॥ ahead (lookahead)
    if (current.kind !== "shlok" && current.kind !== "ref-shlok" && isVerseLike(t) && hasDoubleViramAhead(i + 1)) {
      const shlokKind = current.kind === "tatparya" ? "ref-shlok" : "shlok";
      flush();
      current = { kind: shlokKind, lines: [t] };
      continue;
    }

    // Half-shloka at end of page — verse-like line ending in single ।, no ॥ ahead
    // (because the closing half is on the next page). Open a shlok section so
    // prevPageEndKind="shlok" carries the continuation forward.
    if (current.kind !== "shlok" && current.kind !== "ref-shlok" && isHalfShlokaLine(t)) {
      const shlokKind = (current.kind === "tatparya") ? "ref-shlok" : "shlok";
      flush();
      current = { kind: shlokKind, lines: [t] };
      continue;
    }

    if (current.kind === "shabdarth") {
      // Shabdarth lines have dashes (—, --, -) and/or semicolons
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

      // "अनुवाद" label inside shabdarth — check if next lines are still shabdarth
      if (/^अनुवाद/u.test(t)) {
        const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : "";
        const nextHasDash = nextLine.includes("—") || nextLine.includes("--") || /\S-\s/.test(nextLine);
        const nextHasSemicolon = nextLine.includes(";");
        if (nextHasDash || nextHasSemicolon) {
          // Next line is still shabdarth — skip the "अनुवाद" label, keep parsing as shabdarth
          continue;
        }
      }

      // No dashes or semicolons — this is anuvad text
      flush();
      current = { kind: "anuvad", lines: [t] };
      continue;
    }

    // Stay in anuvad until tatparya, new shlok, or chapter heading
    if (current.kind === "anuvad") {
      current.lines.push(t);
      continue;
    }

    if (current.kind === "shlok") {
      flush();
      current = { kind: "anuvad", lines: [t] };
      continue;
    }

    // After a ref-shlok (inside tatparya), return to tatparya
    if (current.kind === "ref-shlok") {
      flush();
      current = { kind: "tatparya", lines: [t] };
      continue;
    }

    current.lines.push(t);
  }
  flush();

  // ── Post-process: merge "text" sections that precede "shlok" into the shlok ──
  // Fixes shloks split across pages or where first lines lack ॥ markers
  for (let si = 0; si < sections.length - 1; si++) {
    if (sections[si].kind === "text" && sections[si + 1].kind === "shlok") {
      const textLines = sections[si].lines;
      // Merge if text lines have NO Hindi verbs (है, हैं, था, etc.) — they're likely Sanskrit
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

  // ── Cross-page reconciliation: trailing ref-shlok → shlok ───────────
  // If the next page begins with a numbered shlok continuation (e.g. `॥ ११ ॥`),
  // any trailing ref-shlok on this page is actually the first half of that
  // numbered verse. Promote it to "shlok" so both halves render with matching
  // styling (bold, no left border, no italic-brown indent).
  // Guard: only fire when the trailing section's last line is a half-shloka
  // (single danda, no ॥) — complete cited ref-shloks must remain ref-shlok.
  // Runs BEFORE overrides so the section editor sees the corrected default and
  // any explicit user override still wins.
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

  // ── Apply manual overrides ──────────────────────────────────────────
  // If overrides exist for this page, rebuild sections using them.
  // Override lines replace auto-detected types for the specified ranges.
  if (overrides && overrides.length > 0) {
    // Build a line-level type map from auto-detected sections
    const lineTypes: SectionKind[] = [];
    const lineTexts: string[] = [];
    for (const sec of sections) {
      for (const l of sec.lines) {
        lineTypes.push(sec.kind === "chapter" || sec.kind === "ref-shlok" ? sec.kind as unknown as SectionKind : sec.kind as SectionKind);
        lineTexts.push(l);
      }
    }
    // Apply overrides
    for (const ov of overrides) {
      for (let li = ov.startLine; li <= Math.min(ov.endLine, lineTypes.length - 1); li++) {
        lineTypes[li] = ov.kind;
      }
    }
    // Rebuild sections from lineTypes
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

  // ── Section Editor (inline) — state hooks live at the top of the component ──
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
      // Extend or set range
      setSelEnd(lineIdx);
    }
  };

  const applyKind = (kind: SectionKind) => {
    if (selStart === null || selEnd === null || !pageNumber || !onOverridesChange) return;
    const s = Math.min(selStart, selEnd);
    const e = Math.max(selStart, selEnd);
    const newOverride: SectionOverride = { startLine: s, endLine: e, kind };
    const existing = overrides || [];
    // Remove any overlapping overrides, then add the new one
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
              <Undo2 className="w-3 h-3 inline mr-1" />Clear All
            </button>
          )}
        </div>

        {/* Type buttons — shown when selection active */}
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

        {/* Lines */}
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

  return (
    <div className="space-y-5 group/page relative">
      {/* Edit mode toggle — bottom-right to avoid overlapping speaker buttons */}
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
        // An approved illustration renders directly above the passage it depicts.
        const art = sceneArt?.find(a => {
          const body = sceneKeyOf(sec.lines.join(" "));
          return body.length > 0 && (body.startsWith(a.key) || a.key.startsWith(body.slice(0, 40)));
        });
        const artEl = art ? (
          <figure key={`art-${art.id}`} className="my-5">
            <img src={art.image_url} alt="" loading="lazy"
              className="w-full max-w-md mx-auto rounded-xl border border-orange-200/60 shadow-sm" />
          </figure>
        ) : null;
        const withArt = (node: React.ReactNode) =>
          artEl ? <React.Fragment key={i}>{artEl}{node}</React.Fragment> : node;
        return withArt((() => {
        switch (sec.kind) {
          case "chapter": {
            const globalNum = sec.chapterNum && chapterNumMapper ? chapterNumMapper(sec.chapterNum) : sec.chapterNum;
            const allImgs = globalNum ? chapterImages?.get(globalNum) : undefined;
            const regularImgs = allImgs?.filter(img => !img.isInstagram);
            const igImgs = allImgs?.filter(img => img.isInstagram);
            return (
              <div key={i} id={`chapter-${globalNum}`} data-section-type="chapter" className="mt-6 mb-4 scroll-mt-20">
                <h3 className={`text-xl sm:text-2xl font-bold ${t.text} mb-3 pb-2 border-b-2 border-orange-300/50`} style={{ fontFamily: "var(--font-devanagari)" }}>
                  {sec.lines.join(" ")}
                </h3>
                {regularImgs && regularImgs.length > 0 && (
                  <div className="my-6 flex flex-col gap-5">
                    {regularImgs.map((img, idx) => (
                      <div key={idx} className="relative group">
                        <ImageCard img={img} alt={`${sec.lines.join(" ")} — दृश्य ${idx + 1}`} />
                        {onDeleteImage && globalNum && (
                          <button
                            onClick={() => onDeleteImage(globalNum!, img.sceneIndex ?? idx)}
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-red-600/80 hover:bg-red-700 text-white rounded-full p-1.5"
                            title="Delete image"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {/* Instagram scene gallery — vertical storyline with share/download/delete */}
                {igImgs && igImgs.length > 0 && (
                  <div className="my-6 space-y-5">
                    <p className={`text-[11px] font-semibold uppercase tracking-wider ${themeKey === "dark" ? "text-pink-400/70" : "text-pink-600/70"}`}>
                      Scene Gallery
                    </p>
                    {igImgs.map((img, idx) => (
                      <div key={idx} className="rounded-2xl overflow-hidden shadow-lg border border-stone-200/60 bg-white">
                        <div className="relative">
                          <img src={img.url} alt={`Scene ${idx + 1}`} className="w-full object-cover" loading="lazy" />
                          <div className="absolute top-3 left-3 bg-black/50 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1 rounded-full">
                            Scene {idx + 1}
                          </div>
                        </div>
                        <div className="px-4 py-3">
                          <p className="text-sm text-stone-600 leading-relaxed">{img.description}</p>
                          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-stone-100">
                            <a
                              href={img.url}
                              download={`bhagavatam-scene-${globalNum}-${idx + 1}.jpg`}
                              className="flex items-center gap-1.5 text-[11px] font-medium text-stone-500 hover:text-orange-600 px-2.5 py-1.5 rounded-lg hover:bg-stone-50 transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" /> Download
                            </a>
                            <button
                              onClick={() => {
                                if (navigator.share) {
                                  navigator.share({ title: `Srimad Bhagavatam — Scene ${idx + 1}`, text: img.description, url: img.url }).catch(() => {});
                                } else {
                                  navigator.clipboard.writeText(img.url).then(() => alert("Link copied!"));
                                }
                              }}
                              className="flex items-center gap-1.5 text-[11px] font-medium text-stone-500 hover:text-orange-600 px-2.5 py-1.5 rounded-lg hover:bg-stone-50 transition-colors"
                            >
                              <Share2 className="w-3.5 h-3.5" /> Share
                            </button>
                            {onDeleteImage && globalNum && (
                              <button
                                onClick={() => onDeleteImage(globalNum!, (img as any).sceneIndex ?? idx + 100)}
                                className="flex items-center gap-1.5 text-[11px] font-medium text-red-400 hover:text-red-600 px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors ml-auto"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Delete
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {globalNum && onRegenerateImages && (() => {
                  const isQueued = queuedRegens?.has(globalNum!) ?? false;
                  const isProcessing = regeneratingChapters?.has(globalNum!) ?? false;
                  return (
                    <button
                      onClick={() => onRegenerateImages(globalNum!)}
                      disabled={isProcessing || isQueued}
                      className={`flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg transition-colors ${
                        isProcessing || isQueued ? "opacity-60 cursor-not-allowed" : ""
                      } ${
                        isQueued
                          ? (themeKey === "dark" ? "text-amber-400 bg-amber-900/30" : "text-amber-700 bg-amber-100")
                          : (themeKey === "dark" ? "text-orange-400 hover:bg-orange-900/30" : "text-orange-500 hover:bg-orange-100")
                      }`}
                      title={isQueued ? "Already queued for regeneration — picks up in next cron run" : "Suggest a fix and queue regeneration"}
                    >
                      <RefreshCw className={`w-3 h-3 ${isProcessing ? "animate-spin" : ""}`} />
                      {isProcessing ? "Submitting…" : isQueued ? "Queued for regeneration" : "Regenerate this image"}
                    </button>
                  );
                })()}
              </div>
            );
          }
          case "shlok": {
            // Sanskrit verse — continuation across pages: no top divider/margin so the half-shloka
            // from the previous page flows directly into the closing half on this page.
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
            // Referenced shlok inside tatparya — smaller, indented, brown-tinted
            // Continuation across pages: drop the left border and top margin
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
            // BBT style: blue word-by-word meanings, 0.8x body size
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
            // Hindi translation — same style as tatparya/body text, no separate label
            const isAnuvadContinuation = i === 0 && prevPageEndKind === "anuvad";
            const renderedAnuvad = renderInlineBoldBlock([sec.lines.join(" ")])[0];
            return (
              <div key={i} data-section-type="anuvad" className={isAnuvadContinuation ? "" : "mt-3"}>
                {/* One paragraph, not one <p> per OCR line — the source breaks at
                    PRINT line ends, which are meaningless on screen and left ragged
                    orphans once the text wrapped. */}
                <p className={`leading-[2] mb-1 ${t.text}`} style={{ fontSize: "0.95em", fontFamily: "var(--font-devanagari)" }}>{renderedAnuvad}</p>
              </div>
            );
          }
          case "tatparya": {
            // Same as body text, only "तात्पर्य :" prefix is bold (SEN-109: visual divider)
            // Continuation if prev page ended in tatparya OR ref-shlok (ref-shlok is always inside tatparya)
            // Only the page-number divider is shown — no inline divider before tatparya
            const isContinuation = i === 0 && (prevPageEndKind === "tatparya" || prevPageEndKind === "ref-shlok");
            const renderedTatparya = renderInlineBoldBlock([sec.lines.join(" ")])[0];
            // Each paragraph is now its own tatparya section, so the label must
            // appear once at the top of the purport — not above every paragraph.
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

// ── Step Scroll Progress Indicator ────────────────────────────────────────────

type SectionMarker = { type: string; el: HTMLElement };

function StepScrollIndicator({ themeKey }: { themeKey: Theme }) {
  const [markers, setMarkers] = useState<SectionMarker[]>([]);
  const [activeIdx, setActiveIdx] = useState<number>(-1);

  // Gather all section elements
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

  // Track which section is in view
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

  // Theme-aware colors
  const palette = {
    light: { inactive: "#d6d3d1", active: "#292524" },
    dark: { inactive: "#57534e", active: "#e7e5e4" },
    sepia: { inactive: "#c4b5a0", active: "#5b4636" },
  }[themeKey];

  // Marker width per section type — all dashes, just varying width
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

// ── Sidebar (Kindle-like index) ───────────────────────────────────────────────

function Sidebar({
  chapters,
  chapterImages,
  activeChapter,
  progress,
  isOpen,
  onClose,
  onChapterClick,
  bookmarks,
  onBookmarkJump,
  onBookmarkDelete,
  vedabaseTitles,
  readerId,
  readerName,
  onLogin,
  onLogout,
}: {
  chapters: ChapterEntry[];
  chapterImages: Map<number, Array<{ url: string; description: string; isInstagram?: boolean }>>;
  activeChapter: number | null;
  progress: Progress | null;
  isOpen: boolean;
  onClose: () => void;
  onChapterClick: (chapter: ChapterEntry) => void;
  bookmarks: BookmarkEntry[];
  onBookmarkJump: (b: BookmarkEntry) => void;
  vedabaseTitles: Map<string, string>;
  onBookmarkDelete: (b: BookmarkEntry) => void;
  readerId: string | null;
  readerName: string | null;
  onLogin: () => void;
  onLogout: () => void;
}) {
  const [sidebarTab, setSidebarTab] = useState<"chapters" | "bookmarks">("chapters");
  const [sidebarSearch, setSidebarSearch] = useState("");
  // Track which cantos are expanded — default: only the active chapter's canto
  const activeSkandh = activeChapter
    ? chapters.find(c => c.globalNumber === activeChapter)?.skandh ?? null
    : null;
  const [expandedCantos, setExpandedCantos] = useState<Set<number>>(
    activeSkandh ? new Set([activeSkandh]) : new Set()
  );

  // When active chapter changes, auto-expand its canto (accordion: only this one)
  useEffect(() => {
    if (activeSkandh) {
      setExpandedCantos(prev => {
        if (prev.size === 1 && prev.has(activeSkandh)) return prev;
        return new Set([activeSkandh]);
      });
    }
  }, [activeSkandh]);

  // Scroll the sidebar to the current chapter when Contents opens (and when the
  // active chapter changes while open), so the reader lands on their place
  // instead of scrolling to find it. Ref is on the active chapter row below.
  const activeChapterRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!isOpen || sidebarTab !== "chapters") return;
    const t = setTimeout(() => {
      activeChapterRef.current?.scrollIntoView({ block: "center", behavior: "auto" });
    }, 90); // let the active canto expand + render first
    return () => clearTimeout(t);
  }, [isOpen, sidebarTab, activeChapter]);

  const toggleCanto = (skandh: number) => {
    setExpandedCantos(prev => {
      if (prev.has(skandh)) return new Set(); // close if already open
      return new Set([skandh]); // open this one, close all others
    });
  };

  const percent = progress && progress.totalPagesInPdf > 0
    ? (progress.totalPagesProcessed / progress.totalPagesInPdf) * 100 : 0;

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Sidebar panel (SEN-112: responsive width + search) */}
      <aside className={`
        fixed top-0 left-0 h-full w-[85vw] max-w-[18rem] sm:w-72 bg-white border-r border-stone-200 z-50
        transform transition-transform duration-300 ease-in-out overflow-y-auto
        lg:sticky lg:top-20 lg:h-[calc(100vh-5rem)] lg:z-0
        ${isOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        {/* Header with tabs */}
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

        {/* Progress bar removed — OCR complete */}

        {/* Tab content */}
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
            {/* Sidebar chapter search (SEN-112) */}
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
            {/* Chapter list grouped by skandh */}
            <nav className="py-2">
              {chapters.length === 0 ? (
                <p className="px-4 py-3 text-xs text-stone-400">No chapters available yet</p>
              ) : (
                (() => {
                  // Filter chapters by search (SEN-112)
                  const filteredChapters = sidebarSearch.trim()
                    ? chapters.filter(ch =>
                        ch.title.toLowerCase().includes(sidebarSearch.toLowerCase()) ||
                        `canto ${ch.skandh}`.includes(sidebarSearch.toLowerCase()) ||
                        `chapter ${ch.number}`.includes(sidebarSearch.toLowerCase()) ||
                        (vedabaseTitles.get(`${ch.skandh}-${ch.number}`) || "").toLowerCase().includes(sidebarSearch.toLowerCase())
                      )
                    : chapters;
                  // Group chapters by skandh
                  const skandhGroups = new Map<number, ChapterEntry[]>();
                  for (const ch of filteredChapters) {
                    if (!skandhGroups.has(ch.skandh)) skandhGroups.set(ch.skandh, []);
                    skandhGroups.get(ch.skandh)!.push(ch);
                  }
                  return Array.from(skandhGroups.entries()).map(([skandh, chs]) => {
                    const isExpanded = sidebarSearch.trim() ? true : expandedCantos.has(skandh);
                    const hasActiveChapter = chs.some(ch => ch.globalNumber === activeChapter);
                    // Get first chapter's image for canto thumbnail
                    const cantoImg = chs.map(ch => chapterImages.get(ch.globalNumber)?.[0]?.url).find(Boolean);
                    return (
                    <div key={skandh}>
                      <button
                        onClick={() => toggleCanto(skandh)}
                        className={`w-full px-3 py-2.5 flex items-center justify-between sticky top-0 z-[5] transition-all cursor-pointer group ${
                          hasActiveChapter
                            ? "bg-gradient-to-r from-orange-600 to-orange-500 shadow-md"
                            : "bg-white hover:bg-stone-50 border-b border-stone-100"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {cantoImg ? (
                            <img src={cantoImg} alt="" className={`w-10 h-10 rounded-xl object-cover shrink-0 ${hasActiveChapter ? "ring-2 ring-white/40" : ""}`} />
                          ) : (
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black shrink-0 ${
                              hasActiveChapter
                                ? "bg-white/25 text-white ring-2 ring-white/40"
                                : "bg-orange-100 text-orange-700"
                            }`}>
                              {skandh}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className={`text-sm font-bold truncate ${hasActiveChapter ? "text-white" : "text-stone-800"}`}>
                              Canto {skandh}
                            </p>
                            {SKANDH_NAMES[skandh] && (
                              <p className={`text-[11px] truncate ${hasActiveChapter ? "text-orange-100" : "text-stone-400"}`}>
                                {SKANDH_NAMES[skandh].hi}
                              </p>
                            )}
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
                            const imgSrc = chapterImages.get(ch.globalNumber)?.[0]?.url;
                            const shortTitle = ch.title.split("—")[0].trim();
                            const subtitle = ch.title.includes("—") ? ch.title.split("—").slice(1).join("—").trim() : "";
                            const vedabaseTitle = vedabaseTitles.get(`${skandh}-${ch.number}`) || "";

                            return (
                              <button
                                key={ch.globalNumber}
                                ref={isActive ? activeChapterRef : null}
                                onClick={() => onChapterClick(ch)}
                                className={`w-full text-left px-4 py-2.5 flex items-start gap-3 transition-all hover:bg-orange-50/60 ${
                                  isActive ? "bg-orange-50 border-r-2 border-orange-500" : ""
                                }`}
                              >
                                {imgSrc ? (
                                  <img src={imgSrc} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 mt-0.5" />
                                ) : (
                                  <div className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center shrink-0 mt-0.5">
                                    <span className="text-xs font-bold text-stone-400">{ch.number}</span>
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className={`text-sm font-semibold truncate ${isActive ? "text-orange-700" : "text-stone-700"}`}>
                                    {shortTitle}
                                  </p>
                                  {subtitle && (
                                    <p className="text-[11px] text-stone-400 truncate mt-0.5">{subtitle}</p>
                                  )}
                                  <p className="text-[10px] text-stone-400 mt-0.5">Page {ch.pageNumber}</p>
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

        {/* Identity / login footer */}
        <div className="px-3 py-3 border-t border-stone-100 mt-2">
          {readerId ? (
            <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg bg-orange-50/60">
              <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs font-bold shrink-0">
                {(readerName || readerId).slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-stone-700 truncate">
                  {readerName || "Signed in"}
                </p>
                <p className="text-[10px] text-stone-500 truncate">
                  {readerId}
                </p>
              </div>
              <button
                onClick={onLogout}
                className="p-1.5 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                title="Sign out"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={onLogin}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-semibold transition-colors"
            >
              <LogIn className="w-3.5 h-3.5" /> Sign in to save bookmarks
            </button>
          )}
        </div>

        {/* Footer credit */}
        <div className="px-4 py-4 border-t border-stone-100">
          <p className="text-[10px] text-stone-400 leading-relaxed">
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

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function Bhagwatham() {
  const isDevMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("dev");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [allPages, setAllPages] = useState<PageContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [precomputedChapters, setPrecomputedChapters] = useState<ChapterEntry[] | null>(null);
  const [totalBatchCount, setTotalBatchCount] = useState(0);
  const [loadedBatches, setLoadedBatches] = useState<Set<number>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);
  const batchCacheRef = useRef<Map<number, PageContent[]>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [chapterImages, setChapterImages] = useState<Map<number, Array<{ url: string; description: string; isInstagram?: boolean }>>>(new Map());
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
  // Approved reader-scene illustrations, shown inside the book above the passage
  // they depict. Keyed by page so each page only gets its own artwork.
  const [sceneArtByPage, setSceneArtByPage] = useState<Map<number, Array<{ id: number; key: string; image_url: string }>>>(new Map());
  useEffect(() => {
    (async () => {
      try {
        const res = await sbFetch("reader_scenes?select=id,page_number,selected_text,image_url&book=eq.bhagavatam&approved=is.true&image_generated=is.true");
        if (!res.ok) return;
        const rows = await res.json() as Array<{ id: number; page_number: number | null; selected_text: string; image_url: string }>;
        const m = new Map<number, Array<{ id: number; key: string; image_url: string }>>();
        for (const r of rows) {
          if (!r.page_number || !r.image_url) continue;
          const list = m.get(r.page_number) || [];
          list.push({ id: r.id, key: sceneKeyOf(r.selected_text), image_url: r.image_url });
          m.set(r.page_number, list);
        }
        setSceneArtByPage(m);
      } catch { /* illustrations are optional — the book still reads fine */ }
    })();
  }, []);

  // ── Source editor (CodeMirror) — dev-gated per-page raw-text editing ──────────
  // Replaces the fragile select-rendered-then-fuzzy-match flow: edits happen on the
  // real source string, so Save persists one canonical text and AI-fix / bold act on
  // exact offsets. See src/components/SourceEditor.tsx.
  const [editSourcePage, setEditSourcePage] = useState<number | null>(null);
  const savePageSource = useCallback(async (pn: number, newText: string) => {
    setAllPages(prev => prev.map(p => (p.pageNumber === pn ? { ...p, text: newText } : p)));
    const res = await sbFetch("bhagavatam_page_edits", {
      method: "POST",
      headers: { Prefer: "return=representation,resolution=merge-duplicates" },
      body: JSON.stringify({ page_number: pn, text: newText, edited_at: new Date().toISOString(), applied_to_git: false }),
    });
    if (!res.ok) throw new Error((await res.text().catch(() => "")) || res.statusText);
  }, []);
  const runAiFixSpan = useCallback(async ({ selectedText, contextBefore, contextAfter, pageNumber }: AiFixArgs): Promise<string | null> => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/bhagavatam-correct-text`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ selected_text: selectedText, context_before: contextBefore, context_after: contextAfter, page_number: pageNumber }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({} as { error?: string }));
      throw new Error(err.error || res.statusText);
    }
    const data = await res.json();
    return ((data?.suggested_text as string) || "").trim() || null;
  }, []);
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1024);
  const [activeChapter, setActiveChapter] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [lang, setLang] = useState<"hi" | "en">("hi");
  const [readerId, setReaderId] = useState<string | null>(() => (localStorage.getItem("bhagwatham_reader_id") || "").toLowerCase() || null);
  const [readerName, setReaderName] = useState<string | null>(() => localStorage.getItem("bhagwatham_reader_name"));
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
  const [showResume, setShowResume] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [vedabaseTitles, setVedabaseTitles] = useState<Map<string, string>>(new Map());
  const PAGES_PER_VIEW = 20;
  const contentRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const contentFullyLoaded = useRef(false);
  const pendingChapterRef = useRef<ChapterEntry | null>(null);

  // Undo state for image operations
  const [undoToast, setUndoToast] = useState<{ message: string; trashIds: string[]; timer: ReturnType<typeof setTimeout> } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Prompt editing modal state
  // ── Summarize pages ──────────────────────────────────────────────────────────
  const [summarizeModal, setSummarizeModal] = useState<{
    fromPage: number; toPage: number; summary: string; loading: boolean;
  } | null>(null);

  const handleSummarize = useCallback(async (from: number, to: number) => {
    if (from > to || from < 1) return;
    setSummarizeModal({ fromPage: from, toPage: to, summary: "", loading: true });

    const pageTexts = allPages
      .filter(p => p.pageNumber >= from && p.pageNumber <= to)
      .map(p => p.text)
      .join("\n\n");

    if (!pageTexts.trim()) {
      setSummarizeModal(prev => prev ? { ...prev, summary: "No content found for this page range.", loading: false } : null);
      return;
    }

    // Try server-side Claude summarization first (dev mode)
    try {
      const res = await fetch(`${API_BASE}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pages: pageTexts, fromPage: from, toPage: to }),
      });
      if (res.ok) {
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          const data = await res.json();
          if (data.summary) {
            setSummarizeModal(prev => prev ? { ...prev, summary: data.summary, loading: false } : null);
            return;
          }
        }
      }
    } catch { /* server not available on Vercel — use client-side extraction */ }

    // Client-side smart extraction fallback (works on production)
    const lines = pageTexts.split("\n").map(l => l.trim()).filter(Boolean);
    const bullets: string[] = [];
    const chapterHeadings: string[] = [];
    const tatparyaLines: string[] = [];
    const anuvadLines: string[] = [];
    let inTatparya = false;
    let inAnuvad = false;

    for (const line of lines) {
      // Chapter headings
      if (/^(अध्याय|Chapter)/iu.test(line) && line.length < 100) {
        chapterHeadings.push(line);
        inTatparya = false; inAnuvad = false;
        continue;
      }
      // Tatparya start
      if (/^तात्पर्य/u.test(line)) { inTatparya = true; inAnuvad = false; continue; }
      // Anuvad start
      if (/^अनुवाद/u.test(line)) { inAnuvad = true; inTatparya = false; continue; }
      // Shabdarth / Shlok headers reset
      if (/^(शब्दार्थ|श्लोक)/u.test(line)) { inTatparya = false; inAnuvad = false; continue; }

      if (inTatparya && line.length > 30) {
        tatparyaLines.push(line);
        if (tatparyaLines.length >= 15) inTatparya = false; // cap
      }
      if (inAnuvad && line.length > 20) {
        anuvadLines.push(line);
        if (anuvadLines.length >= 10) inAnuvad = false;
      }
    }

    if (chapterHeadings.length > 0) {
      bullets.push(`📖 विषय: ${chapterHeadings.join(", ")}`);
    }
    if (anuvadLines.length > 0) {
      bullets.push("📝 अनुवाद सार:");
      // Take first 2-3 distinct anuvad excerpts
      const unique = [...new Set(anuvadLines)].slice(0, 3);
      unique.forEach(l => bullets.push(`  • ${l.length > 150 ? l.slice(0, 150) + "…" : l}`));
    }
    if (tatparyaLines.length > 0) {
      bullets.push("🔑 तात्पर्य के मुख्य बिंदु:");
      const unique = [...new Set(tatparyaLines)].slice(0, 5);
      unique.forEach(l => bullets.push(`  • ${l.length > 150 ? l.slice(0, 150) + "…" : l}`));
    }

    if (bullets.length === 0) {
      bullets.push("इन पृष्ठों से सारांश निकाला नहीं जा सका। कृपया पृष्ठ संख्या जाँचें।");
    }

    setSummarizeModal(prev => prev ? { ...prev, summary: bullets.join("\n"), loading: false } : null);
  }, [allPages]);

  const [promptModal, setPromptModal] = useState<{
    chapterNum: number;
    chapterTitle: string;
    prompt: string;
    summaryHi: string;
    stories: Array<{ index: number; text: string; fullText: string }>;
    loading: boolean;
  } | null>(null);

  // Fetch lightweight chapter index first, then load batches on demand
  const fetchChapterIndex = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/chapter-index`);
      // On Vercel a MISSING static file returns the SPA index.html with HTTP
      // 200 — require a JSON content-type before parsing or json() throws.
      const ct = res.headers.get("content-type") || "";
      if (!res.ok || !ct.includes("application/json")) return;
      const data = await res.json();
      if (data.chapters?.length > 0) {
        const entries: ChapterEntry[] = data.chapters.map((c: any) => ({
          number: c.number,
          skandh: c.skandh,
          globalNumber: c.globalNumber,
          title: c.title,
          pageNumber: c.pageNumber,
        }));
        setPrecomputedChapters(entries);
        setTotalBatchCount(data.totalBatches || 0);
      }
    } catch { /* chapter index not available — will build from loaded pages */ }
  }, []);

  const fetchBatchRange = useCallback(async (startBatch: number, endBatch: number) => {
    const toLoad: number[] = [];
    for (let b = startBatch; b <= endBatch; b++) {
      if (!batchCacheRef.current.has(b)) toLoad.push(b);
    }
    if (toLoad.length === 0) return;
    setLoadingMore(true);

    const results = await Promise.all(
      toLoad.map(async (batchNum) => {
        try {
          const res = await fetch(`${API_BASE}/batch/${batchNum}`);
          // Missing static files come back as the SPA index.html with HTTP
          // 200 on Vercel — require JSON before parsing.
          const ct = res.headers.get("content-type") || "";
          if (!res.ok || !ct.includes("application/json")) {
            return { batchNum, pages: [] as PageContent[] };
          }
          const batch = await res.json();
          const pages = (batch.pages || []).filter((p: PageContent) => !isGarbagePage(p.text));
          return { batchNum, pages };
        } catch {
          return { batchNum, pages: [] as PageContent[] };
        }
      }),
    );

    for (const { batchNum, pages } of results) {
      batchCacheRef.current.set(batchNum, pages);
    }

    // Rebuild allPages from all loaded batches (sorted by batch number)
    const sortedBatches = [...batchCacheRef.current.entries()].sort((a, b) => a[0] - b[0]);
    const merged = sortedBatches.flatMap(([, pages]) => pages);
    setAllPages(merged);
    setLoadedBatches(new Set(batchCacheRef.current.keys()));
    setLoadingMore(false);
  }, []);

  // Load ALL content eagerly — no lazy loading (fixes SEN-114, SEN-103, SEN-106)
  const fetchAllContent = useCallback(async () => {
    setLoading(true);
    try {
      // Step 1: Load chapter index for instant sidebar (fast, ~30KB)
      try {
        const ciRes = await fetch(`${API_BASE}/chapter-index`);
        const ciCt = ciRes.headers.get("content-type") || "";
        if (ciRes.ok && ciCt.includes("application/json")) {
          const ciData = await ciRes.json();
          if (ciData.chapters?.length > 0) {
            setPrecomputedChapters(ciData.chapters.map((c: any) => ({
              number: c.number, skandh: c.skandh, globalNumber: c.globalNumber,
              title: c.title, pageNumber: c.pageNumber,
            })));
            setTotalBatchCount(ciData.totalBatches || 0);
          }
        }
      } catch { /* not available */ }

      // Step 1b: Load all live page edits from Supabase in parallel.
      // These are crowd-sourced corrections persisted via the voice-edit toolbar
      // and override whatever the static batch JSON contains.
      const editsByPage = new Map<number, { text?: string; textEn?: string }>();
      try {
        const editRes = await sbFetch("bhagavatam_page_edits?select=page_number,text,text_en");
        if (editRes.ok) {
          const rows: Array<{ page_number: number; text?: string; text_en?: string }> = await editRes.json();
          for (const r of rows) {
            editsByPage.set(r.page_number, { text: r.text || undefined, textEn: r.text_en || undefined });
          }
        }
      } catch { /* edits unavailable — fall through with original text */ }

      const applyEdits = (pages: PageContent[]): PageContent[] =>
        editsByPage.size === 0
          ? pages
          : pages.map(p => {
              const e = editsByPage.get(p.pageNumber);
              if (!e) return p;
              return {
                ...p,
                text: e.text ?? p.text,
                textEn: e.textEn ?? p.textEn,
              };
            });

      // Step 2: Load ALL pages via content endpoint (paginated, 100 batches per request)
      const accumulated: PageContent[] = [];
      let contentPage = 1;
      let hasMore = true;
      while (hasMore) {
        try {
          const res = await fetch(`${API_BASE}/content?page=${contentPage}&limit=100`);
          // SPA fallback returns index.html with HTTP 200 for missing files —
          // require JSON before parsing or json() throws and the load stops.
          const contentCt = res.headers.get("content-type") || "";
          if (!res.ok || !contentCt.includes("application/json")) break;
          const data: ContentResponse = await res.json();
          const pages = data.batches.flatMap(b => b.pages).filter(p => !isGarbagePage(p.text));
          accumulated.push(...pages);
          hasMore = data.pagination.hasMore;
          contentPage++;
          // Show content progressively — unblock UI after first chunk
          if (accumulated.length > 0) {
            setAllPages(applyEdits([...accumulated]));
            if (contentPage === 2) setLoading(false);
          }
        } catch { hasMore = false; }
      }
      if (accumulated.length > 0) setAllPages(applyEdits(accumulated));
      contentFullyLoaded.current = true;
      // If a chapter click was pending while content was loading, navigate now
      if (pendingChapterRef.current) {
        const ch = pendingChapterRef.current;
        pendingChapterRef.current = null;
        const pageIdx = accumulated.findIndex((p) => p.pageNumber >= ch.pageNumber);
        if (pageIdx >= 0) {
          const viewPage = Math.floor(pageIdx / PAGES_PER_VIEW) + 1;
          setCurrentPage(viewPage);
          requestAnimationFrame(() => {
            setTimeout(() => {
              const el = document.getElementById(`chapter-${ch.globalNumber}`);
              if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
              else {
                const pageEl = document.querySelector(`[data-page-num="${ch.pageNumber}"]`);
                if (pageEl) pageEl.scrollIntoView({ behavior: "smooth", block: "start" });
                else window.scrollTo({ top: 0, behavior: "smooth" });
              }
            }, 100);
          });
        }
      }
    } catch { /* empty */ } finally { setLoading(false); }
  }, []);

  const fetchProgress = useCallback(async () => {
    try { const res = await fetch(`${API_BASE}/progress`); setProgress(await res.json()); } catch { /* retry */ }
  }, []);

  const fetchImageManifest = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/image-manifest`);
      const manifest: ImageManifest = await res.json();
      const map = new Map<number, Array<{ url: string; description: string; sceneIndex?: number; isInstagram?: boolean }>>();
      for (const img of manifest.images) {
        const cacheBuster = new Date(img.generatedAt).getTime() || Date.now();
        const entry = {
          sceneIndex: img.sceneIndex,
          url: `${API_BASE}/images/${img.imagePath}?v=${cacheBuster}`,
          description: img.descriptionHi || (() => {
            // Try to extract Hindi scene context from the enriched prompt
            const hindiContextMatch = img.prompt.match(/Scene context:\s*([\u0900-\u097F].+?)$/i);
            if (hindiContextMatch) {
              const hindi = hindiContextMatch[1].trim();
              return hindi.length > 120 ? hindi.slice(0, 120) + "…" : hindi;
            }
            // Fallback: use chapter title in Hindi if available
            const title = img.chapterTitle?.replace(/^Chapter\s*/i, "अध्याय ") || "";
            if (title && /[\u0900-\u097F]/.test(title)) return title;
            // Last resort: extract clean scene description from English prompt
            const sceneMatch = img.prompt.match(/Scene:\s*(.+?)(?:,\s*(?:on the|Indian devotional|temple|realistic|ancient))/i);
            if (sceneMatch) return sceneMatch[1].trim();
            return img.prompt.split(",").slice(0, 2).join(",").trim();
          })(),
        };
        const existing = map.get(img.chapterNumber) || [];
        existing.push(entry);
        map.set(img.chapterNumber, existing);
      }

      // Also fetch the static Instagram manifest (legacy path, usually empty now)
      try {
        const igRes = await fetch(`${API_BASE}/instagram/manifest`);
        const igManifest = await igRes.json();
        if (igManifest?.images?.length) {
          for (const igImg of igManifest.images) {
            const url = igImg.publicUrl || `${API_BASE}/instagram/images/${igImg.imagePath}`;
            const entry = {
              sceneIndex: (igImg.sceneIndex ?? 0) + 100, // offset to avoid collisions
              url,
              description: igImg.caption?.split("\n")[0] || igImg.prompt || "",
              isInstagram: true,
            };
            const existing = map.get(igImg.chapterNumber) || [];
            existing.push(entry);
            map.set(igImg.chapterNumber, existing);
          }
        }
      } catch { /* IG manifest not available — fine */ }

      // ALSO fetch approved posts directly from the Supabase review queue.
      // These are images that were generated by the daily IG cron, reviewed
      // by a human, posted to Instagram + Threads, and stored at a public
      // Supabase URL. Reusing them as chapter images means every approved
      // IG post fills the corresponding chapter image gap automatically.
      try {
        const sbRes = await sbFetch(
          "ig_pending_review?status=eq.approved&select=chapter_global_number,image_url,caption,chapter_title&order=chapter_global_number.asc",
        );
        if (sbRes.ok) {
          const rows: Array<{
            chapter_global_number: number;
            image_url: string;
            caption: string;
            chapter_title: string;
          }> = await sbRes.json();
          for (const r of rows) {
            // Skip if we already have this exact URL in the chapter's images
            const existing = map.get(r.chapter_global_number) || [];
            if (existing.some(e => e.url === r.image_url)) continue;
            const firstLine = r.caption?.split("\n").find(l => l.trim()) || r.chapter_title || "";
            existing.push({
              sceneIndex: 200 + existing.length, // park IG-from-Supabase well above scene 0
              url: r.image_url,
              description: firstLine.substring(0, 120),
              isInstagram: true,
            });
            map.set(r.chapter_global_number, existing);
          }
        }
      } catch { /* offline — fine */ }

      setChapterImages(map);
    } catch { /* optional */ }
  }, []);

  // ── Image regeneration ─────────────────────────────────────────────────────
  const [regeneratingChapters, setRegeneratingChapters] = useState<Set<number>>(new Set());

  const showUndo = useCallback((message: string, trashIds: string[]) => {
    // Clear any existing undo timer
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const timer = setTimeout(() => setUndoToast(null), 8000);
    undoTimerRef.current = timer;
    setUndoToast({ message, trashIds, timer });
  }, []);

  const handleUndo = useCallback(async () => {
    if (!undoToast) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const { trashIds } = undoToast;
    setUndoToast(null);
    try {
      for (const tid of trashIds) {
        await fetch(`${MUTATION_API_BASE}/image/restore/${tid}`, { method: "POST" });
      }
      await fetchImageManifest();
    } catch { /* ignore */ }
  }, [undoToast, fetchImageManifest]);

  const openPromptModal = useCallback(async (chapterNum: number) => {
    if (regeneratingChapters.has(chapterNum)) return;
    setPromptModal({ chapterNum, chapterTitle: "", prompt: "", summaryHi: "", stories: [], loading: true });
    try {
      const res = await fetch(`${API_BASE}/suggest-prompt/${chapterNum}`);
      if (res.ok) {
        const data = await res.json();
        setPromptModal({
          chapterNum,
          chapterTitle: data.chapterTitle || `अध्याय ${chapterNum}`,
          prompt: data.suggestedPrompt || data.existingPrompt || "",
          summaryHi: data.summaryHi || "",
          stories: data.stories || [],
          loading: false,
        });
      } else {
        setPromptModal(null);
      }
    } catch {
      setPromptModal(null);
    }
  }, [regeneratingChapters]);

  // Reason modal — collects "what was wrong" before queueing regeneration
  const [regenReasonModal, setRegenReasonModal] = useState<{ chapterNum: number; sceneIndex: number } | null>(null);
  // Track chapters that have a pending regen request so we can show "Queued" badge
  const [queuedRegens, setQueuedRegens] = useState<Set<number>>(new Set());

  // Load currently-pending regen requests on mount so the UI shows queued state
  useEffect(() => {
    (async () => {
      try {
        const res = await sbFetch(
          "bhagavatam_image_regen_requests?status=in.(pending,processing)&select=chapter_number",
        );
        if (res.ok) {
          const rows: Array<{ chapter_number: number }> = await res.json();
          setQueuedRegens(new Set(rows.map(r => r.chapter_number)));
        }
      } catch { /* offline — fine */ }
    })();
  }, []);

  // Open reason modal — actual queueing happens on modal submit.
  const handleRegenerateImages = useCallback((chapterNum: number, sceneIndex: number = 0) => {
    if (regeneratingChapters.has(chapterNum)) return;
    setRegenReasonModal({ chapterNum, sceneIndex });
  }, [regeneratingChapters]);

  // Submit a regen request to Supabase queue (laptop-independent).
  // The local cron picks pending rows, regenerates with the reason injected
  // into the FLUX prompt as a corrective instruction, and marks them complete.
  const submitRegenRequest = useCallback(async (chapterNum: number, sceneIndex: number, reason: string) => {
    if (!reason.trim()) {
      alert("Please describe what's wrong with the current image so the next generation can fix it.");
      return;
    }
    setRegenReasonModal(null);
    setRegeneratingChapters((prev) => new Set(prev).add(chapterNum));
    try {
      const res = await sbFetch("bhagavatam_image_regen_requests", {
        method: "POST",
        body: JSON.stringify({
          chapter_number: chapterNum,
          scene_index: sceneIndex,
          reason: reason.trim(),
          requested_at: new Date().toISOString(),
          status: "pending",
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        alert(`Failed to queue regeneration: ${err}`);
        return;
      }
      setQueuedRegens(prev => new Set(prev).add(chapterNum));
      alert(
        `Regeneration queued for Chapter ${chapterNum}.\n\n` +
        `It'll be regenerated next time the local generator runs (typically within 24h),` +
        ` with this issue specifically called out in the prompt:\n\n"${reason.trim()}"`,
      );
    } catch (err) {
      alert(`Could not queue regeneration: ${String(err)}`);
    } finally {
      setRegeneratingChapters((prev) => {
        const next = new Set(prev);
        next.delete(chapterNum);
        return next;
      });
    }
  }, []);

  const handleDeleteImage = useCallback(async (chapterNum: number, sceneIndex: number) => {
    if (!isMutationApiConfigured()) {
      alert(
        "Delete not configured for the live site.\n\n" +
        "To enable: start an ngrok tunnel to the local API server, then set VITE_PUBLIC_API_URL " +
        "in Vercel project settings to the tunnel URL and redeploy.",
      );
      return;
    }
    try {
      const res = await fetch(`${MUTATION_API_BASE}/image/${chapterNum}/${sceneIndex}`, { method: "DELETE" });
      if (res.ok) {
        const data = await res.json();
        await fetchImageManifest();
        if (data.trashId) {
          showUndo(`Chapter ${chapterNum} image deleted`, [data.trashId]);
        }
      } else {
        alert(`Delete failed — HTTP ${res.status}. Check the tunnel is running.`);
      }
    } catch (err) {
      alert("Delete failed — could not reach the API server.\n\n" + String(err));
    }
  }, [fetchImageManifest, showUndo]);

  // ── Bookmark functions ──────────────────────────────────────────────────────
  const fetchBookmarks = useCallback(async (rid?: string) => {
    const id = rid || readerId;
    if (!id) return;
    try {
      const res = await sbFetch(`bhagavatam_bookmarks?reader_id=eq.${encodeURIComponent(id)}&order=created_at.desc`);
      const data: BookmarkEntry[] = await res.json();
      setBookmarks(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  }, [readerId]);

  const saveBookmark = useCallback(async () => {
    if (!readerId) { setShowIdentityModal(true); return; }

    // Use the currently visible page from scroll tracking, fallback to view-page start
    const pageNum = visiblePageNum || allPages[(currentPage - 1) * PAGES_PER_VIEW]?.pageNumber;
    if (!pageNum) return;

    // Find current chapter context
    const chapterList = buildChapterIndex(allPages);
    const currentChapter = chapterList.slice().reverse().find(ch => ch.pageNumber <= pageNum);

    // Capture the topmost-visible line on the page so we can scroll back to it
    let lineAnchor: string | null = null;
    try {
      const pageEl = document.querySelector(`[data-page-num="${pageNum}"]`);
      if (pageEl) {
        const topP = findTopmostVisibleParagraph(pageEl as HTMLElement);
        const text = topP?.textContent?.trim() || "";
        // 80 chars is plenty for a unique anchor inside one page
        lineAnchor = text.substring(0, 80) || null;
      }
    } catch { /* fallback: no anchor */ }

    try {
      const res = await sbFetch("bhagavatam_bookmarks", {
        method: "POST",
        headers: { Prefer: "return=representation,resolution=merge-duplicates" },
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
  }, [readerId, readerName, allPages, currentPage, visiblePageNum, fetchBookmarks]);

  // Latest-saveBookmark ref so the global "B" keydown listener (bound once
  // per page-change) always calls the fresh closure without re-binding.
  const saveBookmarkRef = useRef(saveBookmark);
  saveBookmarkRef.current = saveBookmark;

  const deleteBookmark = useCallback(async (b: BookmarkEntry) => {
    if (!readerId) return;
    try {
      const res = await sbFetch(`bhagavatam_bookmarks?id=eq.${b.id}&reader_id=eq.${encodeURIComponent(readerId)}`, { method: "DELETE" });
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
    // Sidebar stays open — user must close manually via X or Escape
    setSearchQuery("");
    const pageIdx = allPages.findIndex(p => p.pageNumber === b.page_number);
    if (pageIdx >= 0) {
      const viewPage = Math.floor(pageIdx / PAGES_PER_VIEW) + 1;
      setCurrentPage(viewPage);
      // Find the chapter for this page and expand its canto in sidebar
      const ch = chapters.slice().reverse().find(c => c.pageNumber <= b.page_number);
      if (ch) {
        setActiveChapter(ch.globalNumber);
        setScrollChapter(ch.title);
      }
      // Wait for the page view to render, then try to scroll to the exact line
      // captured at bookmark time. If the anchor text can't be found (e.g.
      // user edited the line since), fall back to scrolling to the page top.
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
            // Flash highlight so the user can see which line was restored
            match.style.transition = "background-color 0.4s";
            const prevBg = match.style.backgroundColor;
            match.style.backgroundColor = "rgba(251, 191, 36, 0.35)";
            setTimeout(() => { match.style.backgroundColor = prevBg; }, 1500);
            return;
          }
        }
        // Fallback: scroll to page top
        pageEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 250);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPages]);

  const handleIdentitySave = useCallback((id: string, name: string) => {
    localStorage.setItem("bhagwatham_reader_id", id);
    if (name) localStorage.setItem("bhagwatham_reader_name", name);
    setReaderId(id);
    setReaderName(name || null);
    setShowIdentityModal(false);
    fetchBookmarks(id);
    // Auto-save bookmark after identity is set
    setTimeout(() => {
      const idx = (currentPage - 1) * PAGES_PER_VIEW;
      const pageNum = allPages[idx]?.pageNumber;
      if (!pageNum) return;
      const chapterList = buildChapterIndex(allPages);
      const currentChapter = chapterList.slice().reverse().find(ch => ch.pageNumber <= pageNum);
      sbFetch("bhagavatam_bookmarks", {
        method: "POST",
        headers: { Prefer: "return=representation,resolution=merge-duplicates" },
        body: JSON.stringify({
          reader_id: id, reader_name: name || null,
          page_number: pageNum,
          chapter_number: currentChapter?.number || null,
          chapter_title: currentChapter?.title || null,
          updated_at: new Date().toISOString(),
        }),
      }).then(() => fetchBookmarks(id)).then(() => {
        setBookmarkSaved(true);
        setTimeout(() => setBookmarkSaved(false), 2000);
      });
    }, 100);
  }, [allPages, currentPage, fetchBookmarks]);

  useEffect(() => {
    fetchProgress(); fetchAllContent(); fetchImageManifest();
    if (readerId) fetchBookmarks();
    const interval = setInterval(fetchProgress, 60_000);
    return () => clearInterval(interval);
  }, [fetchProgress, fetchAllContent, fetchImageManifest, fetchBookmarks, readerId]);

  // Use precomputed chapter index if available (instant), else build from loaded pages
  const chapters = useMemo(
    () => precomputedChapters || buildChapterIndex(allPages),
    [precomputedChapters, allPages],
  );

  // Batch-on-demand removed — all content loaded eagerly in fetchAllContent (SEN-114)

  // Paginate pages for the current view
  const totalViewPages = Math.max(1, Math.ceil(allPages.length / PAGES_PER_VIEW));
  const startIdx = (currentPage - 1) * PAGES_PER_VIEW;
  const visiblePages = allPages.slice(startIdx, startIdx + PAGES_PER_VIEW);

  // Filter by search — language-aware (SEN-144)
  const displayPages = searchQuery.trim()
    ? allPages.filter((p) => {
        const q = searchQuery.toLowerCase();
        if (lang === "en" && p.textEn) return p.textEn.toLowerCase().includes(q);
        return p.text.toLowerCase().includes(q) || (p.textEn?.toLowerCase().includes(q));
      })
    : visiblePages;

  const triggerProcess = async () => {
    setIsProcessing(true);
    try {
      await fetch(`${API_BASE}/process`, { method: "POST" });
      await fetchProgress(); await fetchAllContent(); await fetchImageManifest();
    } finally { setIsProcessing(false); }
  };

  const goToPage = (page: number) => {
    setCurrentPage(page);
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goToPageNumber = (pageNum: number) => {
    const pageIdx = allPages.findIndex(p => p.pageNumber >= pageNum);
    if (pageIdx >= 0) {
      const viewPage = Math.floor(pageIdx / PAGES_PER_VIEW) + 1;
      setCurrentPage(viewPage);
      // After render, scroll to the exact page element
      setTimeout(() => {
        const el = document.querySelector(`[data-page-num="${allPages[pageIdx].pageNumber}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        else window.scrollTo({ top: 0, behavior: "smooth" });
      }, 200);
    }
  };

  const handleChapterClick = (ch: ChapterEntry) => {
    // Sidebar stays open — user must close manually via X or Escape
    setSearchQuery("");
    setActiveChapter(ch.globalNumber);

    // Find target page in loaded content
    const pageIdx = allPages.findIndex((p) => p.pageNumber >= ch.pageNumber);
    if (pageIdx >= 0) {
      const viewPage = Math.floor(pageIdx / PAGES_PER_VIEW) + 1;
      setCurrentPage(viewPage);
      // Wait for React to render, then scroll to chapter anchor
      requestAnimationFrame(() => {
        setTimeout(() => {
          const el = document.getElementById(`chapter-${ch.globalNumber}`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
          } else {
            const pageEl = document.querySelector(`[data-page-num="${ch.pageNumber}"]`);
            if (pageEl) pageEl.scrollIntoView({ behavior: "smooth", block: "start" });
            else window.scrollTo({ top: 0, behavior: "smooth" });
          }
        }, 100);
      });
    } else if (!contentFullyLoaded.current) {
      // Content still loading — queue this chapter and navigate when loading completes
      pendingChapterRef.current = ch;
      setLoading(true);
    } else {
      // Content finished loading but this chapter's pages never arrived
      // (e.g. its batch file is missing on the server) — tell the user
      // instead of silently doing nothing.
      alert("यह अध्याय अभी उपलब्ध नहीं है — कृपया बाद में देखें");
    }
  };

  // Auto-save/resume removed — was causing scroll position issues

  // Auto-resume removed — was causing scroll/view issues. User can use bookmarks or sidebar instead.
  const resumedRef = useRef(false);

  // Resume handler removed — auto-resume was causing scroll issues

  // ── Keyboard shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs
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
          if (!e.ctrlKey && !e.metaKey) {
            setFocusMode(prev => !prev);
          }
          break;
        case "b":
          if (!e.ctrlKey && !e.metaKey) {
            // Call through the ref — saveBookmark captured directly here
            // would be stale (this effect's deps intentionally exclude it).
            saveBookmarkRef.current();
          }
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentPage, totalViewPages]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scroll chapter tracking ────────────────────────────────────────────
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

  // ── Scroll page tracking ──────────────────────────────────────────────
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the last intersecting entry (most recently scrolled into view)
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

  // Theme
  const theme = THEME_STYLES[settings.theme];

  // Page range display — use the first page of the current view as baseline
  const firstPageNum = visiblePages[0]?.pageNumber ?? (displayPages[0]?.pageNumber ?? 0);
  const lastPageNum = visiblePages[visiblePages.length - 1]?.pageNumber ?? (displayPages[displayPages.length - 1]?.pageNumber ?? 0);
  const currentVisiblePage = visiblePageNum || firstPageNum;

  return (
    <Layout>
      <SEOHead
        title="भागवतम् — श्रीमद्भागवतम्"
        description="श्रीमद्भागवतम् (भागवत पुराण) हिंदी में — श्रील प्रभुपाद द्वारा अनुवाद एवं तात्पर्य सहित।"
        structuredData={{
          "@context": "https://schema.org", "@type": "Book",
          name: "श्रीमद्भागवतम्", alternateName: "Srimad Bhagavatam",
          inLanguage: "hi",
        }}
      />

      {/* Identity modal */}
      {showIdentityModal && (
        <ReaderIdentityModal
          onSave={handleIdentitySave}
          onClose={() => setShowIdentityModal(false)}
        />
      )}

      <div className="flex min-h-screen">
        {/* ── Sidebar ── */}
        <Sidebar
          chapters={chapters}
          chapterImages={chapterImages}
          activeChapter={activeChapter}
          progress={progress}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onChapterClick={handleChapterClick}
          bookmarks={bookmarks}
          onBookmarkJump={handleBookmarkJump}
          onBookmarkDelete={deleteBookmark}
          vedabaseTitles={vedabaseTitles}
          readerId={readerId}
          readerName={readerName}
          onLogin={() => setShowIdentityModal(true)}
          onLogout={() => {
            localStorage.removeItem("bhagwatham_reader_id");
            localStorage.removeItem("bhagwatham_reader_name");
            setReaderId(null);
            setReaderName(null);
            setBookmarks([]);
          }}
        />

        {/* ── Main content ── */}
        <main ref={contentRef} className={`flex-1 min-w-0 ${theme.bg} transition-colors duration-300`}>
          {/* Voice edit toolbar — appears when text is selected */}
          <VoiceEditToolbar allPages={allPages} setAllPages={setAllPages} unboldLines={unboldLines} onUnboldChange={handleUnboldChange} />
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
              {/* Sidebar toggle (mobile) */}
              {!focusMode && (
                <button
                  onClick={() => { setSidebarOpen(true); }}
                  className={`lg:hidden p-2 hover:bg-stone-100 rounded-lg transition-colors`}
                  aria-label="Open contents"
                >
                  <List className={`w-5 h-5 ${theme.muted}`} />
                </button>
              )}

              {/* Page info + sticky chapter (SEN-110: compact on mobile) */}
              <div className={`flex items-center gap-1 sm:gap-2 text-[11px] sm:text-xs ${theme.muted} min-w-0`}>
                <BookOpen className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 hidden sm:block" />
                {editingPageNum ? (
                  <form className="flex items-center gap-1 whitespace-nowrap" onSubmit={(e) => {
                    e.preventDefault();
                    const num = parseInt(pageInputValue, 10);
                    if (num > 0) goToPageNumber(num);
                    setEditingPageNum(false);
                  }}>
                    <span>Pg.</span>
                    <input
                      ref={pageInputRef}
                      type="number" min={1} max={allPages[allPages.length - 1]?.pageNumber || 999}
                      value={pageInputValue}
                      onChange={(e) => setPageInputValue(e.target.value)}
                      onBlur={() => setEditingPageNum(false)}
                      onKeyDown={(e) => { if (e.key === "Escape") setEditingPageNum(false); }}
                      className="w-14 px-1 py-0.5 bg-white border border-orange-300 rounded text-xs text-stone-700 text-center focus:outline-none focus:ring-1 focus:ring-orange-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      autoFocus
                    />
                    <span>/ {allPages[allPages.length - 1]?.pageNumber || allPages.length}</span>
                  </form>
                ) : scrollChapter ? (
                  <>
                    <span className="text-orange-600 font-bold shrink-0">{(() => { const ch = chapters.find(c => c.globalNumber === activeChapter); return ch ? `S${ch.skandh}` : ""; })()}</span>
                    <span className="truncate font-semibold">{scrollChapter?.split("—")[0].trim()}</span>
                    {scrollChapter?.includes("—") && (
                      <span className={`truncate ${theme.muted} hidden sm:inline`}>— {scrollChapter.split("—").slice(1).join("—").trim()}</span>
                    )}
                    <span
                      className="whitespace-nowrap cursor-pointer hover:text-orange-600 transition-colors shrink-0"
                      onClick={() => { setPageInputValue(String(currentVisiblePage)); setEditingPageNum(true); setTimeout(() => pageInputRef.current?.select(), 50); }}
                      title="Type page number"
                    >Pg. {currentVisiblePage}</span>
                  </>
                ) : allPages.length > 0 && !searchQuery ? (
                  <span
                    className="whitespace-nowrap cursor-pointer hover:text-orange-600 transition-colors"
                    onClick={() => { setPageInputValue(String(currentVisiblePage)); setEditingPageNum(true); setTimeout(() => pageInputRef.current?.select(), 50); }}
                    title="Type page number"
                  >
                    Pg. {currentVisiblePage} / {allPages[allPages.length - 1]?.pageNumber || allPages.length}
                  </span>
                ) : searchQuery ? (
                  <span>{displayPages.length} results</span>
                ) : (
                  <span>Loading...</span>
                )}
              </div>

              {/* Search (SEN-110: responsive width) */}
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

              {/* Language toggle */}
              <button
                onClick={() => setLang(lang === "hi" ? "en" : "hi")}
                className="px-1.5 sm:px-2 py-1 sm:py-1.5 bg-stone-100 border border-stone-200 rounded-lg text-[11px] sm:text-xs font-semibold text-stone-700 hover:bg-stone-200 transition-all active:scale-95 shrink-0"
                title={lang === "hi" ? "Switch to English" : "हिंदी में पढ़ें"}
              >
                {lang === "hi" ? "हि" : "EN"}
              </button>

              {/* Bookmark button */}
              <button
                onClick={saveBookmark}
                className={`relative p-1 sm:p-1.5 rounded-lg transition-all active:scale-95 shrink-0 ${
                  bookmarkSaved ? "bg-orange-100 text-orange-600" : `hover:bg-stone-100 ${theme.muted} hover:text-orange-600`
                }`}
                title="Bookmark (B)"
              >
                <Bookmark className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${bookmarkSaved ? "fill-orange-500" : ""}`} />
              </button>
              {/* View saved bookmarks — hidden on mobile to save space (SEN-110) */}
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

              {/* Summarize button */}
              <button
                onClick={() => setSummarizeModal({ fromPage: visiblePageNum || 1, toPage: Math.min((visiblePageNum || 1) + 9, allPages.length > 0 ? allPages[allPages.length - 1].pageNumber : 999), summary: "", loading: false })}
                className={`p-1 sm:p-1.5 rounded-lg transition-all active:scale-95 shrink-0 hover:bg-stone-100 ${theme.muted} hover:text-orange-600`}
                title="Summarize Pages"
              >
                <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>

              {/* Settings button */}
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

              {/* Focus mode — desktop only (SEN-110) */}
              <button
                onClick={() => setFocusMode(!focusMode)}
                className={`hidden md:block p-1.5 rounded-lg transition-all shrink-0 ${focusMode ? "bg-orange-100 text-orange-600" : `hover:bg-stone-100 ${theme.muted}`}`}
                title="Focus Mode (F)"
              >
                <Maximize2 className="w-4 h-4" />
              </button>

              {/* Process button removed — OCR runs automatically via cron */}
            </div>
          </div>

          {/* Chapter context bar removed — info shown in top toolbar */}

          {/* English not-available notice */}
          {lang === "en" && allPages.length > 0 && !allPages.some((p) => p.textEn) && (
            <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-4">
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-start gap-2.5">
                <Languages className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-amber-700">English translation not yet available</p>
                  <p className="text-[11px] text-amber-600 mt-0.5">
                    Pages processed before Sarvam AI was enabled don't have English translations.
                    New batches will include English automatically. Showing Hindi text as fallback.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Resume card removed — auto-resume was causing scroll issues */}

          {/* Content area (SEN-113: responsive padding + Devanagari wrapping) */}
          <div
            className="mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 [overflow-wrap:break-word] [word-break:break-word] overflow-x-clip"
            style={{ maxWidth: settings.maxWidth, fontSize: `clamp(13px, ${settings.fontSize}px, ${settings.fontSize}px)`, lineHeight: settings.lineHeight }}
          >
            {loading ? (
              <div className={`flex flex-col items-center justify-center py-24 ${theme.muted}`}>
                <Loader2 className="w-8 h-8 animate-spin mb-4" />
                <p className="text-sm">Loading...</p>
              </div>
            ) : displayPages.length === 0 ? (
              <div className={`flex flex-col items-center justify-center py-24 ${theme.muted}`}>
                {loadingMore ? (
                  <>
                    <Loader2 className="w-8 h-8 animate-spin mb-4 text-orange-500" />
                    <p className="text-sm">Loading pages...</p>
                  </>
                ) : (
                  <motion.div variants={fadeInUp} initial="hidden" animate="visible" className="text-center">
                    <div className="w-16 h-16 mx-auto mb-5 bg-orange-100 rounded-2xl flex items-center justify-center">
                      <BookOpen className="w-8 h-8 text-orange-400" />
                    </div>
                    <h3 className={`font-serif text-xl font-bold ${theme.text} mb-2`}>
                      {searchQuery ? "No results found" : "No pages ready yet"}
                    </h3>
                    <p className={`${theme.muted} text-sm max-w-sm mx-auto mb-5`}>
                      {searchQuery ? "Try different keywords." : "Pages are being processed automatically. Please wait."}
                    </p>
                  </motion.div>
                )}
              </div>
            ) : (
              <div className="flex items-start">
                {/* Step scroll indicator — sticky rail on the left */}
                <StepScrollIndicator themeKey={settings.theme} />
                <div className="flex-1 min-w-0">
                {displayPages.map((page, pageIdx) => {
                  // Determine the previous page's ending section kind for cross-page continuity
                  let prevPage = pageIdx > 0 ? displayPages[pageIdx - 1] : null;
                  // For first page in view, check the page right before it in allPages
                  if (!prevPage && !searchQuery.trim()) {
                    const allIdx = allPages.findIndex(p => p.pageNumber === page.pageNumber);
                    if (allIdx > 0) prevPage = allPages[allIdx - 1];
                  }
                  // Pass current page text to upgrade prev-end-kind from ref-shlok → shlok
                  // when this page starts with a numbered shlok continuation (e.g. ॥ ११ ॥).
                  const prevEndKind = prevPage ? getPageEndKind(prevPage.text, page.text) : undefined;
                  // Look ahead one page so the current page's trailing ref-shlok half-shloka
                  // can be promoted to shlok if the next page closes the verse with `॥ N ॥`.
                  let nextPage = pageIdx < displayPages.length - 1 ? displayPages[pageIdx + 1] : null;
                  if (!nextPage && !searchQuery.trim()) {
                    const allIdx = allPages.findIndex(p => p.pageNumber === page.pageNumber);
                    if (allIdx >= 0 && allIdx < allPages.length - 1) nextPage = allPages[allIdx + 1];
                  }
                  const nextPageStartsNumberedShlok = nextPage ? pageStartsWithNumberedShlokContinuation(nextPage.text) : false;
                  // Hide the page number divider when a shloka or ref-shloka spans the page boundary —
                  // the verse should read as one continuous unit, not get visually broken.
                  const hidePageDivider = prevEndKind === "shlok" || prevEndKind === "ref-shlok";
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
                    {pageIdx > 0 && !hidePageDivider && settings.showPageNumbers && (
                      <div className={`flex items-center gap-3 my-8 sm:my-10 ${theme.muted}`}>
                        <div className={`flex-1 h-px ${settings.theme === "dark" ? "bg-white/10" : settings.theme === "sepia" ? "bg-amber-300/40" : "bg-orange-200/60"}`} />
                        <span className="text-[10px] font-medium opacity-50 shrink-0 px-2">· {page.pageNumber} ·</span>
                        <div className={`flex-1 h-px ${settings.theme === "dark" ? "bg-white/10" : settings.theme === "sepia" ? "bg-amber-300/40" : "bg-orange-200/60"}`} />
                      </div>
                    )}
                    {pageIdx > 0 && hidePageDivider && settings.showPageNumbers && (
                      // Inline page-number marker keeps the page reference but doesn't break the verse
                      <p className={`text-[10px] ${theme.muted} font-medium text-right mt-1 mb-1 opacity-40`}>· {page.pageNumber} ·</p>
                    )}
                    {pageIdx === 0 && settings.showPageNumbers && <p className={`text-[10px] ${theme.muted} font-medium text-right mt-0 mb-2 opacity-40`}>· {page.pageNumber} ·</p>}
                    <RenderContent text={page.text} textEn={page.textEn} lang={lang} chapterImages={chapterImages} themeKey={settings.theme} onRegenerateImages={(num: number) => handleRegenerateImages(num, 0)} regeneratingChapters={regeneratingChapters} queuedRegens={queuedRegens} onDeleteImage={isDevMode ? handleDeleteImage : undefined} pageNumber={page.pageNumber} overrides={sectionOverrides[page.pageNumber]} onOverridesChange={isDevMode ? handleOverridesChange : undefined} prevPageEndKind={prevEndKind} nextPageStartsNumberedShlok={nextPageStartsNumberedShlok} unboldLines={unboldLines} sceneArt={sceneArtByPage.get(page.pageNumber)} chapterNumMapper={(perSkandhNum: number) => {
                      // Find which skandh this page belongs to based on surrounding chapters
                      const ch = chapters.find(c => c.number === perSkandhNum && c.pageNumber <= page.pageNumber);
                      // Pick the last matching chapter (closest to this page)
                      const candidates = chapters.filter(c => c.number === perSkandhNum && c.pageNumber <= page.pageNumber);
                      const best = candidates.length > 0 ? candidates[candidates.length - 1] : chapters.find(c => c.number === perSkandhNum);
                      return best?.globalNumber ?? perSkandhNum;
                    }} />
                  </div>
                  );
                })}
                </div>
              </div>
            )}

            {/* ── Pagination ── */}
            {!searchQuery && totalViewPages > 1 && (
              <div className={`flex items-center justify-center gap-2 mt-10 mb-6 pb-4 border-t ${theme.border} pt-6`}>
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

                {/* Page numbers */}
                {Array.from({ length: Math.min(totalViewPages, 7) }, (_, i) => {
                  let pageNum: number;
                  if (totalViewPages <= 7) {
                    pageNum = i + 1;
                  } else if (currentPage <= 4) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalViewPages - 3) {
                    pageNum = totalViewPages - 6 + i;
                  } else {
                    pageNum = currentPage - 3 + i;
                  }
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
              <p className={`text-[10px] ${theme.muted} leading-relaxed max-w-md mx-auto`}>
                श्रीमद्भागवतम् (भागवत पुराण) — कृष्णकृपामूर्ति श्री श्रीमद् ए.सी. भक्तिवेदान्त स्वामी प्रभुपाद
                द्वारा हिंदी अनुवाद एवं तात्पर्य। भक्तिवेदान्त बुक ट्रस्ट (BBT) द्वारा प्रकाशित।
              </p>
              <a href="https://www.sarvam.ai" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 mt-3 text-[10px] text-stone-400 hover:text-stone-600 transition-colors">
                Powered by
                <img src="https://www.sarvam.ai/sarvam-logo.svg" alt="Sarvam AI" className="h-4 opacity-50 hover:opacity-80 transition-opacity" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).nextElementSibling && ((e.target as HTMLImageElement).insertAdjacentText("afterend", "Sarvam AI")); }} />
              </a>
            </div>
          </div>
        </main>
      </div>
      {/* Prompt editing modal */}
      <AnimatePresence>
        {promptModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setPromptModal(null); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto"
            >
              <div className="p-5 border-b border-stone-200 dark:border-stone-700 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-stone-800 dark:text-stone-100 text-base">Regenerate Images</h3>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">{promptModal.chapterTitle}</p>
                </div>
                <button onClick={() => setPromptModal(null)} className="p-1.5 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-full">
                  <X className="w-4 h-4 text-stone-500" />
                </button>
              </div>

              {promptModal.loading ? (
                <div className="p-10 flex flex-col items-center gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                  <p className="text-sm text-stone-500">Generating prompt with AI…</p>
                </div>
              ) : (
                <div className="p-5 space-y-4">
                  {/* Hindi summary */}
                  {promptModal.summaryHi && (
                    <div className="bg-orange-50 dark:bg-orange-950/30 rounded-lg p-3">
                      <p className="text-xs font-semibold text-orange-600 dark:text-orange-400 mb-1">Summary</p>
                      <p className="text-sm text-stone-700 dark:text-stone-300" style={{ fontFamily: "var(--font-devanagari)" }}>{promptModal.summaryHi}</p>
                    </div>
                  )}

                  {/* Editable prompt */}
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-stone-600 dark:text-stone-400 mb-1.5">
                      <Pencil className="w-3 h-3" />
                      Image Prompt (English)
                    </label>
                    <textarea
                      value={promptModal.prompt}
                      onChange={(e) => setPromptModal((prev) => prev ? { ...prev, prompt: e.target.value } : null)}
                      rows={5}
                      className="w-full rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-sm text-stone-800 dark:text-stone-200 p-3 focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none resize-y"
                      placeholder="Describe the scene you want to generate..."
                    />
                    <p className="text-[10px] text-stone-400 mt-1">Edit the prompt or choose a story below</p>
                  </div>

                  {/* Available stories from tatparya */}
                  {promptModal.stories.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-stone-600 dark:text-stone-400 mb-2">Stories from this chapter (from Tatparya)</p>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {promptModal.stories.map((story) => (
                          <button
                            key={story.index}
                            onClick={() => {
                              // Re-generate AI prompt using this story as context
                              setPromptModal((prev) => prev ? {
                                ...prev,
                                prompt: prev.prompt,
                                summaryHi: story.text,
                              } : null);
                              // Trigger a new AI prompt generation with the story context
                              (async () => {
                                try {
                                  const res = await fetch(`${API_BASE}/suggest-prompt/${promptModal.chapterNum}`);
                                  if (res.ok) {
                                    const data = await res.json();
                                    // Use the AI-generated prompt but show the selected story
                                    setPromptModal((prev) => prev ? {
                                      ...prev,
                                      summaryHi: story.text,
                                    } : null);
                                  }
                                } catch { /* ignore */ }
                              })();
                            }}
                            className="w-full text-left p-2.5 rounded-lg border border-stone-200 dark:border-stone-700 hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/20 transition-colors text-xs text-stone-600 dark:text-stone-400"
                            style={{ fontFamily: "var(--font-devanagari)" }}
                          >
                            {story.text}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => { setPromptModal(null); handleRegenerateImages(promptModal.chapterNum, 0); }}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold text-sm transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Queue regeneration
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Image regeneration reason modal — captures "what's wrong" before queueing */}
      <AnimatePresence>
        {regenReasonModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setRegenReasonModal(null); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full"
            >
              <div className="p-5 border-b border-stone-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-orange-100 rounded-xl flex items-center justify-center">
                    <RefreshCw className="w-4.5 h-4.5 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-stone-900">Regenerate image</h3>
                    <p className="text-xs text-stone-500">Chapter {regenReasonModal.chapterNum}</p>
                  </div>
                </div>
                <button onClick={() => setRegenReasonModal(null)} className="p-1.5 text-stone-400 hover:text-stone-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    What's wrong with the current image?
                  </label>
                  <p className="text-[11px] text-stone-500 mb-2">
                    Be specific — this will be added to the prompt for the next generation so the AI corrects this exact issue.
                  </p>
                  <textarea
                    autoFocus
                    placeholder="e.g. Woman has a beard / Krishna shown as adult instead of a child / Wrong scene — should be on the battlefield, not in a forest"
                    className="w-full text-sm border border-stone-300 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400 min-h-[100px]"
                    id="regen-reason-input"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        const val = (e.currentTarget as HTMLTextAreaElement).value;
                        if (regenReasonModal) submitRegenRequest(regenReasonModal.chapterNum, regenReasonModal.sceneIndex, val);
                      }
                    }}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "Woman has a beard",
                    "Man has flowers in hair",
                    "Wrong character age",
                    "Wrong setting/location",
                    "Doesn't match the story",
                    "Has text/captions",
                  ].map(preset => (
                    <button
                      key={preset}
                      onClick={() => {
                        const el = document.getElementById("regen-reason-input") as HTMLTextAreaElement | null;
                        if (el) {
                          el.value = el.value ? `${el.value}; ${preset}` : preset;
                          el.focus();
                        }
                      }}
                      className="text-[10px] px-2 py-1 rounded-full bg-stone-100 hover:bg-orange-100 text-stone-600 hover:text-orange-700 transition-colors"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => {
                      const el = document.getElementById("regen-reason-input") as HTMLTextAreaElement | null;
                      const val = el?.value || "";
                      if (regenReasonModal) submitRegenRequest(regenReasonModal.chapterNum, regenReasonModal.sceneIndex, val);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold text-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Queue regeneration
                  </button>
                  <button
                    onClick={() => setRegenReasonModal(null)}
                    className="px-4 py-2.5 text-stone-600 hover:bg-stone-100 rounded-xl font-medium text-sm"
                  >
                    Cancel
                  </button>
                </div>
                <p className="text-[10px] text-stone-400 text-center">
                  Tip: Cmd/Ctrl + Enter to submit
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
                {/* Page range inputs */}
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

                {/* Generate button */}
                {!summarizeModal.loading && !summarizeModal.summary && (
                  <button
                    onClick={() => handleSummarize(summarizeModal.fromPage, summarizeModal.toPage)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-semibold text-sm transition-colors active:scale-[0.98]"
                  >
                    <Sparkles className="w-4 h-4" /> Generate Summary
                  </button>
                )}

                {/* Loading state */}
                {summarizeModal.loading && (
                  <div className="flex flex-col items-center gap-3 py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                    <p className="text-sm text-stone-500 font-medium">Analyzing pages {summarizeModal.fromPage}–{summarizeModal.toPage}…</p>
                  </div>
                )}

                {/* Summary result */}
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

      {/* Floating bookmark FAB — saves the current line within the visible page */}
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
        {bookmarkSaved
          ? <Check className="w-5 h-5" />
          : <Bookmark className={`w-5 h-5 ${bookmarkSaved ? "fill-white" : ""}`} />}
        {bookmarkSaved && (
          <motion.span
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute -top-9 right-0 whitespace-nowrap text-[11px] font-semibold bg-stone-800 text-white px-2.5 py-1 rounded-md shadow-lg"
          >
            Saved!
          </motion.span>
        )}
      </motion.button>

      {/* Undo toast */}
      <AnimatePresence>
        {undoToast && (
          <motion.div
            initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-stone-800 text-white rounded-xl shadow-2xl px-5 py-3 text-sm"
          >
            <span>{undoToast.message}</span>
            <button
              onClick={handleUndo}
              className="flex items-center gap-1.5 px-3 py-1 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold text-xs transition-colors"
            >
              <Undo2 className="w-3.5 h-3.5" />
              Undo
            </button>
            <button onClick={() => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); setUndoToast(null); }} className="p-1 hover:bg-stone-700 rounded-full transition-colors">
              <X className="w-3.5 h-3.5 text-stone-400" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  );
}
