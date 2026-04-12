/**
 * Pure utility functions for the Bhagwatham reader.
 * Extracted from bhagwatham.tsx for testability.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PageContent {
  pageNumber: number;
  text: string;
  textEn?: string;
}

export interface ChapterEntry {
  number: number;
  skandh: number;
  globalNumber: number;
  title: string;
  pageNumber: number;
}

export type SectionKind = "chapter" | "shlok" | "ref-shlok" | "shabdarth" | "anuvad" | "tatparya" | "text";

export interface Section {
  kind: SectionKind;
  lines: string[];
  chapterNum?: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

export const HINDI_NUMS: Record<string, number> = {
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
  इकतीस: 31, इक्तीस: 31, बत्तीस: 32, तैंतीस: 33, चौंतीस: 34,
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
};

/** Hindi hundred-multiplier words → multiplier value */
const HINDI_HUNDREDS: Record<string, number> = {
  एक: 100, दो: 200, तीन: 300, चार: 400, पाँच: 500, पांच: 500,
};

/**
 * Parse a Hindi number string that may be a compound like "एक सौ इक्कीस" (121)
 * or "दो सौ पचास" (250), or a simple word like "बीस" (20).
 * Supports values 1–500+.
 */
export function parseHindiNumber(text: string): number {
  const trimmed = text.trim();

  // Try direct lookup first (covers 1–100)
  if (HINDI_NUMS[trimmed] !== undefined) return HINDI_NUMS[trimmed];

  // Try compound: "<X> सौ [<Y>]" → X*100 + Y
  const sauMatch = trimmed.match(/^(.+?)\s+सौ(?:\s+(.+))?$/u);
  if (sauMatch) {
    const hundredWord = sauMatch[1].trim();
    const hundredVal = HINDI_HUNDREDS[hundredWord];
    if (hundredVal) {
      const remainder = sauMatch[2]?.trim();
      if (!remainder) return hundredVal; // "दो सौ" → 200
      const unit = HINDI_NUMS[remainder];
      if (unit !== undefined) return hundredVal + unit; // "दो सौ पचास" → 250
    }
  }

  return 0; // not recognized
}

// Match chapter headings: must be ONLY the heading (no trailing prose).
// "अध्याय आठ" ✓  |  "Chapter बीस" ✓  |  "अध्याय आठ में जहाँ..." ✗
// The \s*$ anchor rejects inline references like "अध्याय का सारांश"
export const CHAPTER_RE = /^(?:Chapter\s+\S+|अध्याय\s+(?:[\u0900-\u097F]+(?:\s+[\u0900-\u097F]+){0,2}|\d+))\s*$/iu;

export const OCR_CHAPTER_FIXES: Record<string, { num: number; label: string }> = {
  "Chapter 278 अध्याय": { num: 8, label: "अध्याय आठ" },
  "Chapter it": { num: 9, label: "अध्याय नौ" },
  "(शुषा दो": { num: 2, label: "अध्याय दो" },
  "Chapter 3:": { num: 6, label: "अध्याय छह" },
  "(नौ": { num: 9, label: "अध्याय नौ" },
};

// ── Helper Functions ─────────────────────────────────────────────────────────

export function isGarbagePage(text: string): boolean {
  if (!text || text.length < 20) return true;
  const devanagari = (text.match(/[\u0900-\u097F]/gu) || []).length;
  const total = text.replace(/\s/g, "").length;
  if (total === 0) return true;
  if (devanagari / total < 0.4) return true;
  const ascii = (text.match(/[a-zA-Z0-9@#$%^&*(){}\[\]|\\<>]/gu) || []).length;
  if (total > 0 && ascii / total > 0.25) return true;
  return false;
}

export function isStandalonePageNumber(line: string): boolean {
  return /^\d{1,5}[\]\)]*$/.test(line.trim());
}

export function stripLeadingPageNumber(line: string): string {
  return line.replace(/^\d{2,5}[\]\)]*\s+/, "");
}

export function cleanOcrText(text: string): string {
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
    .replace(/^(\d{1,5}[\]\)]*)$/gmu, "")
    .replace(/(?<=[\u0900-\u097F\s;,।:—\-\.])\s*\b[a-zA-Z]{1,5}\b\s*[:\|]?\s*(?=[\u0900-\u097F\s;,।:—\-\.])/gu, " ")
    .replace(/(?<=[\u0900-\u097F])\s+[a-zA-Z]{1,4}\s+(?=[\u0900-\u097F])/gu, " ")
    .replace(/©/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[^\S\n]{2,}/g, " ")
    .replace(/;\s*;/g, ";")
    .trim();
  for (const { placeholder, original } of placeholders) {
    result = result.replace(placeholder, original);
  }
  return result;
}

export function extractChapterNum(line: string): number {
  // 1. OCR fixes take priority
  for (const [key, fix] of Object.entries(OCR_CHAPTER_FIXES)) {
    if (line.includes(key) || line.includes(fix.label)) return fix.num;
  }

  // 2. Try compound Hindi number parser (handles "एक सौ इक्कीस" = 121, etc.)
  //    Extract the number portion after "अध्याय" or "Chapter"
  const afterHeading = line.replace(/^(?:अध्याय|Chapter)\s*/iu, "").trim();
  if (afterHeading) {
    const compound = parseHindiNumber(afterHeading);
    if (compound > 0) return compound;
  }

  // 3. Simple Hindi word lookup (fallback for lines without heading prefix)
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

export function toHindiChapterLine(t: string): string {
  const cleaned = t.replace(/^\d+\s+/, "");
  for (const [key, fix] of Object.entries(OCR_CHAPTER_FIXES)) {
    if (cleaned.includes(key) || t.includes(key)) return fix.label;
  }
  return cleaned.replace(/^Chapter\s*/i, "अध्याय ");
}

export function isChapterHeading(t: string): boolean {
  const cleaned = t.replace(/^\d+\s+/, "");
  // Reject colophons and long inline references (real headings are short)
  if (t.includes("पूर्ण हुए") || t.includes("पूर्ण हुआ")) return false;
  if (cleaned.length > 60) return false; // Real headings: "अध्याय बीस" (~15 chars)
  if (CHAPTER_RE.test(cleaned)) return true;
  for (const key of Object.keys(OCR_CHAPTER_FIXES)) {
    if (cleaned.includes(key) || t.includes(key)) return true;
  }
  return false;
}

// ── Section Detection Helpers ───────────────────────────────────────────────

export function countHindiPostpositions(line: string): number {
  const matches = line.match(/(?:^|\s)(?:का|की|के|को|में|पर|से|ने|तक|और|या|भी|तो|ही|यह|वह|जो|इस|उस|कि|जब|तब|नहीं|प्रति|बिना|साथ|लिए|बारे|जैसे|क्योंकि|इसलिए|फिर|अभी|कभी|सभी|किसी|अपने|उनके|इनके|जिसमें|जिससे|जिसको)(?:\s|[।,;:\)]|$)/gu);
  return matches ? matches.length : 0;
}

export const HINDI_VERB_RE = /(?:है[ँं]?|हैं|हैँ|था|थे|थी|गया|गयी|गई|किया|करें|करे|रहा|सकता|चाहिए|हुई|हुए|होता|होती|होते|करते|करता|करना|बताया|कहा|सुना|दिया|लिया|पड़ा|आया|चुके|चुका|रहे|रही|जाता|जाती|जाते|मिलता|रखा|बचा|डाला|बनाकर|कहलाता|कहलाती|सकती|सकते|देखे|लगती|लगते|भोगता|जानता|उठाते|करोगे|करेगा|करेगी|करेंगे|दिखाया|सुनाया|बैठकर|होकर|करके|लाकर|जाकर|दिखाते|चलाते|बताते|सुनाते|पालते|रहते|चलते|बनाते|मानते|जानते|कहते|देते|लेते|आते|होनी|चाहती|चाहते|पाते|दिखती|मिलती|बनती|चलती|आती|पाती)(?:\s|[।,;:\)]|$)/u;

export function countVisarga(line: string): number {
  return (line.match(/ः/gu) || []).length;
}

const SANSKRIT_PARTICLES_RE = /(?:^|\s)(?:च|एव|हि|तु|अपि|वै|न|यदा|तदा|तथा|इति|किम्|तत्|एषः|सः|यः|अथ|परम्)(?:\s|[।॥,;:\)]|$)/gu;

export function countSanskritParticles(line: string): number {
  const matches = line.match(SANSKRIT_PARTICLES_RE);
  return matches ? matches.length : 0;
}

export function countSanskritEndings(line: string): number {
  const matches = line.match(/(?:स्य|ेन|ाय|ात्|ेषु|ानाम्|ेभ्यः|ाभिः|ायाः|म्\s)/gu);
  return matches ? matches.length : 0;
}

export function sanskritScore(line: string): number {
  return countVisarga(line) * 4 + countSanskritParticles(line) * 3 + countSanskritEndings(line) * 3;
}

export function isVerseLike(line: string): boolean {
  if (line.length > 120 || line.length < 5) return false;
  const dev = (line.match(/[\u0900-\u097F]/gu) || []).length;
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
}

// ── Section Parser ──────────────────────────────────────────────────────────

export function parseSections(text: string, prevPageEndKind?: string): Section[] {
  const lines = cleanOcrText(text).split("\n")
    .filter((l) => l.trim() && !isStandalonePageNumber(l))
    .map((l) => stripLeadingPageNumber(l));

  const sections: Section[] = [];
  const initialKind: SectionKind = (prevPageEndKind === "tatparya" || prevPageEndKind === "anuvad" || prevPageEndKind === "ref-shlok")
    ? prevPageEndKind as SectionKind
    : "text";
  let current: Section = { kind: initialKind, lines: [] };

  const flush = () => { if (current.lines.length > 0) sections.push(current); };

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
      if (sections.length > 0 && sections[sections.length - 1].kind === "text") {
        sections[sections.length - 1].kind = "shlok";
      }
      current = { kind: "shabdarth", lines: [] };
      continue;
    }

    if (/॥/u.test(t) && t.length < 200) {
      const shlokKind: SectionKind = (current.kind === "tatparya" || current.kind === "ref-shlok") ? "ref-shlok" : "shlok";
      if (current.kind !== "shlok" && current.kind !== "ref-shlok") { flush(); current = { kind: shlokKind, lines: [] }; }
      current.lines.push(t);
      continue;
    }

    if ((current.kind === "shlok" || current.kind === "ref-shlok") && isVerseLike(t)) {
      current.lines.push(t);
      continue;
    }

    if (current.kind !== "shlok" && current.kind !== "ref-shlok" && isVerseLike(t) && hasDoubleViramAhead(i + 1)) {
      const shlokKind: SectionKind = current.kind === "tatparya" ? "ref-shlok" : "shlok";
      flush();
      current = { kind: shlokKind, lines: [t] };
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

  return sections;
}

// ── Cross-page continuity ───────────────────────────────────────────────────

export function getPageEndKind(text: string): string {
  if (!text) return "text";
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  let lastKind = "text";
  for (const line of lines) {
    if (/^तात्पर्य/u.test(line)) lastKind = "tatparya";
    else if (/^अनुवाद/u.test(line)) lastKind = "anuvad";
    else if (/^शब्दार्थ/u.test(line)) lastKind = "shabdarth";
    else if (/॥/u.test(line)) lastKind = (lastKind === "tatparya") ? "ref-shlok" : "shlok";
    else if (/^(अध्याय|स्कन्ध|Chapter)/iu.test(line)) lastKind = "text";
  }
  return lastKind;
}

// ── Chapter index builder ───────────────────────────────────────────────────

export function buildChapterIndex(allPages: PageContent[]): ChapterEntry[] {
  const chapters: ChapterEntry[] = [];
  let currentSkandh = 1;
  let globalCounter = 0;
  let lastChapterNum = 0;

  for (const page of allPages) {
    if (isGarbagePage(page.text)) continue;

    const lines = page.text.split("\n");
    const chapterHeadingCount = lines.filter((l) => isChapterHeading(l.trim())).length;
    if (chapterHeadingCount >= 2) continue;

    for (const line of lines) {
      const t = line.trim();
      if (isChapterHeading(t)) {
        const hindiLine = toHindiChapterLine(t);
        let num = extractChapterNum(hindiLine);
        if (num > 0) {
          // Detect new skandh: chapter resets to 1 after a higher chapter
          if (num === 1 && lastChapterNum > 1) {
            currentSkandh++;
          }
          // Skip backward jumps within same skandh (likely false positives from inline text)
          // Exception: num=1 is allowed (new skandh boundary)
          if (num < lastChapterNum && num !== 1 && lastChapterNum > 2) continue;
          // Skip duplicates within same skandh
          if (chapters.find((c) => c.number === num && c.skandh === currentSkandh)) continue;
          const idx = lines.indexOf(line);
          const subtitle = lines.slice(idx + 1, idx + 3).map((l) => l.trim()).filter(Boolean).join(" ");
          globalCounter++;
          lastChapterNum = num;
          chapters.push({
            number: num,
            skandh: currentSkandh,
            globalNumber: globalCounter,
            title: hindiLine + (subtitle ? ` — ${subtitle}` : ""),
            pageNumber: page.pageNumber,
          });
        }
      }
    }
  }
  return chapters.sort((a, b) => a.skandh !== b.skandh ? a.skandh - b.skandh : a.number - b.number);
}
