import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { fadeInUp, fadeIn } from "@/lib/animations";
import {
  BookOpen, ChevronLeft, ChevronRight, Loader2,
  Search, BookMarked, List, X, ChevronDown,
  Languages, Bookmark, Trash2, LogIn,
  Settings, Sun, Moon, Minus, Plus, Maximize2,
} from "lucide-react";

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
    const raw = localStorage.getItem("gita_settings");
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch { return DEFAULT_SETTINGS; }
}

function saveSettings(s: ReadingSettings) {
  localStorage.setItem("gita_settings", JSON.stringify(s));
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

/** A chapter detected from the OCR content */
interface ChapterEntry {
  number: number;
  title: string;
  pageNumber: number;
}

// ── Gita chapter names ──────────────────────────────────────────────────────

const GITA_CHAPTERS: Record<number, { hi: string; en: string }> = {
  1:  { hi: "अर्जुनविषादयोग", en: "Observing the Armies" },
  2:  { hi: "सांख्ययोग", en: "Contents of the Gita Summarized" },
  3:  { hi: "कर्मयोग", en: "Karma Yoga" },
  4:  { hi: "ज्ञानकर्मसन्न्यासयोग", en: "Transcendental Knowledge" },
  5:  { hi: "कर्मसन्न्यासयोग", en: "Karma Yoga - Action in Krishna Consciousness" },
  6:  { hi: "ध्यानयोग", en: "Dhyana Yoga" },
  7:  { hi: "ज्ञानविज्ञानयोग", en: "Knowledge of the Absolute" },
  8:  { hi: "अक्षरब्रह्मयोग", en: "Attaining the Supreme" },
  9:  { hi: "राजविद्याराजगुह्ययोग", en: "The Most Confidential Knowledge" },
  10: { hi: "विभूतियोग", en: "The Opulence of the Absolute" },
  11: { hi: "विश्वरूपदर्शनयोग", en: "The Universal Form" },
  12: { hi: "भक्तियोग", en: "Devotional Service" },
  13: { hi: "क्षेत्रक्षेत्रज्ञविभागयोग", en: "Nature, the Enjoyer, and Consciousness" },
  14: { hi: "गुणत्रयविभागयोग", en: "The Three Modes of Material Nature" },
  15: { hi: "पुरुषोत्तमयोग", en: "The Yoga of the Supreme Person" },
  16: { hi: "दैवासुरसम्पद्विभागयोग", en: "The Divine and Demoniac Natures" },
  17: { hi: "श्रद्धात्रयविभागयोग", en: "The Divisions of Faith" },
  18: { hi: "मोक्षसन्न्यासयोग", en: "Conclusion - The Perfection of Renunciation" },
};

const API_BASE = "/api/gita";

// ── Supabase direct access (for bookmarks) ──────────────────────────────────

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

// ── Helpers ────────────────────────────────────────────────────────────────────

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
  // This edition prints its page numbers in Devanagari digits (९३), which the
  // ASCII-only test missed — so they rendered as stray lines inside the text.
  return /^[\d\u0966-\u096F]{1,5}[\]\)]*$/u.test(line.trim());
}

function stripLeadingPageNumber(line: string): string {
  return line.replace(/^\d{2,5}[\]\)]*\s+/, "");
}

function cleanOcrText(text: string): string {
  return text
    // Repair decomposed vowels. The scan writes ऐ as ए + a combining "े" and औ as
    // ओ + "ो"; a combining sign on an independent vowel has no base to attach to,
    // so the font renders it on a dotted circle — "एेश्वर्य" instead of "ऐश्वर्य".
    .replace(/\u090F[\u0946\u0947]/gu, "\u0910")   // ए + े  → ऐ
    .replace(/\u0913[\u094A\u094B]/gu, "\u0914")   // ओ + ो  → औ
    .replace(/\u0905\u093E/gu, "\u0906")           // अ + ा  → आ
    // A combining mark with no consonant before it (after a space, hyphen or a
    // zero-width joiner the OCR left behind) can only render as a dotted circle.
    .replace(/(^|[\s\-\u200C\u200D])[\u093E-\u094D\u0955-\u0957\u0962\u0963]+/gmu, "$1")
    .replace(/^([\d\u0966-\u096F]{1,5}[\]\)]*)$/gmu, "")
    // Sarvam transcribes the danda as an ASCII pipe. Restore the real marks, or
    // verse detection (which looks for ॥) never fires and the text shows "||".
    .replace(/\|\s*\|/g, "॥")
    .replace(/(?<=[\u0900-\u097F\s])\|/gu, "।")
    // Lone Latin fragments on their own line are OCR noise (e.g. a garbled
    // शब्दार्थ heading coming through as "WR").
    .replace(/^[A-Za-z]{1,4}$/gmu, "")
    .replace(/(?<=[\u0900-\u097F\s;,।:—\-\.])\s*\b[a-zA-Z]{1,5}\b\s*[:\|]?\s*(?=[\u0900-\u097F\s;,।:—\-\.])/gu, " ")
    .replace(/(?<=[\u0900-\u097F])\s+[a-zA-Z]{1,4}\s+(?=[\u0900-\u097F])/gu, " ")
    .replace(/©/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[^\S\n]{2,}/g, " ")
    .replace(/;\s*;/g, ";")
    .trim();
}

// A chapter opening in the body reads "अध्याय एक : कुरुक्षेत्र के युद्धस्थल में सैन्यनिरीक्षण"
// — number AND title on one line. The older pattern required the line to end right
// after the number, so it only ever matched the bare entries in the table of
// contents, which is why every chapter resolved to the contents page.
const CHAPTER_RE = /^(?:Chapter\s+\S+|अध्याय\s+(?:[\u0900-\u097F]+(?:\s+[\u0900-\u097F]+){0,2}|\d+))(?:\s*[:：—–-]\s*.{0,70})?\s*$/iu;

function isChapterHeading(t: string): boolean {
  const cleaned = t.replace(/^\d+\s+/, "");
  if (cleaned.length > 100) return false;   // headings carry their title too
  if (t.includes("पूर्ण हुए") || t.includes("पूर्ण हुआ")) return false;
  return CHAPTER_RE.test(cleaned);
}

function extractChapterNum(line: string): number {
  // Search ONLY the part before the colon. The title after it can itself contain a
  // number word — "अध्याय चौदह : प्रकृति के तीन गुण" — and scanning the whole line
  // matched "तीन" (3) before "चौदह" (14), so chapter 14 resolved as an already-seen
  // chapter 3 and vanished from the index.
  const head = line.split(/[:：—–-]/)[0];
  const numMatch = head.match(/\d+/);
  if (numMatch) {
    const n = parseInt(numMatch[0], 10);
    if (n > 0 && n <= 18) return n;
  }
  // Hindi number words for 1-18
  const HINDI_NUMS: Record<string, number> = {
    एक: 1, दो: 2, तीन: 3, चार: 4, पाँच: 5, छः: 6, छह: 6,
    सात: 7, आठ: 8, नौ: 9, दस: 10, ग्यारह: 11, बारह: 12,
    तेरह: 13, चौदह: 14, पन्द्रह: 15, सोलह: 16, सत्रह: 17, अठारह: 18,
  };
  for (const [word, num] of Object.entries(HINDI_NUMS)) {
    if (head.includes(word)) return num;
  }
  return 0;
}

function buildChapterIndex(allPages: PageContent[]): ChapterEntry[] {
  const chapters: ChapterEntry[] = [];
  const seen = new Set<number>();

  for (const page of allPages) {
    if (isGarbagePage(page.text)) continue;
    const lines = page.text.split("\n");
    // Skip the table of contents (विषय-सूची). It lists every chapter heading on a
    // single page, and since we keep the FIRST occurrence of each number that page
    // would claim all 18 chapters — which is exactly what it did. A real chapter
    // opening announces one chapter, so >2 headings on a page means it is an index.
    const headingCount = lines.reduce((n, l) => n + (isChapterHeading(l.trim()) ? 1 : 0), 0);
    if (headingCount > 2) continue;
    if (/विषय\s*-?\s*सूची/u.test(page.text)) continue;
    for (const line of lines) {
      const t = line.trim();
      if (isChapterHeading(t)) {
        const num = extractChapterNum(t);
        if (num > 0 && num <= 18 && !seen.has(num)) {
          seen.add(num);
          const meta = GITA_CHAPTERS[num];
          chapters.push({
            number: num,
            title: meta ? `अध्याय ${num} — ${meta.hi}` : `अध्याय ${num}`,
            pageNumber: page.pageNumber,
          });
        }
      }
    }
  }

  return chapters.sort((a, b) => a.number - b.number);
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
    else if (/॥/u.test(line)) lastKind = "shlok";
  }
  return lastKind;
}

// ── Content Renderer (BBT formatting) ─────────────────────────────────────────

function RenderContent({ text, textEn, lang, themeKey = "light", prevPageEndKind }: {
  text: string; textEn?: string; lang: "hi" | "en"; themeKey?: Theme; prevPageEndKind?: string;
}) {
  const t = THEME_STYLES[themeKey];

  // English mode
  if (lang === "en" && textEn) {
    const enLines = textEn.split("\n")
      .filter((l) => l.trim() && !isStandalonePageNumber(l))
      .map((l) => stripLeadingPageNumber(l));
    return (
      <div className="space-y-4">
        {enLines.map((l, i) => (
          <p key={i} className={`leading-[1.8] ${t.text} mb-1`}>{l}</p>
        ))}
      </div>
    );
  }

  // Hindi mode with BBT section detection
  const lines = cleanOcrText(text).split("\n")
    .filter((l) => l.trim() && !isStandalonePageNumber(l))
    .map((l) => stripLeadingPageNumber(l));

  type SectionKind = "chapter" | "shlok" | "shabdarth" | "anuvad" | "tatparya" | "text";
  type Section = { kind: SectionKind; lines: string[]; chapterNum?: number };
  const sections: Section[] = [];
  const initialKind = (prevPageEndKind === "tatparya" || prevPageEndKind === "anuvad") ? prevPageEndKind as SectionKind : "text";
  let current: Section = { kind: initialKind, lines: [] };
  const flush = () => { if (current.lines.length > 0) sections.push(current); };

  // Sanskrit detection helpers
  const countHindiPostpositions = (line: string): number => {
    const matches = line.match(/(?:^|\s)(?:का|की|के|को|में|पर|से|ने|और|या|भी|तो|ही|यह|वह|जो|कि|नहीं|इस|उस|जब|तब|तक|लिए|साथ|प्रति|इसलिए|जिससे|जिसमें|उन्हें|इन्हें|जिन्हें|उसे|इसे|मुझे|हमें|तुम्हें|उन्होंने|अपने|अपनी|अपना)(?:\s|[।,;:\)]|$)/gu);
    return matches ? matches.length : 0;
  };
  const HINDI_VERB_RE = /(?:है[ँं]?|हैं|था|थे|थी|गया|गयी|किया|करें|रहा|सकता|चाहिए|हुई|हुए|होता|करते|करना|बताया|कहा|दिया|लिया|सकते|सकती|सके|सका|सकी|सकें|दिखा|दिखाया|पाया|पाये|पाई|पाते|लगा|लगे|लगी|हुआ|गए|गई|चाहा|रहे|रही|होते|होती|करता|जाता|जाते|कहते|देते|लेते)(?:\s|[।,;:\)]|$)/u;

  const isVerseLike = (line: string) => {
    if (line.length > 120 || line.length < 5) return false;
    if (/^(तात्पर्य|शब्दार्थ|अनुवाद)/u.test(line)) return false;
    if ((line.includes("—") || line.includes("--")) && line.includes(";")) return false;
    if (countHindiPostpositions(line) >= 2) return false;
    if (HINDI_VERB_RE.test(line)) return false;
    return true;
  };

  // This edition prints word-by-word meanings with NO शब्दार्थ heading — just a
  // dense run of "term meaning; term meaning;". Without this they fell through as
  // ordinary prose, which is why the glossary looked like a wall of text.
  const isWordMeanings = (line: string) => {
    const semis = (line.match(/;/g) || []).length;
    if (semis < 3) return false;
    if (/^(तात्पर्य|अनुवाद)/u.test(line)) return false;
    return semis / Math.max(1, line.length / 60) >= 1.2 || semis >= 5;
  };

  const hasDoubleViramAhead = (fromIdx: number, maxLook: number = 3) => {
    for (let j = fromIdx; j < Math.min(lines.length, fromIdx + maxLook); j++) {
      if (/॥/u.test(lines[j].trim())) return true;
      if (/^(तात्पर्य|शब्दार्थ|अनुवाद)/u.test(lines[j].trim())) return false;
    }
    return false;
  };

  for (let i = 0; i < lines.length; i++) {
    const lt = lines[i].trim();
    if (!lt) continue;

    if (isChapterHeading(lt)) {
      flush();
      const chapNum = extractChapterNum(lt);
      const meta = GITA_CHAPTERS[chapNum];
      const label = meta ? `अध्याय ${chapNum} — ${meta.hi}` : lt;
      sections.push({ kind: "chapter", lines: [label], chapterNum: chapNum });
      current = { kind: "text", lines: [] };
      continue;
    }

    if (isWordMeanings(lt)) {
      if (current.kind !== "shabdarth") { flush(); current = { kind: "shabdarth", lines: [] }; }
      current.lines.push(lt);
      continue;
    }

    if (/^तात्पर्य/u.test(lt)) {
      flush();
      current = { kind: "tatparya", lines: [] };
      const rest = lt.replace(/^तात्पर्य\s*[:：\-—।]\s*/u, "").trim();
      if (rest) current.lines.push(rest);
      continue;
    }

    if (/^शब्दार्थ/u.test(lt)) {
      flush();
      if (sections.length > 0 && sections[sections.length - 1].kind === "text") {
        sections[sections.length - 1].kind = "shlok";
      }
      current = { kind: "shabdarth", lines: [] };
      continue;
    }

    if (/॥/u.test(lt) && lt.length < 200) {
      if (current.kind !== "shlok") { flush(); current = { kind: "shlok", lines: [] }; }
      current.lines.push(lt);
      continue;
    }

    if (current.kind === "shlok" && isVerseLike(lt)) {
      current.lines.push(lt);
      continue;
    }

    if (current.kind !== "shlok" && isVerseLike(lt) && hasDoubleViramAhead(i + 1)) {
      flush();
      current = { kind: "shlok", lines: [lt] };
      continue;
    }

    if (current.kind === "shabdarth" && (lt.includes("—") || lt.includes("--")) && lt.includes(";")) {
      current.lines.push(lt);
      continue;
    }

    if (current.kind === "shabdarth" && !(lt.includes("—") || lt.includes("--"))) {
      flush();
      current = { kind: "anuvad", lines: [lt] };
      continue;
    }

    if (current.kind === "anuvad") { current.lines.push(lt); continue; }
    if (current.kind === "shlok") { flush(); current = { kind: "anuvad", lines: [lt] }; continue; }

    current.lines.push(lt);
  }
  flush();

  // Render sections with BBT styling
  return (
    <div className="space-y-5">
      {sections.map((sec, i) => {
        switch (sec.kind) {
          case "chapter":
            return (
              <div key={i} id={`chapter-${sec.chapterNum}`} className="mt-6 mb-4 scroll-mt-20">
                <h3 className={`text-xl sm:text-2xl font-bold ${t.text} mb-1 pb-2 border-b-2 border-orange-300/50`} style={{ fontFamily: "var(--font-devanagari)" }}>
                  {sec.lines.join(" ")}
                </h3>
                {sec.chapterNum && GITA_CHAPTERS[sec.chapterNum] && (
                  <p className={`text-sm ${t.muted} italic`}>{GITA_CHAPTERS[sec.chapterNum].en}</p>
                )}
              </div>
            );

          case "shlok":
            return (
              <div key={i} className="my-5">
                {sec.lines.map((l, j) => (
                  <p key={j} className={`text-[20px] sm:text-[22px] font-bold leading-[1.9] mb-0.5 ${themeKey === "dark" ? "text-amber-300" : themeKey === "sepia" ? "text-[#5a3010]" : "text-[#6b3a1a]"}`} style={{ fontFamily: "var(--font-sanskrit)" }}>{l}</p>
                ))}
              </div>
            );

          case "shabdarth":
            return (
              <div key={i} className="my-3">
                <p className={`text-[13px] font-bold mb-2 text-center ${themeKey === "dark" ? "text-blue-400" : themeKey === "sepia" ? "text-[#1a3a6a]" : "text-[#1a4a8a]"}`} style={{ fontFamily: "var(--font-devanagari)" }}>शब्दार्थ</p>
                {sec.lines.map((l, j) => {
                  const parts = l.split(/(—|--|-\s)/);
                  return (
                    <p key={j} className={`text-[12px] sm:text-[13px] leading-[1.7] mb-0.5 ${themeKey === "dark" ? "text-blue-300/80" : themeKey === "sepia" ? "text-[#1a3a6a]" : "text-[#1a4a8a]"}`} style={{ fontFamily: "var(--font-devanagari)" }}>
                      {parts.map((part, k) => {
                        if (part === "—" || part === "--" || part === "- ") return <span key={k}>—</span>;
                        const isMeaning = k > 0 && (parts[k - 1] === "—" || parts[k - 1] === "--" || parts[k - 1] === "- ");
                        return isMeaning
                          ? <strong key={k} className={themeKey === "dark" ? "text-blue-200 font-bold" : "text-[#0a2a5a] font-bold"}>{part}</strong>
                          : <span key={k}>{part}</span>;
                      })}
                    </p>
                  );
                })}
              </div>
            );

          case "anuvad": {
            const prevKind = i > 0 ? sections[i - 1].kind : null;
            const isContinuation = i === 0 && prevPageEndKind === "anuvad";
            const showLabel = !isContinuation && (prevKind === "shlok" || prevKind === "shabdarth");
            return (
              <div key={i} className={isContinuation ? "" : "mt-3"}>
                {showLabel && <p className={`text-[14px] sm:text-[15px] font-bold mb-1 indent-8 ${themeKey === "dark" ? "text-stone-200" : "text-stone-800"}`} style={{ fontFamily: "var(--font-devanagari)" }}>अनुवाद :</p>}
                {sec.lines.map((l, j) => (
                  <p key={j} className={`text-[15px] sm:text-[16px] font-bold leading-[2] mb-1 ${j === 0 && !isContinuation ? "indent-8" : ""} ${themeKey === "dark" ? "text-stone-100" : "text-stone-900"}`} style={{ fontFamily: "var(--font-devanagari)" }}>
                    {l}
                  </p>
                ))}
              </div>
            );
          }

          case "tatparya": {
            const isContinuation = i === 0 && prevPageEndKind === "tatparya";
            return (
              <div key={i} className={isContinuation ? "" : "mt-3"}>
                {sec.lines.map((l, j) => (
                  <p key={j} className={`text-[14px] sm:text-[15px] leading-[2] mb-1 ${t.text}`} style={{ fontFamily: "var(--font-devanagari)" }}>
                    {j === 0 && !isContinuation && <><span className="font-bold">तात्पर्य :</span>{" "}</>}
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
                  <p key={j} className={`leading-[1.8] ${t.text} mb-1`}>{l}</p>
                ))}
              </div>
            );
        }
      })}
    </div>
  );
}

// ── Sidebar (18 flat chapters) ───────────────────────────────────────────────

function GitaSidebar({
  chapters,
  activeChapter,
  progress,
  isOpen,
  onClose,
  onChapterClick,
  bookmarks,
  onBookmarkJump,
  onBookmarkDelete,
}: {
  chapters: ChapterEntry[];
  activeChapter: number | null;
  progress: Progress | null;
  isOpen: boolean;
  onClose: () => void;
  onChapterClick: (chapter: ChapterEntry) => void;
  bookmarks: BookmarkEntry[];
  onBookmarkJump: (b: BookmarkEntry) => void;
  onBookmarkDelete: (b: BookmarkEntry) => void;
}) {
  const [sidebarTab, setSidebarTab] = useState<"chapters" | "bookmarks">("chapters");
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

      <aside className={`
        fixed top-0 left-0 h-full w-72 bg-white border-r border-stone-200 z-50
        transform transition-transform duration-300 ease-in-out overflow-y-auto
        lg:sticky lg:top-20 lg:h-[calc(100vh-5rem)] lg:transform-none lg:z-0
        ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-stone-100 z-10">
          <div className="px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-0.5">
              <button
                onClick={() => setSidebarTab("chapters")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${sidebarTab === "chapters" ? "bg-white text-orange-700 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}
              >
                <span className="flex items-center gap-1.5"><BookMarked className="w-3.5 h-3.5" /> Chapters</span>
              </button>
              <button
                onClick={() => setSidebarTab("bookmarks")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${sidebarTab === "bookmarks" ? "bg-white text-orange-700 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}
              >
                <span className="flex items-center gap-1.5">
                  <Bookmark className="w-3.5 h-3.5" /> Bookmarks
                  {bookmarks.length > 0 && <span className="bg-orange-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center">{bookmarks.length}</span>}
                </span>
              </button>
            </div>
            <button onClick={onClose} className="lg:hidden p-1 hover:bg-stone-100 rounded">
              <X className="w-4 h-4 text-stone-500" />
            </button>
          </div>
        </div>

        {/* Progress */}
        {progress && (
          <div className="px-4 py-3 border-b border-stone-100">
            <div className="flex items-center justify-between text-[11px] text-stone-500 mb-1.5">
              <span>{progress.totalPagesProcessed.toLocaleString()} / {progress.totalPagesInPdf.toLocaleString()} pages</span>
              <span className="font-bold text-orange-600">{percent.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-orange-400 to-amber-500 rounded-full transition-all duration-700" style={{ width: `${percent}%` }} />
            </div>
          </div>
        )}

        {/* Tab content */}
        {sidebarTab === "bookmarks" ? (
          <div className="py-3 px-2">
            {bookmarks.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <Bookmark className="w-6 h-6 text-stone-300 mx-auto mb-2" />
                <p className="text-xs text-stone-400">No bookmarks yet</p>
              </div>
            ) : (
              <div className="space-y-1">
                {bookmarks.map((b) => (
                  <div key={b.id} className="flex items-center gap-2 group">
                    <button onClick={() => onBookmarkJump(b)} className="flex-1 text-left px-3 py-2 rounded-lg hover:bg-orange-50 transition-colors">
                      <p className="text-xs font-semibold text-stone-700 truncate">{b.label || `Page ${b.page_number}`}</p>
                      <p className="text-[10px] text-stone-400">Page {b.page_number}</p>
                    </button>
                    <button onClick={() => onBookmarkDelete(b)} className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50 text-stone-400 hover:text-red-500 transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <nav className="py-2">
            {/* Flat list of 18 chapters */}
            {Array.from({ length: 18 }, (_, i) => i + 1).map((num) => {
              const ch = chapters.find((c) => c.number === num);
              const meta = GITA_CHAPTERS[num];
              const isActive = activeChapter === num;
              const isAvailable = !!ch;

              return (
                <button
                  key={num}
                  onClick={() => ch && onChapterClick(ch)}
                  disabled={!isAvailable}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-all ${
                    isActive
                      ? "bg-orange-50 border-r-2 border-orange-500"
                      : isAvailable
                        ? "hover:bg-orange-50/60"
                        : "opacity-40 cursor-not-allowed"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm font-black ${
                    isActive ? "bg-orange-600 text-white" : "bg-stone-100 text-stone-500"
                  }`}>
                    {num}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold truncate ${isActive ? "text-orange-700" : "text-stone-700"}`}>
                      {meta?.hi || `अध्याय ${num}`}
                    </p>
                    <p className="text-[11px] text-stone-400 truncate">
                      {meta?.en || ""}
                    </p>
                    {ch && (
                      <p className="text-[10px] text-stone-400 mt-0.5">Page {ch.pageNumber}</p>
                    )}
                  </div>
                </button>
              );
            })}
          </nav>
        )}

        {/* Footer */}
        <div className="px-4 py-4 border-t border-stone-100 mt-2">
          <p className="text-[10px] text-stone-400 leading-relaxed">
            श्रील प्रभुपाद द्वारा हिंदी अनुवाद एवं तात्पर्य — BBT
          </p>
        </div>
      </aside>
    </>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function GitaReader() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [allPages, setAllPages] = useState<PageContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalBatchCount, setTotalBatchCount] = useState(0);
  const [loadedBatches, setLoadedBatches] = useState<Set<number>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);
  const batchCacheRef = useRef<Map<number, PageContent[]>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeChapter, setActiveChapter] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [lang, setLang] = useState<"hi" | "en">("hi");
  const [readerId, setReaderId] = useState<string | null>(() => (localStorage.getItem("gita_reader_id") || "").toLowerCase() || null);
  const [readerName, setReaderName] = useState<string | null>(() => localStorage.getItem("gita_reader_name"));
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([]);
  const [showIdentityModal, setShowIdentityModal] = useState(false);
  const [bookmarkSaved, setBookmarkSaved] = useState(false);
  const [settings, setSettings] = useState<ReadingSettings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [scrollChapter, setScrollChapter] = useState<string | null>(null);
  const [visiblePageNum, setVisiblePageNum] = useState<number | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const PAGES_PER_VIEW = 20;
  const contentRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────

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

    const sortedBatches = [...batchCacheRef.current.entries()].sort((a, b) => a[0] - b[0]);
    const merged = sortedBatches.flatMap(([, pages]) => pages);
    setAllPages(merged);
    setLoadedBatches(new Set(batchCacheRef.current.keys()));
    setLoadingMore(false);
  }, []);

  const fetchAllContent = useCallback(async () => {
    setLoading(true);
    try {
      // Try batches endpoint first
      const batchRes = await fetch(`${API_BASE}/batches`);
      if (batchRes.ok) {
        const batches = await batchRes.json();
        const batchCount = batches.length;
        setTotalBatchCount(batchCount);

        if (batchCount > 0) {
          await fetchBatchRange(1, Math.min(5, batchCount));
          if (batchCount > 5) {
            (async () => {
              for (let start = 6; start <= batchCount; start += 10) {
                await fetchBatchRange(start, Math.min(start + 9, batchCount));
              }
            })();
          }
          return;
        }
      }

      // Fallback: load everything via content endpoint
      const res = await fetch(`${API_BASE}/content?page=1&limit=100`);
      if (res.ok) {
        const data: ContentResponse = await res.json();
        const pages = data.batches.flatMap((b) => b.pages).filter((p) => !isGarbagePage(p.text));
        if (pages.length > 0) setAllPages(pages);
      }
    } catch { /* empty */ } finally { setLoading(false); }
  }, [fetchBatchRange]);

  const fetchProgress = useCallback(async () => {
    try { const res = await fetch(`${API_BASE}/progress`); if (res.ok) setProgress(await res.json()); } catch { /* retry */ }
  }, []);

  // ── Bookmarks ──────────────────────────────────────────────────────────────

  const fetchBookmarks = useCallback(async (rid?: string) => {
    const id = rid || readerId;
    if (!id) return;
    try {
      const res = await sbFetch(`gita_bookmarks?reader_id=eq.${encodeURIComponent(id)}&order=created_at.desc`);
      const data: BookmarkEntry[] = await res.json();
      setBookmarks(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  }, [readerId]);

  const saveBookmark = useCallback(async () => {
    if (!readerId) { setShowIdentityModal(true); return; }
    const pageNum = visiblePageNum || allPages[(currentPage - 1) * PAGES_PER_VIEW]?.pageNumber;
    if (!pageNum) return;
    const chapterList = buildChapterIndex(allPages);
    const currentChapter = chapterList.slice().reverse().find(ch => ch.pageNumber <= pageNum);

    try {
      await sbFetch("gita_bookmarks", {
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
      await sbFetch(`gita_bookmarks?id=eq.${b.id}&reader_id=eq.${encodeURIComponent(readerId)}`, { method: "DELETE" });
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
      setTimeout(() => {
        const el = document.querySelector(`[data-page-num="${b.page_number}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        else window.scrollTo({ top: 0, behavior: "smooth" });
      }, 200);
    }
  }, [allPages]);

  const handleIdentitySave = useCallback((id: string, name: string) => {
    localStorage.setItem("gita_reader_id", id);
    if (name) localStorage.setItem("gita_reader_name", name);
    setReaderId(id);
    setReaderName(name || null);
    setShowIdentityModal(false);
    fetchBookmarks(id);
  }, [fetchBookmarks]);

  // ── Init ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchProgress(); fetchAllContent();
    if (readerId) fetchBookmarks();
    const interval = setInterval(fetchProgress, 60_000);
    return () => clearInterval(interval);
  }, [fetchProgress, fetchAllContent, fetchBookmarks, readerId]);

  const chapters = useMemo(() => buildChapterIndex(allPages), [allPages]);

  // Load more batches when user navigates
  useEffect(() => {
    if (totalBatchCount === 0) return;
    const startIdx = (currentPage - 1) * PAGES_PER_VIEW;
    const neededBatch = Math.floor(startIdx / 20) + 1;
    const endBatch = Math.min(neededBatch + 2, totalBatchCount);
    const startBatch = Math.max(1, neededBatch - 1);
    fetchBatchRange(startBatch, endBatch);
  }, [currentPage, totalBatchCount, fetchBatchRange]);

  // Paginate
  const totalViewPages = Math.max(1, Math.ceil(allPages.length / PAGES_PER_VIEW));
  const startIdx = (currentPage - 1) * PAGES_PER_VIEW;
  const visiblePages = allPages.slice(startIdx, startIdx + PAGES_PER_VIEW);

  const displayPages = searchQuery.trim()
    ? allPages.filter((p) => p.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : visiblePages;

  const goToPage = (page: number) => {
    setCurrentPage(page);
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleChapterClick = (ch: ChapterEntry) => {
    setSidebarOpen(false);
    setSearchQuery("");
    const pageIdx = allPages.findIndex((p) => p.pageNumber === ch.pageNumber);
    if (pageIdx >= 0) {
      const viewPage = Math.floor(pageIdx / PAGES_PER_VIEW) + 1;
      setCurrentPage(viewPage);
      setActiveChapter(ch.number);
      setTimeout(() => {
        const el = document.getElementById(`chapter-${ch.number}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 200);
    }
  };

  // ── Reading position persistence ────────────────────────────────────────

  useEffect(() => {
    const savePosition = () => {
      const pageNum = visiblePageNum || (allPages.length > 0 ? allPages[(currentPage - 1) * PAGES_PER_VIEW]?.pageNumber : null);
      if (allPages.length > 0 && pageNum && (currentPage > 1 || visiblePageNum)) {
        const currentChapter = chapters.slice().reverse().find(ch => ch.pageNumber <= pageNum);
        localStorage.setItem("gita_resume", JSON.stringify({
          page: currentPage, pageNumber: pageNum,
          chapter: currentChapter?.title?.split("—")[0].trim() || "",
          chapterNumber: currentChapter?.number || null,
          savedAt: Date.now(),
        }));
      }
    };
    let ticking = false;
    const onScroll = () => {
      if (!ticking) { ticking = true; requestAnimationFrame(() => { savePosition(); ticking = false; }); }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    savePosition();
    return () => window.removeEventListener("scroll", onScroll);
  }, [currentPage, visiblePageNum, allPages, chapters]);

  // Auto-resume
  useEffect(() => {
    if (!loading && allPages.length > 0) {
      try {
        const raw = localStorage.getItem("gita_resume");
        if (raw) {
          const resume = JSON.parse(raw);
          if (resume.page > 1 && currentPage === 1) {
            setCurrentPage(resume.page);
            if (resume.chapterNumber) setActiveChapter(resume.chapterNumber);
            if (resume.chapter) setScrollChapter(resume.chapter);
          }
        }
      } catch { /* ignore */ }
    }
  }, [loading, allPages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scroll chapter tracking ─────────────────────────────────────────────

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            const num = parseInt(id.replace("chapter-", ""), 10);
            const ch = chapters.find(c => c.number === num);
            if (ch) { setScrollChapter(ch.title); setActiveChapter(ch.number); }
          }
        }
      },
      { rootMargin: "-100px 0px -60% 0px" },
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
      { rootMargin: "-80px 0px -30% 0px" },
    );
    const pageEls = document.querySelectorAll("[data-page-num]");
    pageEls.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [displayPages]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case "ArrowLeft": e.preventDefault(); if (currentPage > 1) goToPage(currentPage - 1); break;
        case "ArrowRight": e.preventDefault(); if (currentPage < totalViewPages) goToPage(currentPage + 1); break;
        case "/": e.preventDefault(); searchRef.current?.focus(); break;
        case "Escape": setSidebarOpen(false); setShowSettings(false); setSearchQuery(""); break;
        case "b": if (!e.ctrlKey && !e.metaKey) saveBookmark(); break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentPage, totalViewPages]); // eslint-disable-line react-hooks/exhaustive-deps

  const theme = THEME_STYLES[settings.theme];
  const currentVisiblePage = visiblePageNum || displayPages[0]?.pageNumber || 0;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Layout>
      <SEOHead
        title="भगवद्गीता यथारूप — Bhagavad Gita As It Is"
        description="भगवद्गीता यथारूप हिंदी में — श्रील प्रभुपाद द्वारा अनुवाद एवं तात्पर्य सहित। 18 अध्याय, 700 श्लोक।"
        structuredData={{
          "@context": "https://schema.org", "@type": "Book",
          name: "भगवद्गीता यथारूप", alternateName: "Bhagavad Gita As It Is",
          inLanguage: "hi",
        }}
      />

      {/* Identity modal */}
      {showIdentityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-serif text-lg font-bold text-stone-800 mb-4">Save Bookmark</h3>
            <form onSubmit={(e) => { e.preventDefault(); const input = (e.target as HTMLFormElement).elements.namedItem("contact") as HTMLInputElement; if (input.value.trim()) handleIdentitySave(input.value.trim().toLowerCase(), ""); }} className="space-y-3">
              <input name="contact" type="text" placeholder="Email or phone" className="w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm" autoFocus required />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowIdentityModal(false)} className="flex-1 px-4 py-2.5 bg-stone-100 text-stone-600 rounded-xl text-sm font-semibold">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-2.5 bg-orange-600 text-white rounded-xl text-sm font-semibold">Save</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      <div className="flex min-h-screen">
        {/* Sidebar */}
        <GitaSidebar
          chapters={chapters}
          activeChapter={activeChapter}
          progress={progress}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onChapterClick={handleChapterClick}
          bookmarks={bookmarks}
          onBookmarkJump={handleBookmarkJump}
          onBookmarkDelete={deleteBookmark}
        />

        {/* Main content */}
        <main ref={contentRef} className={`flex-1 min-w-0 ${theme.bg} transition-colors duration-300`}>
          {/* Top bar */}
          <div className={`sticky top-14 z-30 ${theme.surface} backdrop-blur-sm border-b ${theme.border} px-4 sm:px-6 py-2`}>
            <div className="max-w-3xl mx-auto flex items-center gap-2 sm:gap-3">
              {!focusMode && (
                <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 hover:bg-stone-100 rounded-lg transition-colors" aria-label="Open contents">
                  <List className={`w-5 h-5 ${theme.muted}`} />
                </button>
              )}

              {/* Page info */}
              <div className={`flex items-center gap-2 text-xs ${theme.muted} min-w-0`}>
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                {scrollChapter ? (
                  <span className="truncate font-semibold">{scrollChapter?.split("—")[0].trim()}</span>
                ) : allPages.length > 0 ? (
                  <span>Pg. {currentVisiblePage}</span>
                ) : (
                  <span>Loading...</span>
                )}
              </div>

              {/* Search */}
              <div className="relative flex-1 max-w-xs ml-auto">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
                <input
                  ref={searchRef}
                  type="text" placeholder="Search... (/)" value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-orange-200"
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
                className="px-2 py-1.5 bg-stone-100 border border-stone-200 rounded-lg text-xs font-semibold text-stone-700 hover:bg-stone-200 transition-all"
                title={lang === "hi" ? "Switch to English" : "Switch to Hindi"}
              >
                {lang === "hi" ? "EN" : "हि"}
              </button>

              {/* Bookmark */}
              <button
                onClick={saveBookmark}
                className={`p-1.5 rounded-lg transition-all ${bookmarkSaved ? "bg-orange-100 text-orange-600" : "hover:bg-stone-100 text-stone-500"}`}
                title="Bookmark (B)"
              >
                <Bookmark className={`w-4 h-4 ${bookmarkSaved ? "fill-orange-500" : ""}`} />
              </button>

              {/* Settings */}
              <div className="relative">
                <button onClick={() => setShowSettings(!showSettings)} className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-500 transition-colors">
                  <Settings className="w-4 h-4" />
                </button>
                <AnimatePresence>
                  {showSettings && <ReadingSettingsPanel settings={settings} onChange={setSettings} onClose={() => setShowSettings(false)} />}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Content area */}
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8" style={{ maxWidth: `${settings.maxWidth}px`, fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight }}>
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
                <p className="text-sm text-stone-500">Loading Bhagavad Gita...</p>
              </div>
            ) : displayPages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <BookOpen className="w-12 h-12 text-stone-300" />
                <h2 className="font-serif text-xl text-stone-600">No content available yet</h2>
                <p className="text-sm text-stone-400">The Bhagavad Gita OCR processing has not started yet.</p>
              </div>
            ) : (
              <>
                {/* Page title for first page */}
                {currentPage === 1 && !searchQuery && (
                  <motion.div variants={fadeIn} initial="hidden" animate="visible" className="mb-8 text-center">
                    <h1 className={`font-serif text-2xl sm:text-3xl font-bold ${theme.text} mb-2`}>
                      भगवद्गीता यथारूप
                    </h1>
                    <p className={`text-sm ${theme.muted}`}>Bhagavad Gita As It Is</p>
                    <p className={`text-xs ${theme.muted} mt-1`}>श्रील प्रभुपाद द्वारा हिंदी अनुवाद एवं तात्पर्य सहित</p>
                  </motion.div>
                )}

                {searchQuery && (
                  <p className={`text-xs ${theme.muted} mb-4`}>{displayPages.length} results for "{searchQuery}"</p>
                )}

                {/* Render pages */}
                {displayPages.map((page, idx) => {
                  const prevPage = idx > 0 ? displayPages[idx - 1] : (startIdx > 0 ? allPages[startIdx - 1] : null);
                  const prevEndKind = prevPage ? getPageEndKind(prevPage.text) : undefined;
                  return (
                    <div key={page.pageNumber} data-page-num={page.pageNumber} className="mb-8">
                      <RenderContent
                        text={page.text}
                        textEn={page.textEn}
                        lang={lang}
                        themeKey={settings.theme}
                        prevPageEndKind={prevEndKind}
                      />
                    </div>
                  );
                })}

                {loadingMore && (
                  <div className="flex items-center justify-center py-6 gap-2">
                    <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />
                    <span className="text-xs text-stone-400">Loading more...</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Bottom pagination */}
          {!searchQuery && allPages.length > 0 && totalViewPages > 1 && (
            <div className={`sticky bottom-0 ${theme.surface} backdrop-blur-sm border-t ${theme.border} px-4 py-2`}>
              <div className="max-w-3xl mx-auto flex items-center justify-between">
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    currentPage <= 1 ? "opacity-30 cursor-not-allowed" : "hover:bg-stone-100"
                  } ${theme.text}`}
                >
                  <ChevronLeft className="w-4 h-4" /> Previous
                </button>
                <span className={`text-xs ${theme.muted}`}>
                  Page {currentPage} of {totalViewPages}
                </span>
                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage >= totalViewPages}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    currentPage >= totalViewPages ? "opacity-30 cursor-not-allowed" : "hover:bg-stone-100"
                  } ${theme.text}`}
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </Layout>
  );
}
