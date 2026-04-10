import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { fadeInUp, fadeIn } from "@/lib/animations";
import {
  BookOpen, ChevronLeft, ChevronRight, Loader2,
  RefreshCw, Search, BookMarked, Sparkles,
  List, X, ChevronDown, ChevronUp, Image as ImageIcon, Languages,
  Download, Share2, Bookmark, Trash2, LogIn,
  Settings, Sun, Moon, Type, Minus, Plus, Maximize2,
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
        <span className="text-xs font-bold text-stone-600 dark:text-stone-300">पठन सेटिंग्स</span>
        <button onClick={onClose} className="p-1 hover:bg-stone-100 dark:hover:bg-stone-700 rounded">
          <X className="w-3.5 h-3.5 text-stone-400" />
        </button>
      </div>

      {/* Font size */}
      <div className="mb-3">
        <label className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5 block">फ़ॉन्ट आकार</label>
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
        <label className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5 block">लाइन ऊँचाई</label>
        <input type="range" min="1.4" max="2.6" step="0.1" value={settings.lineHeight}
          onChange={(e) => update({ lineHeight: parseFloat(e.target.value) })}
          className="w-full h-1.5 bg-stone-200 rounded-full appearance-none cursor-pointer accent-orange-500"
        />
        <div className="flex justify-between text-[9px] text-stone-400 mt-0.5">
          <span>सघन</span><span>{settings.lineHeight.toFixed(1)}</span><span>विरल</span>
        </div>
      </div>

      {/* Content width */}
      <div className="mb-3">
        <label className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5 block">पृष्ठ चौड़ाई</label>
        <div className="flex gap-1.5">
          {[640, 768, 896].map((w) => (
            <button key={w} onClick={() => update({ maxWidth: w })}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold border transition-all ${
                settings.maxWidth === w ? "bg-orange-100 border-orange-300 text-orange-700" : "border-stone-200 text-stone-500 hover:bg-stone-50"
              }`}
            >
              {w === 640 ? "संकीर्ण" : w === 768 ? "मध्यम" : "चौड़ा"}
            </button>
          ))}
        </div>
      </div>

      {/* Theme */}
      <div>
        <label className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5 block">थीम</label>
        <div className="flex gap-1.5">
          {([["light", "प्रकाश", "bg-white border-stone-300 text-stone-800"], ["sepia", "सेपिया", "bg-[#f4ecd8] border-[#d4c5a9] text-[#5b4636]"], ["dark", "अंधेरा", "bg-[#1a1a1a] border-stone-600 text-stone-200"]] as const).map(([t, label, cls]) => (
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

const API_BASE = "/api/bhagwatham";

const HINDI_NUMS: Record<string, number> = {
  एक: 1, दो: 2, तीन: 3, चार: 4, पाँच: 5, छः: 6, छह: 6,
  सात: 7, आठ: 8, नौ: 9, दस: 10, ग्यारह: 11, बारह: 12,
  तेरह: 13, चौदह: 14, पन्द्रह: 15, सोलह: 16, सत्रह: 17,
  अठारह: 18, उन्नीस: 19, बीस: 20,
};

const CHAPTER_RE = /^(?:Chapter\s+\S|अध्याय\s+(?:एक|दो|तीन|चार|पाँच|छः|छह|सात|आठ|नौ|दस|ग्यारह|बारह|तेरह|चौदह|पन्द्रह|सोलह|सत्रह|अठारह|उन्नीस|बीस|\d+))/iu;

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("hi-IN", {
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

function cleanOcrText(text: string): string {
  return text
    .replace(/(?<=[\u0900-\u097F\s;,।:—\-\.])\s*\b[a-zA-Z]{1,5}\b\s*[:\|]?\s*(?=[\u0900-\u097F\s;,।:—\-\.])/gu, " ")
    .replace(/(?<=[\u0900-\u097F])\s+[a-zA-Z]{1,4}\s+(?=[\u0900-\u097F])/gu, " ")
    .replace(/©/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/;\s*;/g, ";")
    .trim();
}

function extractChapterNum(line: string): number {
  const numMatch = line.match(/\d+/);
  if (numMatch) return parseInt(numMatch[0], 10);
  for (const [word, num] of Object.entries(HINDI_NUMS)) {
    if (line.includes(word)) return num;
  }
  return 0;
}

function toHindiChapterLine(t: string): string {
  // Strip leading page numbers then convert "Chapter" to "अध्याय"
  return t.replace(/^\d+\s+/, "").replace(/^Chapter\s*/i, "अध्याय ");
}

function isChapterHeading(t: string): boolean {
  // Strip leading page numbers that OCR sometimes picks up (e.g., "42 Chapter दो")
  const cleaned = t.replace(/^\d+\s+/, "");
  return CHAPTER_RE.test(cleaned) && !t.includes("पूर्ण हुए");
}

// ── Build chapter index from all loaded pages ─────────────────────────────────

function buildChapterIndex(allPages: PageContent[]): ChapterEntry[] {
  const chapters: ChapterEntry[] = [];
  for (const page of allPages) {
    if (isGarbagePage(page.text)) continue;
    const lines = page.text.split("\n");
    for (const line of lines) {
      const t = line.trim();
      if (isChapterHeading(t)) {
        const hindiLine = toHindiChapterLine(t);
        const num = extractChapterNum(hindiLine);
        if (num > 0 && !chapters.find((c) => c.number === num)) {
          // Get the subtitle (next non-empty line)
          const idx = lines.indexOf(line);
          const subtitle = lines.slice(idx + 1, idx + 3).map((l) => l.trim()).filter(Boolean).join(" ");
          chapters.push({
            number: num,
            title: hindiLine + (subtitle ? ` — ${subtitle}` : ""),
            pageNumber: page.pageNumber,
          });
        }
      }
    }
  }
  return chapters.sort((a, b) => a.number - b.number);
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
        alert("लिंक कॉपी हो गया! अब आप इसे कहीं भी शेयर कर सकते हैं।");
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
            title="डाउनलोड करें"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={handleShare}
            className="p-1.5 rounded-lg hover:bg-orange-100 text-stone-500 hover:text-orange-700 transition-colors"
            title="शेयर करें"
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
    const trimmed = contact.trim();
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
            <h3 className="font-serif text-lg font-bold text-stone-800">बुकमार्क सेव करें</h3>
            <p className="text-xs text-stone-500">अपनी पढ़ने की प्रगति सेव करें</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-stone-600 mb-1">ईमेल या फ़ोन नम्बर *</label>
            <input
              type="text" value={contact} onChange={(e) => setContact(e.target.value)}
              placeholder="email@example.com या 9876543210"
              className="w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300"
              autoFocus required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-600 mb-1">आपका नाम (वैकल्पिक)</label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="आपका नाम"
              className="w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-stone-100 text-stone-600 rounded-xl text-sm font-semibold hover:bg-stone-200 transition-colors"
            >
              रद्द करें
            </button>
            <button type="submit"
              className="flex-1 px-4 py-2.5 bg-orange-600 text-white rounded-xl text-sm font-semibold hover:bg-orange-700 transition-colors"
            >
              सेव करें
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
        <p className="text-xs text-stone-400">अभी कोई बुकमार्क नहीं</p>
        <p className="text-[10px] text-stone-300 mt-1">पृष्ठ पढ़ते समय बुकमार्क आइकन दबाएं</p>
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
                  {b.label || (b.chapter_title ? b.chapter_title.split("—")[0].trim() : `पृष्ठ ${b.page_number}`)}
                </p>
                <p className="text-[10px] text-stone-400">
                  पृष्ठ {b.page_number}
                  {b.chapter_title && ` · ${b.chapter_title.split("—")[0].trim()}`}
                </p>
              </div>
            </div>
          </button>
          <button
            onClick={() => onDelete(b)}
            className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50 text-stone-400 hover:text-red-500 transition-all"
            title="हटाएं"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Content Renderer ───────────────────────────────────────────────────────────

function RenderContent({ text, textEn, lang, chapterImages, themeKey = "light" }: { text: string; textEn?: string; lang: "hi" | "en"; chapterImages?: Map<number, Array<{ url: string; description: string }>>; themeKey?: Theme }) {
  const t = THEME_STYLES[themeKey];
  // If English selected and translation available, show English as plain text
  if (lang === "en" && textEn) {
    // Still parse chapter headings from Hindi for anchors/images
    const hiLines = cleanOcrText(text).split("\n").filter((l) => l.trim());
    const chapterAnchors: { chapterNum: number; line: string }[] = [];
    for (const raw of hiLines) {
      const t = raw.trim();
      if (isChapterHeading(t)) {
        const hindiLine = toHindiChapterLine(t);
        const chapNum = extractChapterNum(hindiLine);
        if (chapNum > 0) chapterAnchors.push({ chapterNum: chapNum, line: hindiLine });
      }
    }

    const enLines = textEn.split("\n").filter((l) => l.trim());
    return (
      <div className="space-y-4">
        {chapterAnchors.map((ch) => {
          const imgs = ch.chapterNum ? chapterImages?.get(ch.chapterNum) : undefined;
          return (
            <div key={ch.chapterNum} id={`chapter-${ch.chapterNum}`} className="mt-6 mb-4 scroll-mt-20">
              <h3 className={`font-serif text-xl sm:text-2xl font-bold ${t.text} mb-3 pb-2 border-b-2 border-orange-300/50`}>
                {ch.line}
              </h3>
              {imgs && imgs.length > 0 && (
                <div className="my-6 flex flex-col gap-5">
                  {imgs.map((img, idx) => (
                    <ImageCard key={idx} img={img} alt={`${ch.line} — दृश्य ${idx + 1}`} />
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

  const lines = cleanOcrText(text).split("\n").filter((l) => l.trim());

  type Section = { kind: "chapter" | "shlok" | "shabdarth" | "anuvad" | "tatparya" | "text"; lines: string[]; chapterNum?: number };
  const sections: Section[] = [];
  let current: Section = { kind: "text", lines: [] };

  const flush = () => { if (current.lines.length > 0) sections.push(current); };

  // Helper: check if a line looks like a verse line (short, Devanagari-heavy, no section markers)
  const isVerseLike = (line: string) => {
    if (line.length > 120 || line.length < 5) return false;
    const dev = (line.match(/[\u0900-\u097F]/gu) || []).length;
    const total = line.replace(/\s/g, "").length;
    if (total === 0 || dev / total < 0.7) return false;
    if (/^(तात्पर्य|शब्दार्थ|अनुवाद)/u.test(line)) return false;
    if ((line.includes("—") || line.includes("--")) && line.includes(";")) return false; // shabdarth
    // Prose sentences tend to end with है, हैं, था, etc. — verses don't
    if (/[।]\s*$/.test(line) && /(है|हैं|था|थे|थी|गया|गयी|करें|रहा|सकता|चाहिए)\s*[।]?\s*$/u.test(line)) return false;
    return true;
  };

  // Helper: lookahead to check if ॥ appears within the next N lines
  const hasDoubleViramAhead = (fromIdx: number, maxLook: number = 6) => {
    for (let j = fromIdx; j < Math.min(lines.length, fromIdx + maxLook); j++) {
      const lt = lines[j].trim();
      if (/॥/u.test(lt)) return true;
      // Stop looking if we hit a section marker
      if (/^(तात्पर्य|शब्दार्थ|अनुवाद)/u.test(lt)) return false;
      if (isChapterHeading(lt)) return false;
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
      current = { kind: "shabdarth", lines: [] };
      continue;
    }

    // Line contains ॥ — definitely shlok (closing line of verse)
    if (/॥/u.test(t) && t.length < 200) {
      if (current.kind !== "shlok") { flush(); current = { kind: "shlok", lines: [] }; }
      current.lines.push(t);
      continue;
    }

    // Already in a shlok — continue if line looks verse-like
    if (current.kind === "shlok" && isVerseLike(t)) {
      current.lines.push(t);
      continue;
    }

    // Not yet in shlok — check if this verse-like line has ॥ ahead (lookahead)
    if (current.kind !== "shlok" && isVerseLike(t) && hasDoubleViramAhead(i + 1)) {
      flush();
      current = { kind: "shlok", lines: [t] };
      continue;
    }

    if (current.kind === "shabdarth" && (t.includes("—") || t.includes("--")) && t.includes(";")) {
      current.lines.push(t);
      continue;
    }

    if (current.kind === "shabdarth" && !(t.includes("—") || t.includes("--"))) {
      flush();
      current = { kind: "anuvad", lines: [t] };
      continue;
    }

    if (current.kind === "shlok") {
      flush();
      current = { kind: "anuvad", lines: [t] };
      continue;
    }

    current.lines.push(t);
  }
  flush();

  return (
    <div className="space-y-5">
      {sections.map((sec, i) => {
        switch (sec.kind) {
          case "chapter": {
            const imgs = sec.chapterNum ? chapterImages?.get(sec.chapterNum) : undefined;
            return (
              <div key={i} id={`chapter-${sec.chapterNum}`} className="mt-6 mb-4 scroll-mt-20">
                <h3 className={`font-serif text-xl sm:text-2xl font-bold ${t.text} mb-3 pb-2 border-b-2 border-orange-300/50`}>
                  {sec.lines.join(" ")}
                </h3>
                {imgs && imgs.length > 0 && (
                  <div className="my-6 flex flex-col gap-5">
                    {imgs.map((img, idx) => (
                      <ImageCard key={idx} img={img} alt={`${sec.lines.join(" ")} — दृश्य ${idx + 1}`} />
                    ))}
                  </div>
                )}
              </div>
            );
          }
          case "shlok":
            return (
              <div key={i} className={`rounded-lg p-4 ${themeKey === "dark" ? "bg-orange-950/30 border border-orange-800/40" : themeKey === "sepia" ? "bg-[#ece0c4] border border-[#c4ad80]" : "bg-orange-50 border border-orange-200/60"}`}>
                <p className={`text-[11px] font-bold mb-2 tracking-wide ${themeKey === "dark" ? "text-orange-400" : "text-orange-400"}`}>श्लोक</p>
                {sec.lines.map((l, j) => (
                  <p key={j} className={`font-serif sm:text-[17px] leading-[1.8] ${t.text} mb-0.5`}>{l}</p>
                ))}
              </div>
            );
          case "shabdarth":
            return (
              <div key={i} className={`rounded-lg p-4 ${themeKey === "dark" ? "bg-stone-800/50 border border-stone-700" : themeKey === "sepia" ? "bg-[#e8dcc6] border border-[#c4b08a]" : "bg-stone-50 border border-stone-200/60"}`}>
                <p className={`text-[11px] font-bold mb-2 tracking-wide ${t.muted}`}>शब्दार्थ</p>
                {sec.lines.map((l, j) => (
                  <p key={j} className={`text-[14px] leading-[1.7] ${t.muted} mb-0.5`}>{l}</p>
                ))}
              </div>
            );
          case "anuvad":
            return (
              <div key={i} className={`rounded-lg p-4 ${themeKey === "dark" ? "bg-blue-950/30 border border-blue-800/30" : themeKey === "sepia" ? "bg-[#e6dcc8] border border-[#bfa878]" : "bg-blue-50/60 border border-blue-200/50"}`}>
                <p className={`text-[11px] font-bold mb-2 tracking-wide ${themeKey === "dark" ? "text-blue-400" : "text-blue-400"}`}>अनुवाद</p>
                {sec.lines.map((l, j) => (
                  <p key={j} className={`leading-[1.8] ${t.text} mb-1`}>{l}</p>
                ))}
              </div>
            );
          case "tatparya":
            return (
              <div key={i} className={`rounded-lg p-4 ${themeKey === "dark" ? "bg-green-950/30 border border-green-800/30" : themeKey === "sepia" ? "bg-[#e2dbc4] border border-[#b5a67a]" : "bg-green-50/50 border border-green-200/50"}`}>
                <p className={`text-[11px] font-bold mb-2 tracking-wide ${themeKey === "dark" ? "text-green-400" : "text-green-500"}`}>तात्पर्य</p>
                {sec.lines.map((l, j) => (
                  <p key={j} className={`text-[14px] sm:text-[15px] leading-[1.8] ${t.text} mb-1`}>{l}</p>
                ))}
              </div>
            );
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
}: {
  chapters: ChapterEntry[];
  chapterImages: Map<number, Array<{ url: string; description: string }>>;
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

      {/* Sidebar panel */}
      <aside className={`
        fixed top-0 left-0 h-full w-72 bg-white border-r border-stone-200 z-50
        transform transition-transform duration-300 ease-in-out overflow-y-auto
        lg:sticky lg:top-20 lg:h-[calc(100vh-5rem)] lg:transform-none lg:z-0
        ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}>
        {/* Header with tabs */}
        <div className="sticky top-0 bg-white border-b border-stone-100 z-10">
          <div className="px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-0.5">
              <button
                onClick={() => setSidebarTab("chapters")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${sidebarTab === "chapters" ? "bg-white text-orange-700 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}
              >
                <span className="flex items-center gap-1.5"><BookMarked className="w-3.5 h-3.5" /> विषय सूची</span>
              </button>
              <button
                onClick={() => setSidebarTab("bookmarks")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${sidebarTab === "bookmarks" ? "bg-white text-orange-700 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}
              >
                <span className="flex items-center gap-1.5">
                  <Bookmark className="w-3.5 h-3.5" /> बुकमार्क
                  {bookmarks.length > 0 && <span className="bg-orange-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center">{bookmarks.length}</span>}
                </span>
              </button>
            </div>
            <button onClick={onClose} className="lg:hidden p-1 hover:bg-stone-100 rounded">
              <X className="w-4 h-4 text-stone-500" />
            </button>
          </div>
        </div>

        {/* Progress mini */}
        {progress && (
          <div className="px-4 py-3 border-b border-stone-100">
            <div className="flex items-center justify-between text-[11px] text-stone-500 mb-1.5">
              <span>{progress.totalPagesProcessed.toLocaleString()} / {progress.totalPagesInPdf.toLocaleString()} पृष्ठ</span>
              <span className="font-bold text-orange-600">{percent.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-orange-400 to-amber-500 rounded-full transition-all duration-700" style={{ width: `${percent}%` }} />
            </div>
            <div className="flex items-center justify-between text-[10px] text-stone-400 mt-1.5">
              <span>{progress.batchesCompleted} बैच पूर्ण</span>
              <span>{progress.status === "processing" ? "चल रहा..." : progress.status === "completed" ? "पूर्ण" : "प्रतीक्षा"}</span>
            </div>
          </div>
        )}

        {/* Tab content */}
        {sidebarTab === "bookmarks" ? (
          <div className="py-3">
            <BookmarkPanel bookmarks={bookmarks} onJump={onBookmarkJump} onDelete={onBookmarkDelete} />
          </div>
        ) : (
          <>
            {/* Chapter list */}
            <nav className="py-2">
              <p className="px-4 py-2 text-[10px] font-bold text-stone-400 uppercase tracking-wider">स्कन्ध १ — सृष्टि</p>
              {chapters.length === 0 ? (
                <p className="px-4 py-3 text-xs text-stone-400">अभी कोई अध्याय उपलब्ध नहीं</p>
              ) : (
                chapters.map((ch) => {
                  const isActive = activeChapter === ch.number;
                  const imgSrc = chapterImages.get(ch.number)?.[0]?.url;
                  const shortTitle = ch.title.split("—")[0].trim();
                  const subtitle = ch.title.includes("—") ? ch.title.split("—").slice(1).join("—").trim() : "";

                  return (
                    <button
                      key={ch.number}
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
                        <p className="text-[10px] text-stone-400 mt-0.5">पृष्ठ {ch.pageNumber}</p>
                      </div>
                    </button>
                  );
                })
              )}
            </nav>
          </>
        )}

        {/* Footer credit */}
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

export default function Bhagwatham() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [allPages, setAllPages] = useState<PageContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [chapterImages, setChapterImages] = useState<Map<number, Array<{ url: string; description: string }>>>(new Map());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeChapter, setActiveChapter] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [lang, setLang] = useState<"hi" | "en">("hi");
  const [readerId, setReaderId] = useState<string | null>(() => localStorage.getItem("bhagwatham_reader_id"));
  const [readerName, setReaderName] = useState<string | null>(() => localStorage.getItem("bhagwatham_reader_name"));
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([]);
  const [showIdentityModal, setShowIdentityModal] = useState(false);
  const [bookmarkSaved, setBookmarkSaved] = useState(false);
  const [settings, setSettings] = useState<ReadingSettings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [scrollChapter, setScrollChapter] = useState<string | null>(null);
  const [showResume, setShowResume] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const PAGES_PER_VIEW = 20;
  const contentRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Fetch all batch data and flatten into pages
  const fetchAllContent = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/content?page=1&limit=100`);
      const data: ContentResponse = await res.json();
      const pages = data.batches.flatMap((b) => b.pages).filter((p) => !isGarbagePage(p.text));
      setAllPages(pages);
    } catch { /* empty */ } finally { setLoading(false); }
  }, []);

  const fetchProgress = useCallback(async () => {
    try { const res = await fetch(`${API_BASE}/progress`); setProgress(await res.json()); } catch { /* retry */ }
  }, []);

  const fetchImageManifest = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/image-manifest`);
      const manifest: ImageManifest = await res.json();
      const map = new Map<number, Array<{ url: string; description: string }>>();
      for (const img of manifest.images) {
        const cacheBuster = new Date(img.generatedAt).getTime() || Date.now();
        const entry = {
          url: `${API_BASE}/images/${img.imagePath}?v=${cacheBuster}`,
          description: img.descriptionHi || img.prompt.split(",").slice(0, 2).join(",").trim(),
        };
        const existing = map.get(img.chapterNumber) || [];
        existing.push(entry);
        map.set(img.chapterNumber, existing);
      }
      setChapterImages(map);
    } catch { /* optional */ }
  }, []);

  // ── Bookmark functions ──────────────────────────────────────────────────────
  const fetchBookmarks = useCallback(async (rid?: string) => {
    const id = rid || readerId;
    if (!id) return;
    try {
      const res = await fetch(`${API_BASE}/bookmarks?reader_id=${encodeURIComponent(id)}`);
      const data: BookmarkEntry[] = await res.json();
      setBookmarks(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  }, [readerId]);

  const saveBookmark = useCallback(async () => {
    if (!readerId) { setShowIdentityModal(true); return; }

    const idx = (currentPage - 1) * PAGES_PER_VIEW;
    const pageNum = allPages[idx]?.pageNumber;
    if (!pageNum) return;

    // Find current chapter context
    const chapterList = buildChapterIndex(allPages);
    const currentChapter = chapterList.slice().reverse().find(ch => ch.pageNumber <= pageNum);

    try {
      await fetch(`${API_BASE}/bookmarks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reader_id: readerId,
          reader_name: readerName,
          page_number: pageNum,
          chapter_number: currentChapter?.number || null,
          chapter_title: currentChapter?.title || null,
        }),
      });
      await fetchBookmarks();
      setBookmarkSaved(true);
      setTimeout(() => setBookmarkSaved(false), 2000);
    } catch { /* ignore */ }
  }, [readerId, readerName, allPages, currentPage, fetchBookmarks]);

  const deleteBookmark = useCallback(async (b: BookmarkEntry) => {
    if (!readerId) return;
    try {
      await fetch(`${API_BASE}/bookmarks/${b.id}?reader_id=${encodeURIComponent(readerId)}`, { method: "DELETE" });
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
      if (b.chapter_number) setActiveChapter(b.chapter_number);
      setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 100);
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
      fetch(`${API_BASE}/bookmarks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reader_id: id, reader_name: name || null,
          page_number: pageNum,
          chapter_number: currentChapter?.number || null,
          chapter_title: currentChapter?.title || null,
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

  // Build chapter index from loaded pages
  const chapters = useMemo(() => buildChapterIndex(allPages), [allPages]);

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

  const handleChapterClick = (ch: ChapterEntry) => {
    setSidebarOpen(false);
    setSearchQuery("");
    // Find which view page contains this chapter
    const pageIdx = allPages.findIndex((p) => p.pageNumber === ch.pageNumber);
    if (pageIdx >= 0) {
      const viewPage = Math.floor(pageIdx / PAGES_PER_VIEW) + 1;
      setCurrentPage(viewPage);
      setActiveChapter(ch.number);
      // Scroll to chapter heading after render
      setTimeout(() => {
        const el = document.getElementById(`chapter-${ch.number}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 200);
    }
  };

  // ── Auto-save reading position ───────────────────────────────────────────
  useEffect(() => {
    if (allPages.length > 0 && currentPage > 1) {
      const pageNum = allPages[(currentPage - 1) * PAGES_PER_VIEW]?.pageNumber;
      if (pageNum) {
        const currentChapter = chapters.slice().reverse().find(ch => ch.pageNumber <= pageNum);
        localStorage.setItem("bhagwatham_resume", JSON.stringify({
          page: currentPage, pageNumber: pageNum,
          chapter: currentChapter?.title?.split("—")[0].trim() || "",
          chapterNumber: currentChapter?.number || null,
          savedAt: Date.now(),
        }));
      }
    }
  }, [currentPage, allPages, chapters]);

  // Show resume card on load
  useEffect(() => {
    if (!loading && allPages.length > 0) {
      try {
        const raw = localStorage.getItem("bhagwatham_resume");
        if (raw) {
          const resume = JSON.parse(raw);
          if (resume.page > 1 && currentPage === 1) setShowResume(true);
        }
      } catch { /* ignore */ }
    }
  }, [loading, allPages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResume = () => {
    try {
      const raw = localStorage.getItem("bhagwatham_resume");
      if (raw) {
        const resume = JSON.parse(raw);
        setCurrentPage(resume.page);
        if (resume.chapterNumber) setActiveChapter(resume.chapterNumber);
      }
    } catch { /* ignore */ }
    setShowResume(false);
  };

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
            const ch = chapters.find(c => c.number === num);
            if (ch) {
              setScrollChapter(ch.title.split("—")[0].trim());
              setActiveChapter(ch.number);
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

  // Theme
  const theme = THEME_STYLES[settings.theme];

  // Page range display
  const firstPageNum = displayPages[0]?.pageNumber ?? 0;
  const lastPageNum = displayPages[displayPages.length - 1]?.pageNumber ?? 0;

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
        />

        {/* ── Main content ── */}
        <main ref={contentRef} className={`flex-1 min-w-0 ${theme.bg} transition-colors duration-300`}>
          {/* Top bar */}
          <div className={`sticky top-14 z-30 ${theme.surface} backdrop-blur-sm border-b ${theme.border} px-4 sm:px-6 py-2`}>
            <div className="max-w-3xl mx-auto flex items-center gap-2 sm:gap-3">
              {/* Sidebar toggle (mobile) */}
              {!focusMode && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  className={`lg:hidden p-2 hover:bg-stone-100 rounded-lg transition-colors`}
                  aria-label="विषय सूची खोलें"
                >
                  <List className={`w-5 h-5 ${theme.muted}`} />
                </button>
              )}

              {/* Page info + sticky chapter */}
              <div className={`flex items-center gap-2 text-xs ${theme.muted} min-w-0`}>
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                {scrollChapter ? (
                  <span className="truncate font-semibold">{scrollChapter}</span>
                ) : allPages.length > 0 && !searchQuery ? (
                  <span className="whitespace-nowrap">पृ. {firstPageNum}–{lastPageNum} / {allPages.length}</span>
                ) : searchQuery ? (
                  <span>{displayPages.length} परिणाम</span>
                ) : (
                  <span>लोड हो रहा है...</span>
                )}
              </div>

              {/* Search */}
              <div className="relative flex-1 max-w-xs ml-auto">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
                <input
                  ref={searchRef}
                  type="text" placeholder="खोजें... (/)" value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-orange-200 focus:border-orange-300 transition-all"
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
                className="px-2 py-1.5 bg-stone-100 border border-stone-200 rounded-lg text-xs font-semibold text-stone-700 hover:bg-stone-200 transition-all active:scale-95"
                title={lang === "hi" ? "Switch to English" : "हिंदी में पढ़ें"}
              >
                {lang === "hi" ? "EN" : "हि"}
              </button>

              {/* Bookmark button */}
              <button
                onClick={saveBookmark}
                className={`relative p-1.5 rounded-lg transition-all active:scale-95 ${
                  bookmarkSaved ? "bg-orange-100 text-orange-600" : `hover:bg-stone-100 ${theme.muted} hover:text-orange-600`
                }`}
                title="बुकमार्क (B)"
              >
                <Bookmark className={`w-4 h-4 ${bookmarkSaved ? "fill-orange-500" : ""}`} />
              </button>

              {/* Settings button */}
              <div className="relative">
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className={`p-1.5 rounded-lg transition-all ${showSettings ? "bg-orange-100 text-orange-600" : `hover:bg-stone-100 ${theme.muted}`}`}
                  title="पठन सेटिंग्स"
                >
                  <Settings className="w-4 h-4" />
                </button>
                <AnimatePresence>
                  {showSettings && <ReadingSettingsPanel settings={settings} onChange={setSettings} onClose={() => setShowSettings(false)} />}
                </AnimatePresence>
              </div>

              {/* Focus mode */}
              <button
                onClick={() => setFocusMode(!focusMode)}
                className={`hidden sm:block p-1.5 rounded-lg transition-all ${focusMode ? "bg-orange-100 text-orange-600" : `hover:bg-stone-100 ${theme.muted}`}`}
                title="फ़ोकस मोड (F)"
              >
                <Maximize2 className="w-4 h-4" />
              </button>

              {/* Process button */}
              {!focusMode && (
                <button onClick={triggerProcess} disabled={isProcessing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 text-white rounded-lg font-semibold text-xs hover:bg-orange-700 transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap"
                >
                  {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  <span className="hidden sm:inline">{isProcessing ? "चल रहा..." : "अगले 20 पृष्ठ"}</span>
                </button>
              )}
            </div>
          </div>

          {/* Sticky chapter context bar */}
          {scrollChapter && !searchQuery && (
            <div className={`sticky top-[7.5rem] z-20 ${theme.surface} backdrop-blur-sm border-b ${theme.border} px-4 py-1.5`}>
              <div className="max-w-3xl mx-auto flex items-center gap-2 text-[10px]">
                <span className={`font-bold ${theme.accent}`}>स्कन्ध १</span>
                <span className={theme.muted}>/</span>
                <span className={`font-semibold ${theme.text}`}>{scrollChapter}</span>
                <span className={`ml-auto ${theme.muted}`}>पृ. {firstPageNum}–{lastPageNum}</span>
              </div>
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
                    Pages processed before Sarvam AI was enabled don't have English translations.
                    New batches will include English automatically. Showing Hindi text as fallback.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Resume card */}
          <AnimatePresence>
            {showResume && (
              <motion.div
                initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                className="max-w-3xl mx-auto px-4 sm:px-6 pt-4"
              >
                <div className={`rounded-xl ${settings.theme === "dark" ? "bg-stone-800 border-stone-600" : settings.theme === "sepia" ? "bg-[#e8dcc4] border-[#c4b08a]" : "bg-orange-50 border-orange-200"} border p-4 flex items-center gap-3`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${settings.theme === "dark" ? "bg-orange-900/40" : "bg-orange-100"}`}>
                    <BookOpen className={`w-5 h-5 ${theme.accent}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${theme.text}`}>पिछली बार पढ़ रहे थे?</p>
                    <p className={`text-xs ${theme.muted} mt-0.5`}>
                      {(() => { try { const r = JSON.parse(localStorage.getItem("bhagwatham_resume") || "{}"); return r.chapter ? `${r.chapter} — पृष्ठ ${r.pageNumber}` : `पृष्ठ ${r.pageNumber}`; } catch { return ""; } })()}
                    </p>
                  </div>
                  <button onClick={handleResume}
                    className="px-4 py-2 bg-orange-600 text-white rounded-lg text-xs font-bold hover:bg-orange-700 transition-all active:scale-95 shrink-0"
                  >
                    जारी रखें
                  </button>
                  <button onClick={() => setShowResume(false)} className={`p-1.5 rounded-lg hover:bg-stone-200/50 ${theme.muted}`}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Content area */}
          <div
            className="mx-auto px-4 sm:px-6 py-6"
            style={{ maxWidth: settings.maxWidth, fontSize: settings.fontSize, lineHeight: settings.lineHeight }}
          >
            {loading ? (
              <div className={`flex flex-col items-center justify-center py-24 ${theme.muted}`}>
                <Loader2 className="w-8 h-8 animate-spin mb-4" />
                <p className="text-sm">लोड हो रहा है...</p>
              </div>
            ) : displayPages.length === 0 ? (
              <motion.div variants={fadeInUp} initial="hidden" animate="visible" className="text-center py-20">
                <div className="w-16 h-16 mx-auto mb-5 bg-orange-100 rounded-2xl flex items-center justify-center">
                  <BookOpen className="w-8 h-8 text-orange-400" />
                </div>
                <h3 className={`font-serif text-xl font-bold ${theme.text} mb-2`}>
                  {searchQuery ? "कोई परिणाम नहीं" : "अभी कोई पृष्ठ तैयार नहीं"}
                </h3>
                <p className={`${theme.muted} text-sm max-w-sm mx-auto mb-5`}>
                  {searchQuery ? "कृपया अन्य शब्द खोजें।" : "\"अगले 20 पृष्ठ\" बटन दबाएं या स्वचालित प्रक्रिया की प्रतीक्षा करें।"}
                </p>
                {!searchQuery && (
                  <button onClick={triggerProcess} disabled={isProcessing}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-orange-600 text-white rounded-xl font-bold text-sm hover:bg-orange-700 transition-all active:scale-95"
                  >
                    <Sparkles className="w-4 h-4" /> प्रारम्भ करें
                  </button>
                )}
              </motion.div>
            ) : (
              <div className="space-y-1">
                {displayPages.map((page) => (
                  <div key={page.pageNumber}>
                    <p className={`text-[10px] ${theme.muted} font-medium text-right my-3 opacity-60`}>पृ. {page.pageNumber}</p>
                    <RenderContent text={page.text} textEn={page.textEn} lang={lang} chapterImages={chapterImages} themeKey={settings.theme} />
                  </div>
                ))}
              </div>
            )}

            {/* ── Pagination ── */}
            {!searchQuery && totalViewPages > 1 && (
              <div className={`flex items-center justify-center gap-2 mt-10 mb-6 pb-4 border-t ${theme.border} pt-6`}>
                <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 ${theme.surface} border ${theme.border} rounded-lg text-xs font-semibold ${theme.text} hover:border-orange-300 transition-all disabled:opacity-30`}
                >
                  <ChevronLeft className="w-3 h-3" /> पिछला
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
                  अगला <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Footer */}
            <div className={`text-center py-6 border-t ${theme.border}`}>
              <p className={`text-[10px] ${theme.muted} leading-relaxed max-w-md mx-auto`}>
                श्रीमद्भागवतम् (भागवत पुराण) — कृष्णकृपामूर्ति श्री श्रीमद् ए.सी. भक्तिवेदान्त स्वामी प्रभुपाद
                द्वारा हिंदी अनुवाद एवं तात्पर्य। भक्तिवेदान्त बुक ट्रस्ट (BBT) द्वारा प्रकाशित।
              </p>
            </div>
          </div>
        </main>
      </div>
    </Layout>
  );
}
