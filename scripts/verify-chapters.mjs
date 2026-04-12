#!/usr/bin/env node
/**
 * Verify detected chapters against Vedabase canonical reference.
 * Runs the same chapter detection logic as the frontend and compares
 * per-canto chapter counts with vedabase-chapters.json.
 */
import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("data/bhagwatham");
const BATCH_DIR = path.resolve("artifacts/temple-tracker/public/api/bhagwatham/batch");
const VEDABASE = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "vedabase-chapters.json"), "utf-8"));

// ── Hindi nums (simplified — matches the full set in bhagwatham-utils.ts) ──
const HINDI_NUMS = {
  एक:1,दो:2,तीन:3,चार:4,पाँच:5,पांच:5,छः:6,छह:6,सात:7,आठ:8,नौ:9,दस:10,
  ग्यारह:11,बारह:12,तेरह:13,चौदह:14,पन्द्रह:15,पंद्रह:15,सोलह:16,सत्रह:17,
  अठारह:18,उन्नीस:19,बीस:20,इक्कीस:21,बाईस:22,तेईस:23,चौबीस:24,पच्चीस:25,
  छब्बीस:26,सत्ताईस:27,सताईस:27,अट्ठाईस:28,उनतीस:29,उन्तीस:29,तीस:30,
  इकतीस:31,बत्तीस:32,तैंतीस:33,चौंतीस:34,पैंतीस:35,छत्तीस:36,
  सैंतीस:37,अड़तीस:38,उनतालीस:39,चालीस:40,इकतालीस:41,बयालीस:42,तैंतालीस:43,
  चवालीस:44,पैंतालीस:45,छियालीस:46,छियालिस:46,सैंतालीस:47,अड़तालीस:48,
  उनचास:49,पचास:50,इक्यावन:51,बावन:52,तिरपन:53,चौवन:54,पचपन:55,छप्पन:56,
  सत्तावन:57,अट्ठावन:58,उनसठ:59,साठ:60,इकसठ:61,बासठ:62,तिरसठ:63,चौंसठ:64,
  पैंसठ:65,छियासठ:66,सतसठ:67,सड़सठ:67,अड़सठ:68,उनहत्तर:69,सत्तर:70,
  इकहत्तर:71,बहत्तर:72,तिहत्तर:73,चौहत्तर:74,पचहत्तर:75,छिहत्तर:76,सतहत्तर:77,
  अठहत्तर:78,उन्यासी:79,उनासी:79,अस्सी:80,इक्यासी:81,बयासी:82,तिरासी:83,
  चौरासी:84,पिचासी:85,पचासी:85,छियासी:86,सत्तासी:87,अट्ठासी:88,नवासी:89,नब्बे:90,
  // OCR variants
  तेइस:23,छियलीस:46,पचीस:25,सत्ताइस:27,
};

const OCR_FIXES = {
  "Chapter 278 अध्याय": 8, "Chapter it": 9, "(शुषा दो": 2, "Chapter 3:": 6,
  "(नौ": 9, "Chapter 36": 8, "Chapter छ:": 6, "छल्नीस": 26, "अदुईस": 28,
  "Chapter इक्तीस": 21,
};

const CHAPTER_RE = /^(?:Chapter\s+\S+|अध्याय\s+(?:[\u0900-\u097F]+(?:\s+[\u0900-\u097F]+){0,2}|\d+))\s*$/iu;

const SKANDH_RANGES = [
  { s: 1, p: 1 }, { s: 2, p: 874 }, { s: 3, p: 1399 }, { s: 4, p: 2617 },
  { s: 5, p: 3900 }, { s: 6, p: 4540 }, { s: 7, p: 5204 }, { s: 8, p: 5849 },
  { s: 9, p: 6373 }, { s: 10, p: 7080 }, { s: 11, p: 9059 }, { s: 12, p: 9500 },
];

function getSkandh(pageNum) {
  for (let i = SKANDH_RANGES.length - 1; i >= 0; i--) {
    if (pageNum >= SKANDH_RANGES[i].p) return SKANDH_RANGES[i].s;
  }
  return 1;
}

function extractChapterNum(line) {
  for (const [key, num] of Object.entries(OCR_FIXES)) {
    if (line.includes(key)) return num;
  }
  const after = line.replace(/^(?:अध्याय|Chapter)\s*/iu, "").trim();
  if (after && HINDI_NUMS[after] !== undefined) return HINDI_NUMS[after];
  for (const [w, n] of Object.entries(HINDI_NUMS)) {
    if (line.includes(w)) return n;
  }
  const m = line.match(/\d+/);
  if (m) { const n = parseInt(m[0]); if (n > 0 && n <= 500) return n; }
  return 0;
}

function isChapterHeading(t) {
  const cleaned = t.replace(/^\d+\s+/, "");
  if (cleaned.length > 60) return false;
  if (t.includes("पूर्ण हुए") || t.includes("पूर्ण हुआ")) return false;
  if (CHAPTER_RE.test(cleaned)) return true;
  for (const key of Object.keys(OCR_FIXES)) {
    if (cleaned.includes(key) || t.includes(key)) return true;
  }
  return false;
}

// ── Load all batch data ──
console.log("Loading batch data...");
const batchFiles = fs.readdirSync(BATCH_DIR).filter(f => !f.startsWith(".")).sort((a, b) => parseInt(a) - parseInt(b));
const allPages = [];
for (const f of batchFiles) {
  const batch = JSON.parse(fs.readFileSync(path.join(BATCH_DIR, f), "utf-8"));
  if (batch.pages) allPages.push(...batch.pages);
}
console.log(`Loaded ${allPages.length} pages from ${batchFiles.length} batches\n`);

// ── Build chapter index ──
const chapters = [];
const lastChapterPerSkandh = new Map();

for (const page of allPages) {
  if (!page.text || page.text.length < 20) continue;
  const skandh = getSkandh(page.pageNumber);
  const lines = page.text.split("\n");
  const headingCount = lines.filter(l => isChapterHeading(l.trim())).length;
  if (headingCount >= 2) continue;

  for (const line of lines) {
    const t = line.trim();
    if (!isChapterHeading(t)) continue;
    const num = extractChapterNum(t);
    if (num <= 0) continue;

    const lastNum = lastChapterPerSkandh.get(skandh) ?? 0;
    if (num < lastNum && lastNum > 2) continue;
    if (chapters.find(c => c.number === num && c.skandh === skandh)) continue;

    lastChapterPerSkandh.set(skandh, num);
    chapters.push({ number: num, skandh, title: t.substring(0, 60), pageNumber: page.pageNumber });
  }
}

chapters.sort((a, b) => a.skandh !== b.skandh ? a.skandh - b.skandh : a.number - b.number);

// ── Compare with Vedabase ──
console.log("═══════════════════════════════════════════════════════════════");
console.log("  CHAPTER VERIFICATION: Detected vs Vedabase");
console.log("═══════════════════════════════════════════════════════════════\n");

let totalDetected = 0;
let totalExpected = 0;
let totalMissing = 0;

for (const canto of VEDABASE.cantos) {
  const detected = chapters.filter(c => c.skandh === canto.number);
  const expected = canto.chapters;
  totalDetected += detected.length;
  totalExpected += expected.length;

  const detectedNums = new Set(detected.map(c => c.number));
  const missingNums = expected.filter(ch => !detectedNums.has(ch.number));
  const extraNums = detected.filter(c => !expected.find(e => e.number === c.number));
  totalMissing += missingNums.length;

  const status = missingNums.length === 0 ? "✅" : missingNums.length <= 3 ? "🟡" : "🔴";

  console.log(`${status} Canto ${canto.number} — ${canto.title}`);
  console.log(`   Expected: ${expected.length} | Detected: ${detected.length} | Missing: ${missingNums.length}`);

  if (missingNums.length > 0) {
    console.log(`   Missing chapters: ${missingNums.map(c => `${c.number} (${c.title.substring(0, 40)})`).join(", ")}`);
  }
  if (extraNums.length > 0) {
    console.log(`   ⚠️  Extra/spurious: ${extraNums.map(c => `ch ${c.number} @ p${c.pageNumber}`).join(", ")}`);
  }
  console.log();
}

console.log("═══════════════════════════════════════════════════════════════");
console.log(`  TOTAL: ${totalDetected}/${totalExpected} chapters detected (${totalMissing} missing)`);
console.log(`  Coverage: ${((totalDetected / totalExpected) * 100).toFixed(1)}%`);
console.log("═══════════════════════════════════════════════════════════════");
