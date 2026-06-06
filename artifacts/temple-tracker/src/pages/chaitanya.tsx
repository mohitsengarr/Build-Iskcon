import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { fadeInUp } from "@/lib/animations";
import { applyTextCorrections } from "@/lib/bhagwatham-config";
import {
  BookOpen, ChevronLeft, ChevronRight, Loader2,
  Search, BookMarked, Sparkles,
  List, X, ChevronDown, ChevronUp, Languages,
  Bookmark, Trash2, LogIn, Volume2, Square, Check,
  Settings, Minus, Plus, Maximize2, Pencil, Wand2, Bold,
  CornerDownLeft, Combine, Keyboard, Delete, RefreshCw,
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
}

const DEFAULT_SETTINGS: ReadingSettings = { fontSize: 15, lineHeight: 1.8, maxWidth: 768, theme: "light" };

function loadSettings(): ReadingSettings {
  try {
    const raw = localStorage.getItem(`${BOOK_KEY}_settings`);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch { return DEFAULT_SETTINGS; }
}

function saveSettings(s: ReadingSettings) {
  localStorage.setItem(`${BOOK_KEY}_settings`, JSON.stringify(s));
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
  const ps = pageEl.querySelectorAll("p");
  const headerBuffer = 90;
  let best: HTMLParagraphElement | null = null;
  let bestTop = Infinity;
  for (const p of ps) {
    const rect = (p as HTMLElement).getBoundingClientRect();
    if (!(p as HTMLElement).textContent?.trim()) continue;
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
  localStorage.setItem(`${BOOK_KEY}_section_overrides`, JSON.stringify(o));
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
  part: string;             // "Adi-lila" | "Madhya-lila" | "Antya-lila"
  number: number;           // chapter number within the part
  title: string;
  pageNumber: number;       // first page of the chapter
  batchNumber: number;
  ocrStatus?: string;
}

// Sensible order for the three lilas.
const PART_ORDER = ["Adi-lila", "Madhya-lila", "Antya-lila"];
function getPartOrder(part: string): number {
  const idx = PART_ORDER.indexOf(part);
  return idx >= 0 ? idx : PART_ORDER.length + part.charCodeAt(0);
}

// Display labels for each lila (Hindi + English).
const PART_LABELS: Record<string, { hi: string; en: string }> = {
  "Adi-lila":    { hi: "आदि-लीला",    en: "Adi-lila" },
  "Madhya-lila": { hi: "मध्य-लीला",   en: "Madhya-lila" },
  "Antya-lila":  { hi: "अंत्य-लीला",  en: "Antya-lila" },
};

function partLabelHi(part: string): string {
  return PART_LABELS[part]?.hi || part;
}

const API_BASE = `/api/${BOOK_KEY}`;
const MUTATION_API_BASE = `${import.meta.env.VITE_PUBLIC_API_URL || ""}/api/${BOOK_KEY}`;
const isMutationApiConfigured = () =>
  Boolean(import.meta.env.VITE_PUBLIC_API_URL) || (typeof window !== "undefined" && window.location.hostname === "localhost");

// ── Sarvam TTS (HTTP streaming) ──────────────────────────────────────────
const SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech/stream";
const SARVAM_KEY = "sk_c81tz6ss_p9kDbB6SEeYB7s9V7yQHbUl8";

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
  const trySet = () => localStorage.setItem(TTS_CACHE_PREFIX + key, b64);
  try {
    trySet();
    ttsCacheTouch(key);
  } catch {
    try {
      const idxRaw = localStorage.getItem(TTS_CACHE_INDEX_KEY);
      const idx: Record<string, number> = idxRaw ? JSON.parse(idxRaw) : {};
      const entries = Object.entries(idx).sort((a, b) => a[1] - b[1]);
      const drop = Math.max(1, Math.floor(entries.length * 0.25));
      for (let i = 0; i < drop; i++) {
        const [k] = entries[i];
        try { localStorage.removeItem(TTS_CACHE_PREFIX + k); } catch { /* */ }
        delete idx[k];
      }
      localStorage.setItem(TTS_CACHE_INDEX_KEY, JSON.stringify(idx));
      trySet();
      ttsCacheTouch(key);
    } catch { /* */ }
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

  const response = await fetch(SARVAM_TTS_URL, {
    method: "POST",
    headers: {
      "api-subscription-key": SARVAM_KEY,
      "Content-Type": "application/json",
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
const TBL_REGEN_REQS    = `${BOOK_KEY}_image_regen_requests`;

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
  return line.replace(/^\d{2,5}[\]\)]*\s+/, "");
}

function renderInlineBold(line: string): React.ReactNode {
  if (!line.includes("**")) return line;
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function cleanOcrText(text: string): string {
  let result = text
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
  const hindiPP = (body.match(/(?:^|\s)(?:का|की|के|को|में|पर|से|ने|तक|और|कि|जब|तब|नहीं|प्रति|बिना|साथ|लिए|बारे|जैसे|क्योंकि|इसलिए)(?:\s|$)/gu) || []).length;
  const hindiVerb = /(?:है[ँं]?|हैं|था|थे|थी|गया|गयी|किया|करें|रहा|सकता|चाहिए|होता|होती)(?:\s|।|$)/u.test(body);
  if (hindiPP >= 2) return false;
  if (hindiVerb && (visarga + sanskritEndings) < 2) return false;
  return (visarga + sanskritEndings + sanskritParticles) >= 1;
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

function VoiceEditToolbar({ allPages, setAllPages }: { allPages: PageContent[]; setAllPages: React.Dispatch<React.SetStateAction<PageContent[]>> }) {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [selectedText, setSelectedText] = useState("");
  const [appliedFlash, setAppliedFlash] = useState(false);
  const pageNumRef = useRef<number | null>(null);
  const selectionContextRef = useRef<{ before: string; after: string }>({ before: "", after: "" });
  const [selectionIsBoldDom, setSelectionIsBoldDom] = useState(false);
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
        setPosition({ x: rect.left + rect.width / 2, y: rect.top - 10 });
        setSelectedText(text);
        selectionContextRef.current = { before: ctxBefore, after: ctxAfter };
        pageNumRef.current = pageNum;

        let domBold = false;
        try {
          let node: Node | null = range.commonAncestorContainer;
          if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
          while (node && node instanceof HTMLElement) {
            const tag = node.tagName?.toUpperCase();
            if (tag === "STRONG" || tag === "B") { domBold = true; break; }
            const fw = window.getComputedStyle(node).fontWeight;
            if (fw === "bold" || (fw && parseInt(fw, 10) >= 600)) { domBold = true; break; }
            if (node.hasAttribute && node.hasAttribute("data-page-num")) break;
            node = node.parentNode;
          }
        } catch { /* */ }
        setSelectionIsBoldDom(domBold);

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
    if (leftTrim && cleanedNew.startsWith(leftTrim)) cleanedNew = cleanedNew.slice(leftTrim.length);
    if (rightTrim && cleanedNew.endsWith(rightTrim)) cleanedNew = cleanedNew.slice(0, cleanedNew.length - rightTrim.length);
    const effectiveOld = cleanedOld;
    const effectiveNew = cleanedNew.trim() || newText;

    let savedText: string | null = null;
    setAllPages(prev => {
      const targetPage = prev.find(p => p.pageNumber === pageNum);
      if (!targetPage) return prev;

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

      if (fullNewText === sourceText && effectiveOld.trim().length > 24) {
        const cleanedChars: number[] = [];
        let cleaned = "";
        for (let i = 0; i < sourceText.length; i++) {
          const ch = sourceText[i];
          if (/\s/.test(ch)) continue;
          if (ch === "‍" || ch === "‌") continue;
          let mapped = ch.normalize("NFC");
          if (/[-‐-―−]/.test(mapped)) mapped = "-";
          if (mapped === "।" || mapped === "॥" || mapped === "|") mapped = "।";
          if (mapped === "ः" || mapped === ":") mapped = "ः";
          if (QUOTE_RE.test(mapped)) mapped = '"';
          cleaned += mapped;
          cleanedChars.push(i);
        }
        const stripSel = (s: string) =>
          s.normalize("NFC")
            .replace(/[‐-―−]/g, "-")
            .replace(/[॥|]/g, "।")
            .replace(/[:]/g, "ः")
            .replace(/["'´`‘’‚‛“”„‟ʻʼ′″]/g, '"')
            .replace(/[‍‌]/g, "")
            .replace(/\s+/g, "");
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
          const tryPage = prev.find(p => p.pageNumber === tryNum);
          if (!tryPage) continue;
          const src = tryPage.text;
          let replaced = src.replace(effectiveOld, effectiveNew);
          if (replaced === src) {
            try { replaced = src.replace(new RegExp(buildFlexibleRegex(effectiveOld)), effectiveNew); } catch { /* */ }
          }
          if (replaced !== src) {
            console.info(`[applyEdit] matched on adjacent page ${tryNum} (selection-captured page was ${pageNum})`);
            savedText = replaced;
            (selectionContextRef.current as { resolvedPageNum?: number }).resolvedPageNum = tryNum;
            return prev.map(p => p.pageNumber !== tryNum ? p : { ...p, text: replaced });
          }
        }

        console.warn("[applyEdit] All strategies failed:", { pageNum });
        setTimeout(() => alert(
          "Couldn't locate the highlighted text in the page source.\n\n" +
          "Try selecting a smaller piece within one paragraph.",
        ), 0);
        return prev;
      }

      savedText = fullNewText;
      return prev.map(p => p.pageNumber !== pageNum ? p : { ...p, text: fullNewText });
    });

    if (!savedText) return;
    window.getSelection()?.removeAllRanges();
    setAppliedFlash(true);
    setTimeout(() => setAppliedFlash(false), 1500);

    const resolvedPageNum =
      (selectionContextRef.current as { resolvedPageNum?: number }).resolvedPageNum ?? pageNum;
    (selectionContextRef.current as { resolvedPageNum?: number }).resolvedPageNum = undefined;
    try {
      const res = await sbFetch(TBL_PAGE_EDITS, {
        method: "POST",
        headers: { Prefer: "return=representation,resolution=merge-duplicates" },
        body: JSON.stringify({
          page_number: resolvedPageNum,
          text: savedText,
          edited_at: new Date().toISOString(),
          applied_to_git: false,
        }),
      });
      if (!res.ok) {
        const data = await res.text().catch(() => "");
        alert(`Save failed: ${data || res.statusText}`);
      }
    } catch (err) {
      alert(`Save failed — could not reach Supabase.\n${String(err)}`);
    }
  }, [setAllPages]);

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
        setTtsPlaying(false);
        if (audio.src) URL.revokeObjectURL(audio.src);
        ttsAudioRef.current = null;
      };
    } catch (err) {
      console.error("[TTS] Sarvam playback failed:", err);
      setTtsLoading(false);
      const errMsg = err instanceof Error ? err.message : String(err);
      if (/40\d/.test(errMsg)) {
        alert(`Listen failed: ${errMsg}.`);
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
    setSuggestion(null);
    let contextBefore = "";
    let contextAfter = "";
    if (pageNum) {
      const page = allPages.find(p => p.pageNumber === pageNum);
      if (page?.text) {
        const idx = page.text.indexOf(selectedText);
        if (idx >= 0) {
          contextBefore = page.text.substring(Math.max(0, idx - 600), idx);
          contextAfter = page.text.substring(idx + selectedText.length, idx + selectedText.length + 600);
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
          book: BOOK_KEY,
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
    }
  }, [selectedText, allPages, suggestLoading]);

  const requestQuickFix = useCallback(async () => {
    if (!selectedText || quickFixLoading || suggestLoading) return;
    const pageNum = pageNumRef.current;
    setQuickFixLoading(true);
    let contextBefore = "";
    let contextAfter = "";
    if (pageNum) {
      const page = allPages.find(p => p.pageNumber === pageNum);
      if (page?.text) {
        const idx = page.text.indexOf(selectedText);
        if (idx >= 0) {
          contextBefore = page.text.substring(Math.max(0, idx - 600), idx);
          contextAfter = page.text.substring(idx + selectedText.length, idx + selectedText.length + 600);
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
          book: BOOK_KEY,
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
      const newText = (data?.suggested_text || "").trim();
      setShow(false);
      if (newText && newText !== oldText) {
        void applyEdit(oldText, newText);
      }
    } catch (err) {
      console.warn("Quick AI fix error:", err);
    } finally {
      setQuickFixLoading(false);
    }
  }, [selectedText, allPages, quickFixLoading, suggestLoading, applyEdit]);

  const isCurrentSelectionBold = useMemo(() => {
    if (!selectedText) return false;
    if (selectedText.startsWith("**") && selectedText.endsWith("**") && selectedText.length >= 4) return true;
    if (selectedText.includes("**")) return true;
    const pageNum = pageNumRef.current;
    const page = pageNum ? allPages.find(p => p.pageNumber === pageNum) : null;
    if (page) {
      if (page.text.includes(`**${selectedText}**`)) return true;
      const idx = page.text.indexOf(selectedText);
      if (idx >= 0) {
        const before = page.text.substring(0, idx);
        const starsBefore = (before.match(/\*\*/g) || []).length;
        if (starsBefore % 2 === 1) return true;
      }
    }
    return selectionIsBoldDom;
  }, [selectedText, allPages, selectionIsBoldDom]);

  const toggleBold = useCallback(() => {
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

      const idx = page.text.indexOf(selectedText);
      if (idx >= 0) {
        const selStart = idx;
        const selEnd = idx + selectedText.length;
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

    if (selectionIsBoldDom) {
      setShow(false);
      return;
    }

    void applyEdit(selectedText, `**${selectedText}**`);
    setShow(false);
  }, [selectedText, allPages, selectionIsBoldDom, applyEdit]);

  const insertLineBreak = useCallback(() => {
    if (!selectedText) return;
    const trimmed = selectedText.replace(/^\s+/, "");
    applyEdit(selectedText, "\n\n" + trimmed);
    setShow(false);
  }, [selectedText, applyEdit]);

  const removeSpaces = useCallback(() => {
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

  if (!show) return null;

  const isCentered = !!suggestion || manualFixMode;
  const flipBelow = !isCentered && position.y < 120;

  return (
    <>
      {isCentered && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]"
          onClick={() => { setSuggestion(null); setManualFixMode(false); }}
        />
      )}
      <div
        ref={toolbarRef}
        className={`fixed z-50 bg-white rounded-2xl shadow-2xl border border-stone-200 max-h-[85vh] overflow-y-auto ${
          isCentered
            ? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            : `-translate-x-1/2 ${flipBelow ? "translate-y-2" : "-translate-y-full"}`
        }`}
        style={
          isCentered
            ? { width: manualFixMode ? "min(560px, 95vw)" : "min(480px, 92vw)" }
            : {
                left: Math.max(100, Math.min(position.x, window.innerWidth - 100)),
                top: flipBelow ? position.y + 30 : Math.max(60, position.y - 5),
                minWidth: 220,
                maxWidth: "min(420px, 92vw)",
              }
        }
      >
        <div className="p-2">
          <div className="flex flex-wrap items-center gap-1 mb-2" onMouseDown={e => e.preventDefault()}>
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
              title={isCurrentSelectionBold ? "Remove bold" : "Make bold"}
            >
              <Bold className="w-3.5 h-3.5" /> {isCurrentSelectionBold ? "Remove bold" : "Make bold"}
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
              onClick={requestSuggestion}
              disabled={suggestLoading || quickFixLoading}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-stone-600 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
              title="Ask AI to fix this text"
            >
              {suggestLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              AI fix text &amp; format
            </button>
            <button
              onClick={requestQuickFix}
              disabled={suggestLoading || quickFixLoading}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-stone-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
              title="Apply AI fix instantly without preview"
            >
              {quickFixLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
              Quick AI fix
            </button>
            <button
              onClick={() => { setManualFixText(selectedText); setManualFixMode(true); }}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-stone-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
              title="Edit yourself with an on-screen Devanagari keyboard"
            >
              <Keyboard className="w-3.5 h-3.5" /> Manual fix
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
                  ? suggestion.suggested_text.split("\n").map((ln, i, arr) => (
                      <span key={i}>
                        {renderInlineBold(ln)}
                        {i < arr.length - 1 && "\n"}
                      </span>
                    ))
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
                    setSuggestion(null);
                    void applyEdit(oldText, newText);
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

// ── Content Renderer ───────────────────────────────────────────────────────

function RenderContent({ text, textEn, lang, themeKey = "light", pageNumber, overrides, onOverridesChange, prevPageEndKind, nextPageStartsNumberedShlok }: {
  text: string;
  textEn?: string;
  lang: "hi" | "en";
  themeKey?: Theme;
  pageNumber?: number;
  overrides?: SectionOverride[];
  onOverridesChange?: (pageNum: number, overrides: SectionOverride[]) => void;
  prevPageEndKind?: string;
  nextPageStartsNumberedShlok?: boolean;
}) {
  const t = THEME_STYLES[themeKey];

  if (lang === "en" && textEn) {
    const enLines = textEn.split("\n")
      .filter((l) => l.trim() && !isStandalonePageNumber(l))
      .map((l) => stripLeadingPageNumber(l));
    return (
      <div className="space-y-4">
        {enLines.map((l, i) => (
          <p key={i} className={`leading-[1.8] ${t.text} mb-1`}>{renderInlineBold(l)}</p>
        ))}
      </div>
    );
  }

  const lines = cleanOcrText(text).split("\n")
    .filter((l) => l.trim() && !isStandalonePageNumber(l))
    .map((l) => stripLeadingPageNumber(l));

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
    const matches = line.match(/(?:^|\s)(?:का|की|के|को|में|पर|से|ने|तक|और|या|भी|तो|ही|यह|वह|जो|इस|उस|कि|जब|तब|नहीं|प्रति|बिना|साथ|लिए|बारे|जैसे|क्योंकि|इसलिए|फिर|अभी|कभी|सभी|किसी|अपने|उनके|इनके|जिसमें|जिससे|जिसको)(?:\s|[।,;:\)]|$)/gu);
    return matches ? matches.length : 0;
  };
  const HINDI_VERB_RE = /(?:है[ँं]?|हैं|हैँ|था|थे|थी|गया|गयी|गई|किया|करें|करे|रहा|सकता|चाहिए|हुई|हुए|होता|होती|होते|करते|करता|करना|बताया|कहा|सुना|दिया|लिया|पड़ा|आया|चुके|चुका|रहे|रही|जाता|जाती|जाते|मिलता|रखा|बचा|डाला|बनाकर|कहलाता|कहलाती|सकती|सकते|देखे|लगती|लगते|भोगता|जानता|उठाते|करोगे|करेगा|करेगी|करेंगे|दिखाया|सुनाया|बैठकर|होकर|करके|लाकर|जाकर|दिखाते|चलाते|बताते|सुनाते|पालते|रहते|चलते|बनाते|मानते|जानते|कहते|देते|लेते|आते|होनी|चाहती|चाहते|पाते|दिखती|मिलती|बनती|चलती|आती|पाती)(?:\s|[।,;:\)]|$)/u;

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
    if (!t) continue;

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

  const [editMode, setEditMode] = useState(false);
  const [selStart, setSelStart] = useState<number | null>(null);
  const [selEnd, setSelEnd] = useState<number | null>(null);

  const editorLines = useMemo(() => {
    const result: { text: string; kind: SectionKind; lineIdx: number }[] = [];
    let idx = 0;
    for (const sec of sections) {
      for (const l of sec.lines) {
        const kind = (sec.kind === "chapter" || sec.kind === "ref-shlok") ? "text" : sec.kind as SectionKind;
        result.push({ text: l, kind, lineIdx: idx++ });
      }
    }
    return result;
  }, [sections, editMode]); // eslint-disable-line react-hooks/exhaustive-deps

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
                  {sec.lines.map((l, j) => (
                    <p key={j} className={`font-bold leading-[1.9] mb-0.5 ${t.text}`} style={{ fontSize: "1.15em", fontFamily: "var(--font-sanskrit)" }}>{renderInlineBold(l)}</p>
                  ))}
                </div>
              </div>
            );
          }
          case "ref-shlok": {
            const isRefShlokContinuation = i === 0 && prevPageEndKind === "ref-shlok";
            return (
              <div key={i} data-section-type="ref-shlok" className={isRefShlokContinuation ? "" : `pl-4 border-l-2 my-2 ${themeKey === "dark" ? "border-amber-800/40" : themeKey === "sepia" ? "border-[#c4ad80]" : "border-[#c4956a]/40"}`}>
                {sec.lines.map((l, j) => (
                  <p key={j} className={`leading-[1.7] italic mb-0.5 ${isRefShlokContinuation ? "pl-4" : ""} ${themeKey === "dark" ? "text-amber-400/70" : themeKey === "sepia" ? "text-[#6b4020]" : "text-[#8b5a30]"}`} style={{ fontSize: "0.9em", fontFamily: "var(--font-sanskrit)" }}>{renderInlineBold(l)}</p>
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
                  return (
                    <p key={j} className={`leading-[1.7] mb-0.5 ${themeKey === "dark" ? "text-blue-300/80" : themeKey === "sepia" ? "text-[#1a3a6a]" : "text-[#1a4a8a]"}`} style={{ fontSize: "0.8em", fontFamily: "var(--font-devanagari)" }}>
                      {parts.map((part, k) => {
                        if (part === "—" || part === "--" || part === "- ") return <span key={k}>—</span>;
                        const isMeaning = k > 0 && (parts[k - 1] === "—" || parts[k - 1] === "--" || parts[k - 1] === "- ");
                        return isMeaning
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
            return (
              <div key={i} data-section-type="anuvad" className={isAnuvadContinuation ? "" : "mt-3"}>
                {sec.lines.map((l, j) => (
                  <p key={j} className={`leading-[2] mb-1 ${t.text}`} style={{ fontSize: "0.95em", fontFamily: "var(--font-devanagari)" }}>{renderInlineBold(l)}</p>
                ))}
              </div>
            );
          }
          case "tatparya": {
            const isContinuation = i === 0 && (prevPageEndKind === "tatparya" || prevPageEndKind === "ref-shlok");
            return (
              <div key={i} data-section-type="tatparya" className={isContinuation ? "" : "mt-4 sm:mt-5"}>
                {sec.lines.map((l, j) => (
                  <p key={j} className={`leading-[2] mb-1 ${t.text}`} style={{ fontSize: "0.95em", fontFamily: "var(--font-devanagari)" }}>
                    {j === 0 && !isContinuation && <><span className="font-semibold">तात्पर्य :</span>{" "}</>}
                    {renderInlineBold(l)}
                  </p>
                ))}
              </div>
            );
          }
          default:
            return (
              <div key={i} data-section-type="text">
                {sec.lines.map((l, j) => (
                  <p key={j} className={`leading-[1.8] ${t.text} mb-1`} style={{ fontSize: "1em" }}>{renderInlineBold(l)}</p>
                ))}
              </div>
            );
        }
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
// Grouped by `part` (string: "Adi-lila", "Madhya-lila", "Antya-lila") instead
// of `canto` (integer 1..12 in bhagwatham). Order follows PART_ORDER.

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

  const activePart = activeChapter
    ? chapters.find(c => c.globalNumber === activeChapter)?.part ?? null
    : null;
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

                  // Group chapters by part (string), preserve sensible order
                  const partGroups = new Map<string, ChapterEntry[]>();
                  for (const ch of filteredChapters) {
                    if (!partGroups.has(ch.part)) partGroups.set(ch.part, []);
                    partGroups.get(ch.part)!.push(ch);
                  }
                  const sortedEntries = Array.from(partGroups.entries())
                    .sort((a, b) => getPartOrder(a[0]) - getPartOrder(b[0]));

                  return sortedEntries.map(([part, chs]) => {
                    const isExpanded = sidebarSearch.trim() ? true : expandedParts.has(part);
                    const hasActiveChapter = chs.some(ch => ch.globalNumber === activeChapter);
                    const partInfo = PART_LABELS[part] || { hi: part, en: part };
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
  // Map<globalNumber → page-index-in-allPages> so we can navigate by chapter.
  // Page numbers in chaitanya are per-chapter (each chapter is its own batch),
  // so we synthesize a contiguous reading sequence across chapter boundaries.
  const batchCacheRef = useRef<Map<number, PageContent[]>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");
  const [sectionOverrides, setSectionOverrides] = useState<PageOverrides>(loadSectionOverrides);
  const handleOverridesChange = useCallback((pageNum: number, newOverrides: SectionOverride[]) => {
    setSectionOverrides(prev => {
      const next = { ...prev };
      if (newOverrides.length === 0) { delete next[pageNum]; } else { next[pageNum] = newOverrides; }
      saveSectionOverrides(next);
      return next;
    });
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

    const pageTexts = allPages
      .filter(p => p.pageNumber >= from && p.pageNumber <= to)
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
  }, [allPages]);

  // Fetch chapter index from server.
  const fetchChapterIndex = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/chapter-index`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.chapters?.length) return;
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
      if (!res.ok) return [];
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
      await sbFetch(TBL_BOOKMARKS, {
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
      await fetchBookmarks();
      setBookmarkSaved(true);
      setTimeout(() => setBookmarkSaved(false), 2000);
    } catch { /* */ }
  }, [readerId, readerName, allPages, currentPage, visiblePageNum, chapters, fetchBookmarks]);

  const deleteBookmark = useCallback(async (b: BookmarkEntry) => {
    if (!readerId) return;
    try {
      await sbFetch(`${TBL_BOOKMARKS}?id=eq.${b.id}&reader_id=eq.${encodeURIComponent(readerId)}`, { method: "DELETE" });
      setBookmarks(prev => prev.filter(x => x.id !== b.id));
    } catch { /* */ }
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
  // the user types into the page-number input box. We just search.
  const goToOriginalPageNum = (pageNum: number) => {
    const matchIdx = allPages.findIndex(p => (p.pageNumber % 100000) >= pageNum);
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
    const positions = JSON.parse(localStorage.getItem(`${BOOK_KEY}_chapter_positions`) || "{}");
    positions[ch.globalNumber] = { pageNumber: ch.pageNumber, scrollOffset: 0 };
    localStorage.setItem(`${BOOK_KEY}_chapter_positions`, JSON.stringify(positions));
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
          if (!e.ctrlKey && !e.metaKey) saveBookmark();
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
          <VoiceEditToolbar allPages={allPages} setAllPages={setAllPages} />

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
                    <span className="text-orange-600 font-bold shrink-0">{currentChapterEntry?.part?.split("-")[0] || ""}</span>
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
            {loading ? (
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
                        {pageIdx > 0 && !hidePageDivider && !isFirstPageOfChapter && (
                          <div className={`flex items-center gap-3 my-8 sm:my-10 ${theme.muted}`}>
                            <div className={`flex-1 h-px ${settings.theme === "dark" ? "bg-white/10" : settings.theme === "sepia" ? "bg-amber-300/40" : "bg-orange-200/60"}`} />
                            <span className="text-[10px] font-medium opacity-50 shrink-0 px-2">· {displayPageNum(page.pageNumber)} ·</span>
                            <div className={`flex-1 h-px ${settings.theme === "dark" ? "bg-white/10" : settings.theme === "sepia" ? "bg-amber-300/40" : "bg-orange-200/60"}`} />
                          </div>
                        )}
                        {pageIdx > 0 && hidePageDivider && !isFirstPageOfChapter && (
                          <p className={`text-[10px] ${theme.muted} font-medium text-right mt-1 mb-1 opacity-40`}>· {displayPageNum(page.pageNumber)} ·</p>
                        )}
                        {pageIdx === 0 && !isFirstPageOfChapter && <p className={`text-[10px] ${theme.muted} font-medium text-right mt-0 mb-2 opacity-40`}>· {displayPageNum(page.pageNumber)} ·</p>}
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
