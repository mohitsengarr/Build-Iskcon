import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { fadeInUp, fadeIn } from "@/lib/animations";
import { applyTextCorrections } from "@/lib/bhagwatham-config";
import {
  BookOpen, ChevronLeft, ChevronRight, Loader2,
  RefreshCw, Search, BookMarked, Sparkles,
  List, X, ChevronDown, ChevronUp, Image as ImageIcon, Languages,
  Download, Share2, Bookmark, Trash2, LogIn, Volume2, Square, Mic, MicOff, Check,
  Settings, Sun, Moon, Type, Minus, Plus, Maximize2, Undo2, Pencil, Wand2, Send,
} from "lucide-react";

// ── Reading Settings ─────────────────────────────────────────────────────────

type Theme = "light" | "dark" | "sepia";

interface ReadingSettings {
  fontSize: number;   // 14-24
  lineHeight: number; // 1.6-2.4
  maxWidth: number;   // 640-960
  theme: Theme;
}

const DEFAULT_SETTINGS: ReadingSettings = { fontSize: 15, lineHeight: 1.8, maxWidth: 768, theme: "light" };

function loadSettings(): ReadingSettings {
  try {
    const raw = localStorage.getItem("bhagwatham_settings");
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch { return DEFAULT_SETTINGS; }
}

function saveSettings(s: ReadingSettings) {
  localStorage.setItem("bhagwatham_settings", JSON.stringify(s));
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
  const update = (partial: Partial<ReadingSettings>) => {
    const next = { ...settings, ...partial };
    onChange(next);
    saveSettings(next);
  };

  return (
    <motion.div
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
  created_at: string;
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
  localStorage.setItem("bhagwatham_section_overrides", JSON.stringify(o));
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

function BookmarkPanel({ bookmarks, onJump, onDelete }: {
  bookmarks: BookmarkEntry[];
  onJump: (b: BookmarkEntry) => void;
  onDelete: (b: BookmarkEntry) => void;
}) {
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

// ── Determine what section kind a page ends with (for cross-page continuity) ──
function getPageEndKind(text: string): string {
  if (!text) return "text";
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  let lastKind = "text";
  for (const line of lines) {
    if (/^तात्पर्य/u.test(line)) lastKind = "tatparya";
    else if (/^अनुवाद/u.test(line)) lastKind = "anuvad";
    else if (/^शब्दार्थ/u.test(line)) lastKind = "shabdarth";
    else if (/॥/u.test(line)) lastKind = (lastKind === "tatparya") ? "ref-shlok" : "shlok";
    else if (/^(अध्याय|स्कन्ध|Chapter)/iu.test(line)) lastKind = "text";
    // Detect implicit shabdarth→anuvad transition:
    // shabdarth lines have "—" or "--" with ";", anuvad lines don't
    else if (lastKind === "shabdarth" && !(line.includes("—") || line.includes("--")) && !line.includes(";")) {
      lastKind = "anuvad";
    }
    // After shlok, non-verse Hindi prose = anuvad
    else if (lastKind === "shlok" && !/॥/u.test(line)) {
      lastKind = "anuvad";
    }
  }
  return lastKind;
}

// ── Voice Edit (Speech-to-Text for selected text) ──────────────────────────

function VoiceEditToolbar({ allPages, setAllPages }: { allPages: PageContent[]; setAllPages: (pages: PageContent[]) => void }) {
  const [show, setShow] = useState(false);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [selectedText, setSelectedText] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const pageNumRef = useRef<number | null>(null);

  useEffect(() => {
    const onSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        if (!recording && !processing) setShow(false);
        return;
      }
      const text = sel.toString().trim();
      if (text.length < 2) return;

      // Find which page this selection is in
      const range = sel.getRangeAt(0);
      const pageEl = range.startContainer.parentElement?.closest("[data-page-num]");
      const pageNum = pageEl ? parseInt(pageEl.getAttribute("data-page-num") || "0", 10) : 0;

      const rect = range.getBoundingClientRect();
      setPosition({ x: rect.left + rect.width / 2, y: rect.top - 10 });
      setSelectedText(text);
      pageNumRef.current = pageNum;
      setShow(true);
    };

    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [recording, processing]);

  const applyEdit = useCallback((oldText: string, newText: string) => {
    const pageNum = pageNumRef.current;
    if (!pageNum || !oldText || !newText) return;

    // Find the page and replace the text in it
    const updated = allPages.map(p => {
      if (p.pageNumber !== pageNum) return p;
      return { ...p, text: p.text.replace(oldText, newText) };
    });
    setAllPages(updated);
    window.getSelection()?.removeAllRanges();
  }, [allPages, setAllPages]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setRecording(false);
        setProcessing(true);

        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const capturedText = selectedText;
        try {
          const res = await fetch("/api/bhagwatham/stt", {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: blob,
          });
          const data = await res.json();
          if (data.transcript) {
            applyEdit(capturedText, data.transcript);
          }
        } catch { /* STT failed */ }
        setProcessing(false);
        setShow(false);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);

      // Auto-stop after 25 seconds (API limit is 30s)
      setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 25000);
    } catch {
      setRecording(false);
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
  };

  // Listen to selected word via Sarvam TTS (with cache)
  const listenToWord = useCallback(async () => {
    if (!selectedText) return;
    try {
      const cacheKey = `tts_${btoa(unescape(encodeURIComponent(selectedText.substring(0, 200))))}`;
      let audioBase64 = "";
      try { audioBase64 = sessionStorage.getItem(cacheKey) || ""; } catch { /* */ }

      if (!audioBase64) {
        const res = await fetch("/api/bhagwatham/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: selectedText }),
        });
        if (res.ok) {
          const data = await res.json();
          audioBase64 = data.audio || "";
          if (audioBase64) try { sessionStorage.setItem(cacheKey, audioBase64); } catch { /* */ }
        }
      }

      if (audioBase64) {
        new Audio(`data:audio/wav;base64,${audioBase64}`).play();
        return;
      }
    } catch { /* fallback */ }
    // Browser fallback
    const u = new SpeechSynthesisUtterance(selectedText);
    u.lang = "hi-IN"; u.rate = 0.5; u.pitch = 0.7;
    window.speechSynthesis.speak(u);
  }, [selectedText]);

  // Dictionary lookup state
  const [dictResult, setDictResult] = useState<{ word: string; meaning: string; examples: string[] } | null>(null);
  const [dictLoading, setDictLoading] = useState(false);

  const lookupWord = useCallback(async () => {
    if (!selectedText || selectedText.length > 50) return;
    setDictLoading(true);
    setDictResult(null);
    try {
      const res = await fetch("/api/bhagwatham/dictionary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: selectedText }),
      });
      if (res.ok) {
        const data = await res.json();
        setDictResult(data);
      }
    } catch { /* ignore */ }
    setDictLoading(false);
  }, [selectedText]);

  if (!show) return null;

  return (
    <>
      <div
        className="fixed z-50 bg-white rounded-2xl shadow-2xl border border-stone-200 -translate-x-1/2 -translate-y-full"
        style={{ left: Math.max(100, Math.min(position.x, window.innerWidth - 100)), top: Math.max(60, position.y - 5), minWidth: 220 }}
      >
        {processing ? (
          <div className="flex items-center gap-2 px-4 py-3 text-xs text-stone-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Transcribing...
          </div>
        ) : recording ? (
          <div className="flex items-center gap-2 px-4 py-3">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs text-red-600 font-medium flex-1">Recording...</span>
            <button onClick={stopRecording} className="p-1.5 rounded-full bg-red-100 text-red-600 hover:bg-red-200">
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="p-2">
            {/* Action buttons row */}
            <div className="flex items-center gap-1 mb-2">
              <button onClick={listenToWord} className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-stone-600 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors" title="Listen">
                <Volume2 className="w-3.5 h-3.5" /> Listen
              </button>
              <button onClick={lookupWord} disabled={dictLoading} className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-stone-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Dictionary meaning">
                {dictLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookOpen className="w-3.5 h-3.5" />} Meaning
              </button>
              <button onClick={startRecording} className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-stone-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Voice edit">
                <Mic className="w-3.5 h-3.5" /> Voice
              </button>
              <button onClick={() => { setShow(false); setDictResult(null); }} className="p-1.5 text-stone-400 hover:text-stone-600 ml-auto">
                <X className="w-3 h-3" />
              </button>
            </div>
            {/* Edit input */}
            <input
              type="text"
              defaultValue={selectedText}
              className="w-full text-xs border border-stone-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-orange-400"
              placeholder="Type correction, press Enter..."
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  applyEdit(selectedText, (e.target as HTMLInputElement).value);
                  setShow(false);
                }
              }}
            />
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
        audioRef.current = null;
      }
      window.speechSynthesis.cancel();
      setPlaying(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Check cache first (localStorage)
      const cacheKey = `tts_${btoa(unescape(encodeURIComponent(text.substring(0, 200))))}`;
      let audioBase64 = "";
      try { audioBase64 = sessionStorage.getItem(cacheKey) || ""; } catch { /* ignore */ }

      if (!audioBase64) {
        // Fetch from Sarvam Bulbul v3 (soham voice)
        const res = await fetch("/api/bhagwatham/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error("TTS API failed");
        const data = await res.json();
        audioBase64 = data.audio || "";
        // Cache the audio in sessionStorage (survives page navigation, cleared on tab close)
        if (audioBase64) {
          try { sessionStorage.setItem(cacheKey, audioBase64); } catch { /* storage full */ }
        }
      }

      if (audioBase64) {
        const audio = new Audio(`data:audio/wav;base64,${audioBase64}`);
        audio.onended = () => { setPlaying(false); audioRef.current = null; };
        audio.onerror = () => { setPlaying(false); audioRef.current = null; };
        audioRef.current = audio;
        await audio.play();
        setPlaying(true);
      }
    } catch {
      // Fallback to browser SpeechSynthesis
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
    } finally {
      setLoading(false);
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

function RenderContent({ text, textEn, lang, chapterImages, themeKey = "light", onRegenerateImages, regeneratingChapters, onDeleteImage, chapterNumMapper, pageNumber, overrides, onOverridesChange, prevPageEndKind }: { text: string; textEn?: string; lang: "hi" | "en"; chapterImages?: Map<number, Array<{ url: string; description: string; sceneIndex?: number; isInstagram?: boolean }>>; themeKey?: Theme; onRegenerateImages?: (chapterNum: number) => void; regeneratingChapters?: Set<number>; onDeleteImage?: (chapterNum: number, sceneIndex: number) => void; chapterNumMapper?: (perSkandhNum: number) => number; pageNumber?: number; overrides?: SectionOverride[]; onOverridesChange?: (pageNum: number, overrides: SectionOverride[]) => void; prevPageEndKind?: string }) {
  const t = THEME_STYLES[themeKey];
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
        {enLines.map((l, i) => (
          <p key={i} className={`leading-[1.8] ${t.text} mb-1`}>{l}</p>
        ))}
      </div>
    );
  }

  const lines = cleanOcrText(text).split("\n")
    .filter((l) => l.trim() && !isStandalonePageNumber(l))
    .map((l) => stripLeadingPageNumber(l));

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
    if (!t) continue;

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

  // ── Section Editor (inline) ─────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [selStart, setSelStart] = useState<number | null>(null);
  const [selEnd, setSelEnd] = useState<number | null>(null);

  // Flatten sections into lines for the editor
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
        switch (sec.kind) {
          case "chapter": {
            const globalNum = sec.chapterNum && chapterNumMapper ? chapterNumMapper(sec.chapterNum) : sec.chapterNum;
            const allImgs = globalNum ? chapterImages?.get(globalNum) : undefined;
            const regularImgs = allImgs?.filter(img => !img.isInstagram);
            const igImgs = allImgs?.filter(img => img.isInstagram);
            return (
              <div key={i} id={`chapter-${globalNum}`} className="mt-6 mb-4 scroll-mt-20">
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
                {globalNum && onRegenerateImages && (
                  <button
                    onClick={() => onRegenerateImages(globalNum!)}
                    disabled={regeneratingChapters?.has(globalNum!) ?? false}
                    className={`flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg transition-colors ${regeneratingChapters?.has(globalNum!) ? "opacity-60 cursor-wait" : ""} ${themeKey === "dark" ? "text-orange-400 hover:bg-orange-900/30" : "text-orange-500 hover:bg-orange-100"}`}
                    title="Regenerate images"
                  >
                    <RefreshCw className={`w-3 h-3 ${regeneratingChapters?.has(globalNum!) ? "animate-spin" : ""}`} />
                    {regeneratingChapters?.has(globalNum!) ? "Generating…" : "Regenerate images"}
                  </button>
                )}
              </div>
            );
          }
          case "shlok":
            // Sanskrit verse — same color as body text, 1.35x size, bold, with speaker (SEN-109: stronger top divider)
            return (
              <div key={i} className="my-5 sm:my-6">
                {i > 0 && sections[i - 1].kind !== "chapter" && (
                  <div className={`mb-4 h-px ${themeKey === "dark" ? "bg-white/5" : themeKey === "sepia" ? "bg-amber-300/30" : "bg-orange-200/40"}`} />
                )}
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    {sec.lines.map((l, j) => (
                      <p key={j} className={`font-bold leading-[1.9] mb-0.5 ${t.text}`} style={{ fontSize: "1.15em", fontFamily: "var(--font-sanskrit)" }}>{l}</p>
                    ))}
                  </div>
                  <ShlokSpeaker text={sec.lines.join(" ")} themeKey={themeKey} />
                </div>
              </div>
            );
          case "ref-shlok":
            // Referenced shlok inside tatparya — smaller, indented, brown-tinted
            return (
              <div key={i} className={`pl-4 border-l-2 my-2 ${themeKey === "dark" ? "border-amber-800/40" : themeKey === "sepia" ? "border-[#c4ad80]" : "border-[#c4956a]/40"}`}>
                {sec.lines.map((l, j) => (
                  <p key={j} className={`leading-[1.7] italic mb-0.5 ${themeKey === "dark" ? "text-amber-400/70" : themeKey === "sepia" ? "text-[#6b4020]" : "text-[#8b5a30]"}`} style={{ fontSize: "0.9em", fontFamily: "var(--font-sanskrit)" }}>{l}</p>
                ))}
              </div>
            );
          case "shabdarth":
            // BBT style: blue word-by-word meanings, 0.8x body size
            return (
              <div key={i} className="my-3">
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
            // Hindi translation — regular weight, same as body text
            const prevKind = i > 0 ? sections[i - 1].kind : null;
            const isAnuvadContinuation = i === 0 && prevPageEndKind === "anuvad";
            const showLabel = !isAnuvadContinuation && (prevKind === "shlok" || prevKind === "shabdarth");
            return (
              <div key={i} className={isAnuvadContinuation ? "" : "mt-3"}>
                {showLabel && <p className={`font-semibold mb-1 indent-8 ${t.text}`} style={{ fontSize: "1em", fontFamily: "var(--font-devanagari)" }}>अनुवाद :</p>}
                {sec.lines.map((l, j) => (
                  <p key={j} className={`leading-[2] mb-1 ${j === 0 && !isAnuvadContinuation ? "indent-8" : ""} ${t.text}`} style={{ fontSize: "1em", fontFamily: "var(--font-devanagari)" }}>{l}</p>
                ))}
              </div>
            );
          }
          case "tatparya": {
            // Same as body text, only "तात्पर्य :" prefix is bold (SEN-109: visual divider)
            const isContinuation = i === 0 && prevPageEndKind === "tatparya";
            return (
              <div key={i} className={isContinuation ? "" : "mt-4 sm:mt-5"}>
                {!isContinuation && (
                  <div className={`mb-3 h-px ${themeKey === "dark" ? "bg-white/5" : themeKey === "sepia" ? "bg-amber-300/20" : "bg-green-200/50"}`} />
                )}
                {sec.lines.map((l, j) => (
                  <p key={j} className={`leading-[2] mb-1 ${t.text}`} style={{ fontSize: "0.95em", fontFamily: "var(--font-devanagari)" }}>
                    {j === 0 && !isContinuation && <><span className="font-semibold">तात्पर्य :</span>{" "}</>}
                    {l}
                  </p>
                ))}
              </div>
            );
          }
          default:
            return (
              <div key={i}>
                {sec.lines.map((l, j) => (
                  <p key={j} className={`leading-[1.8] ${t.text} mb-1`} style={{ fontSize: "1em" }}>{l}</p>
                ))}
              </div>
            );
        }
      })}
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
            <BookmarkPanel bookmarks={bookmarks} onJump={onBookmarkJump} onDelete={onBookmarkDelete} />
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

        {/* Footer credit */}
        <div className="px-4 py-4 border-t border-stone-100 mt-2">
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

  // Undo state for image operations
  const [undoToast, setUndoToast] = useState<{ message: string; trashIds: string[]; timer: ReturnType<typeof setTimeout> } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Prompt editing modal state
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
        if (ciRes.ok) {
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

      // Step 2: Load ALL pages via content endpoint (paginated, 100 batches per request)
      const accumulated: PageContent[] = [];
      let contentPage = 1;
      let hasMore = true;
      while (hasMore) {
        try {
          const res = await fetch(`${API_BASE}/content?page=${contentPage}&limit=100`);
          if (!res.ok) break;
          const data: ContentResponse = await res.json();
          const pages = data.batches.flatMap(b => b.pages).filter(p => !isGarbagePage(p.text));
          accumulated.push(...pages);
          hasMore = data.pagination.hasMore;
          contentPage++;
          // Show content progressively — unblock UI after first chunk
          if (accumulated.length > 0) {
            setAllPages([...accumulated]);
            if (contentPage === 2) setLoading(false);
          }
        } catch { hasMore = false; }
      }
      if (accumulated.length > 0) setAllPages(accumulated);
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

      // Also fetch Instagram images and merge
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
      } catch { /* IG manifest not available yet — fine */ }

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
        await fetch(`${API_BASE}/image/restore/${tid}`, { method: "POST" });
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

  const handleRegenerateImages = useCallback(async (chapterNum: number, customPrompt?: string, summaryHi?: string) => {
    if (regeneratingChapters.has(chapterNum)) return;
    setRegeneratingChapters((prev) => new Set(prev).add(chapterNum));
    setPromptModal(null);
    try {
      const bodyObj: Record<string, string> = {};
      if (customPrompt) bodyObj.customPrompt = customPrompt;
      if (summaryHi) bodyObj.summaryHi = summaryHi;
      const res = await fetch(`${API_BASE}/regenerate-chapter/${chapterNum}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyObj),
      });
      if (res.ok) {
        const data = await res.json();
        await fetchImageManifest();
        if (data.trashIds?.length > 0) {
          showUndo(`Chapter ${chapterNum} images regenerated`, data.trashIds);
        }
      }
    } catch { /* ignore */ } finally {
      setRegeneratingChapters((prev) => {
        const next = new Set(prev);
        next.delete(chapterNum);
        return next;
      });
    }
  }, [regeneratingChapters, fetchImageManifest, showUndo]);

  const handleDeleteImage = useCallback(async (chapterNum: number, sceneIndex: number) => {
    try {
      const res = await fetch(`${API_BASE}/image/${chapterNum}/${sceneIndex}`, { method: "DELETE" });
      if (res.ok) {
        const data = await res.json();
        await fetchImageManifest();
        if (data.trashId) {
          showUndo(`Chapter ${chapterNum} image deleted`, [data.trashId]);
        }
      }
    } catch { /* ignore */ }
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

    try {
      await sbFetch("bhagavatam_bookmarks", {
        method: "POST",
        headers: { Prefer: "return=representation,resolution=merge-duplicates" },
        body: JSON.stringify({
          reader_id: readerId,
          reader_name: readerName,
          page_number: pageNum,
          chapter_number: currentChapter?.number || null,
          chapter_title: currentChapter?.title || null,
          updated_at: new Date().toISOString(),
        }),
      });
      await fetchBookmarks();
      setBookmarkSaved(true);
      setTimeout(() => setBookmarkSaved(false), 2000);
    } catch { /* ignore */ }
  }, [readerId, readerName, allPages, currentPage, visiblePageNum, fetchBookmarks]);

  const deleteBookmark = useCallback(async (b: BookmarkEntry) => {
    if (!readerId) return;
    try {
      await sbFetch(`bhagavatam_bookmarks?id=eq.${b.id}&reader_id=eq.${encodeURIComponent(readerId)}`, { method: "DELETE" });
      setBookmarks(prev => prev.filter(x => x.id !== b.id));
    } catch { /* ignore */ }
  }, [readerId]);

  const handleBookmarkJump = useCallback((b: BookmarkEntry) => {
    setSidebarOpen(false);
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
      // Scroll to the exact bookmarked page, not just the top
      setTimeout(() => {
        const el = document.querySelector(`[data-page-num="${b.page_number}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        else window.scrollTo({ top: 0, behavior: "smooth" });
      }, 200);
    }
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

  // Filter by search
  const displayPages = searchQuery.trim()
    ? allPages.filter((p) => p.text.toLowerCase().includes(searchQuery.toLowerCase()))
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
    if (window.innerWidth < 1024) setSidebarOpen(false);
    setSearchQuery("");
    setActiveChapter(ch.globalNumber);

    // All pages are loaded eagerly — find directly (SEN-103 fix)
    const pageIdx = allPages.findIndex((p) => p.pageNumber >= ch.pageNumber);
    if (pageIdx >= 0) {
      const viewPage = Math.floor(pageIdx / PAGES_PER_VIEW) + 1;
      setCurrentPage(viewPage);
      // Save per-chapter position (SEN-106)
      const positions = JSON.parse(localStorage.getItem("bhagwatham_chapter_positions") || "{}");
      positions[ch.globalNumber] = { pageNumber: ch.pageNumber, scrollOffset: 0 };
      localStorage.setItem("bhagwatham_chapter_positions", JSON.stringify(positions));
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
            saveBookmark();
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

  // Page range display
  const firstPageNum = displayPages[0]?.pageNumber ?? 0;
  const lastPageNum = displayPages[displayPages.length - 1]?.pageNumber ?? 0;
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
        />

        {/* ── Main content ── */}
        <main ref={contentRef} className={`flex-1 min-w-0 ${theme.bg} transition-colors duration-300`}>
          {/* Voice edit toolbar — appears when text is selected */}
          <VoiceEditToolbar allPages={allPages} setAllPages={setAllPages} />
          {/* Top bar */}
          <div className={`sticky top-14 z-30 ${theme.surface} backdrop-blur-sm border-b ${theme.border} px-2 sm:px-4 md:px-6 py-1.5 sm:py-2`}>
            <div className="max-w-3xl mx-auto flex items-center gap-1.5 sm:gap-2 md:gap-3">
              {/* Sidebar toggle (mobile) */}
              {!focusMode && (
                <button
                  onClick={() => { setSidebarTab("chapters"); setSidebarOpen(true); }}
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
                {lang === "hi" ? "EN" : "हि"}
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

              {/* Settings button */}
              <div className="relative shrink-0">
                <button
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
            className="mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 [overflow-wrap:break-word] [word-break:break-word]"
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
              <div>
                {displayPages.map((page, pageIdx) => {
                  // Determine the previous page's ending section kind for cross-page continuity
                  let prevPage = pageIdx > 0 ? displayPages[pageIdx - 1] : null;
                  // For first page in view, check the page right before it in allPages
                  if (!prevPage && !searchQuery.trim()) {
                    const allIdx = allPages.findIndex(p => p.pageNumber === page.pageNumber);
                    if (allIdx > 0) prevPage = allPages[allIdx - 1];
                  }
                  const prevEndKind = prevPage ? getPageEndKind(prevPage.text) : undefined;
                  return (
                  <div key={page.pageNumber} data-page-num={page.pageNumber}>
                    {pageIdx > 0 && (
                      <div className={`flex items-center gap-3 my-8 sm:my-10 ${theme.muted}`}>
                        <div className={`flex-1 h-px ${settings.theme === "dark" ? "bg-white/10" : settings.theme === "sepia" ? "bg-amber-300/40" : "bg-orange-200/60"}`} />
                        <span className="text-[10px] font-medium opacity-50 shrink-0 px-2">· {page.pageNumber} ·</span>
                        <div className={`flex-1 h-px ${settings.theme === "dark" ? "bg-white/10" : settings.theme === "sepia" ? "bg-amber-300/40" : "bg-orange-200/60"}`} />
                      </div>
                    )}
                    {pageIdx === 0 && <p className={`text-[10px] ${theme.muted} font-medium text-right mt-0 mb-2 opacity-40`}>· {page.pageNumber} ·</p>}
                    <RenderContent text={page.text} textEn={page.textEn} lang={lang} chapterImages={chapterImages} themeKey={settings.theme} onRegenerateImages={isDevMode ? openPromptModal : undefined} regeneratingChapters={regeneratingChapters} onDeleteImage={isDevMode ? handleDeleteImage : undefined} pageNumber={page.pageNumber} overrides={sectionOverrides[page.pageNumber]} onOverridesChange={isDevMode ? handleOverridesChange : undefined} prevPageEndKind={prevEndKind} chapterNumMapper={(perSkandhNum: number) => {
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
            )}

            {/* ── Pagination ── */}
            {!searchQuery && totalViewPages > 1 && (
              <div className={`flex items-center justify-center gap-2 mt-10 mb-6 pb-4 border-t ${theme.border} pt-6`}>
                <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 ${theme.surface} border ${theme.border} rounded-lg text-xs font-semibold ${theme.text} hover:border-orange-300 transition-all disabled:opacity-30`}
                >
                  <ChevronLeft className="w-3 h-3" /> Previous
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
                      onClick={() => handleRegenerateImages(promptModal.chapterNum, promptModal.prompt, promptModal.summaryHi)}
                      disabled={!promptModal.prompt.trim()}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white rounded-xl font-semibold text-sm transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Generate with this prompt
                    </button>
                    <button
                      onClick={() => handleRegenerateImages(promptModal.chapterNum)}
                      className="flex items-center gap-1.5 px-4 py-2.5 bg-stone-200 dark:bg-stone-700 hover:bg-stone-300 dark:hover:bg-stone-600 text-stone-700 dark:text-stone-200 rounded-xl font-medium text-sm transition-colors"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      Auto
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
