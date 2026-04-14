/**
 * Generates static JSON files that mirror the /api/bhagwatham/* endpoints.
 * Run during Vite build so Vercel can serve them as static assets.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "..", "..", "data", "bhagwatham");
const OUT_DIR = path.resolve(__dirname, "..", "public", "api", "bhagwatham");

// Ensure output directories exist
fs.mkdirSync(path.join(OUT_DIR, "images"), { recursive: true });
fs.mkdirSync(path.join(OUT_DIR, "faces"), { recursive: true });

// 1. progress.json → /api/bhagwatham/progress
const progress = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "progress.json"), "utf-8"));
fs.writeFileSync(path.join(OUT_DIR, "progress"), JSON.stringify(progress));
console.log("✓ progress");

// 2. Read all batch files
const PAGES_DIR = path.join(DATA_DIR, "pages");
const batchFiles = fs.readdirSync(PAGES_DIR)
  .filter(f => f.startsWith("batch-") && f.endsWith(".json"))
  .sort();

const allBatches = batchFiles.map(f =>
  JSON.parse(fs.readFileSync(path.join(PAGES_DIR, f), "utf-8"))
);

// 3. /api/bhagwatham/batches — metadata only
const batchesMeta = allBatches.map(b => ({
  batchNumber: b.batchNumber,
  startPage: b.startPage,
  endPage: b.endPage,
  processedAt: b.processedAt,
  pageCount: b.pages.length,
}));
fs.writeFileSync(path.join(OUT_DIR, "batches"), JSON.stringify(batchesMeta));
console.log(`✓ batches (${batchesMeta.length})`);

// 4. /api/bhagwatham/batch/:number — individual batch files
const batchDir = path.join(OUT_DIR, "batch");
fs.mkdirSync(batchDir, { recursive: true });
for (const batch of allBatches) {
  fs.writeFileSync(path.join(batchDir, String(batch.batchNumber)), JSON.stringify(batch));
}
console.log(`✓ batch files`);

// 5. /api/bhagwatham/content — kept for backwards compatibility but frontend prefers lazy loading
const contentResponse = {
  batches: allBatches,
  pagination: { page: 1, limit: 100, totalBatches: allBatches.length, totalPages: 1, hasMore: false },
};
fs.writeFileSync(path.join(OUT_DIR, "content"), JSON.stringify(contentResponse));
console.log(`✓ content (${allBatches.length} batches — frontend uses chapter-index + lazy batch loading when available)`);

// 5b. /api/bhagwatham/chapter-index — lightweight chapter index for sidebar (~10KB)
// Pre-compute chapter index from all pages so frontend doesn't need full text
const SKANDH_RANGES = [
  { s: 1, p: 1 }, { s: 2, p: 874 }, { s: 3, p: 1399 }, { s: 4, p: 2617 },
  { s: 5, p: 3900 }, { s: 6, p: 4540 }, { s: 7, p: 5204 }, { s: 8, p: 5849 },
  { s: 9, p: 6373 }, { s: 10, p: 7080 }, { s: 11, p: 9059 }, { s: 12, p: 9500 },
];
const CHAPTER_RE = /^(?:\d+\s+)?(?:Chapter\s+\S+|अध्याय\s+(?:[\u0900-\u097F]+(?:\s+[\u0900-\u097F]+){0,2}|\d+))\s*$/iu;
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
  तेइस:23,छियलीस:46,पचीस:25,सत्ताइस:27,
};
const OCR_FIXES = {
  "Chapter 278 अध्याय": 8, "Chapter it": 9, "(शुषा दो": 2, "Chapter 3:": 6,
  "(नौ": 9, "Chapter 36": 8, "Chapter छ:": 6, "छल्नीस": 26, "अदुईस": 28,
  "Chapter इक्तीस": 21,
};
function getSkandh(pn) { for (let i = SKANDH_RANGES.length - 1; i >= 0; i--) if (pn >= SKANDH_RANGES[i].p) return SKANDH_RANGES[i].s; return 1; }
function extractNum(line) {
  for (const [k,v] of Object.entries(OCR_FIXES)) if (line.includes(k)) return v;
  const after = line.replace(/^(?:अध्याय|Chapter)\s*/iu, "").trim();
  if (after && HINDI_NUMS[after] !== undefined) return HINDI_NUMS[after];
  for (const [w,n] of Object.entries(HINDI_NUMS)) if (line.includes(w)) return n;
  const m = line.match(/\d+/); if (m) { const n = parseInt(m[0]); if (n > 0 && n <= 500) return n; }
  return 0;
}
function isHeading(t) {
  const c = t.replace(/^\d+\s+/, "");
  if (c.length > 60 || t.includes("पूर्ण हुए") || t.includes("पूर्ण हुआ")) return false;
  if (CHAPTER_RE.test(c)) return true;
  for (const k of Object.keys(OCR_FIXES)) if (c.includes(k) || t.includes(k)) return true;
  return false;
}

const chapterEntries = [];
const lastPerSkandh = new Map();
const EXPECTED = [19,10,33,31,26,19,15,24,24,90,31,13];

for (const batch of allBatches) {
  for (const page of batch.pages) {
    if (!page.text || page.text.length < 20) continue;
    const skandh = getSkandh(page.pageNumber);
    const lines = page.text.split("\n");
    const hc = lines.filter(l => isHeading(l.trim())).length;
    if (hc >= 2) continue;
    for (let li = 0; li < lines.length; li++) {
      const t = lines[li].trim();
      if (!isHeading(t)) continue;
      const num = extractNum(t);
      if (num <= 0) continue;
      const last = lastPerSkandh.get(skandh) ?? 0;
      if (num < last && last > 2) continue;
      if (chapterEntries.find(c => c.number === num && c.skandh === skandh)) continue;
      lastPerSkandh.set(skandh, num);
      // Grab next 2 non-empty lines as Hindi subtitle (matches bhagwatham-utils.ts)
      const subtitleLines = lines.slice(li + 1, li + 3).map(l => l.trim()).filter(l => l && !isHeading(l));
      const subtitle = subtitleLines.join(" ");
      // Apply OCR fixes for title display (e.g., "Chapter 278 अध्याय" → "अध्याय आठ")
      let hindiTitle = t;
      const OCR_TITLE_FIXES = {
        "Chapter 278 अध्याय": "अध्याय आठ", "Chapter it": "अध्याय नौ",
        "(शुषा दो": "अध्याय दो", "Chapter 3:": "अध्याय छह",
        "(नौ": "अध्याय नौ", "Chapter 36": "अध्याय आठ",
        "Chapter छ:": "अध्याय छह", "Chapter इक्तीस": "अध्याय इक्कीस",
      };
      for (const [k, v] of Object.entries(OCR_TITLE_FIXES)) {
        if (hindiTitle.includes(k)) { hindiTitle = v; break; }
      }
      hindiTitle = hindiTitle.replace(/^Chapter\s*/i, "अध्याय ");
      const fullTitle = hindiTitle + (subtitle ? ` — ${subtitle}` : "");
      const batchNum = batch.batchNumber;
      chapterEntries.push({ number: num, skandh, title: fullTitle.substring(0, 120), pageNumber: page.pageNumber, batchNumber: batchNum });
    }
  }
}
chapterEntries.sort((a, b) => a.skandh !== b.skandh ? a.skandh - b.skandh : a.number - b.number);
chapterEntries.forEach(ch => {
  let offset = 0;
  for (let i = 0; i < ch.skandh - 1; i++) offset += EXPECTED[i];
  ch.globalNumber = offset + ch.number;
});

// Also store total page count per batch for pagination
const batchPageMap = {};
for (const b of allBatches) batchPageMap[b.batchNumber] = b.pages.length;

const chapterIndex = {
  chapters: chapterEntries,
  totalPages: allBatches.reduce((s, b) => s + b.pages.length, 0),
  totalBatches: allBatches.length,
  batchPageCounts: batchPageMap,
};
fs.writeFileSync(path.join(OUT_DIR, "chapter-index"), JSON.stringify(chapterIndex));
console.log(`✓ chapter-index (${chapterEntries.length} chapters, ${JSON.stringify(chapterIndex).length} bytes)`);

// 6. /api/bhagwatham/image-manifest
const manifestPath = path.join(DATA_DIR, "images", "manifest.json");
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  fs.writeFileSync(path.join(OUT_DIR, "image-manifest"), JSON.stringify(manifest));
  console.log(`✓ image-manifest (${manifest.images?.length || 0} images)`);

  // Copy actual image files
  const imagesDir = path.join(DATA_DIR, "images");
  const imageFiles = fs.readdirSync(imagesDir).filter(f => f.endsWith(".jpg") || f.endsWith(".png"));
  for (const img of imageFiles) {
    fs.copyFileSync(path.join(imagesDir, img), path.join(OUT_DIR, "images", img));
  }
  console.log(`✓ copied ${imageFiles.length} image files`);
}

// 7. Copy face bank images
const facesDir = path.join(DATA_DIR, "faces");
if (fs.existsSync(facesDir)) {
  const faceFiles = fs.readdirSync(facesDir).filter(f => f.endsWith(".jpg") || f.endsWith(".png") || f.endsWith(".json"));
  for (const face of faceFiles) {
    fs.copyFileSync(path.join(facesDir, face), path.join(OUT_DIR, "faces", face));
  }
  console.log(`✓ copied ${faceFiles.length} face files`);
}

// 8. /api/bhagwatham/persona/gallery — character personas with face images
const PERSONA_SHORT = {
  krishna_adult: "Lord Krishna: deep blue-skinned young man, peacock feather in curly black hair, golden crown, yellow silk dhoti, Kaustubha gem necklace",
  krishna_child: "Baby Krishna: chubby blue-tinted infant, tiny peacock feather, gold anklets, playful smile",
  narada: "Sage Narada: clean-shaven male sage, white U-shaped tilak on forehead, grey-streaked topknot, white dhoti, carrying tanpura veena",
  vyasa: "Sage Vyasa: majestic dark-skinned elderly rishi, long silver-white beard, matted grey dreadlocks, bark-cloth garment, rudraksha mala",
  suta_goswami: "Suta Goswami: elderly fair sage, short white beard, bald crown, saffron silk robes, rudraksha mala",
  shukadeva: "Shukadeva Goswami: radiant young bald sage aged 16, luminous fair skin, large innocent eyes, simple white cloth, no ornaments",
  arjuna: "Arjuna: tall muscular warrior prince, dark hair in tight topknot, golden armor, carrying Gandiva bow",
  vishnu: "Lord Vishnu: royal blue-skinned divine being, four arms holding conch discus mace lotus, tall golden crown, yellow silk",
  brahma: "Lord Brahma: four-faced creator god, white beard, red-golden robes, holding Vedas and water pot",
  prahlada: "Prahlada: young boy aged 6-7, warm brown skin, innocent devotional eyes, simple white kurta, tulsi mala",
  narasimha: "Lord Narasimha: fierce half-lion half-man, golden lion mane, blue-skinned muscular torso, blazing golden eyes, sharp fangs",
  parikshit: "King Parikshit: dignified middle-aged king, short dark beard, white renunciation cloth, sitting cross-legged",
  yashoda: "Mother Yashoda: beautiful middle-aged woman, loving face, dark hair with red sindoor, maroon silk sari with gold border",
  kunti: "Queen Kunti: dignified elderly woman, greying hair in bun, white and gold silk sari, sorrowful gentle eyes",
  draupadi: "Draupadi: strikingly beautiful young woman, dark olive-brown complexion, long wavy black hair with jasmine, red and gold silk sari",
  gandhari: "Queen Gandhari: elderly woman with white silk blindfold over eyes, white silk sari, greying hair under pallu",
  dhritarashtra: "King Dhritarashtra: very old blind king, closed sunken eyes, long thin white beard, white royal garments, walking staff",
  vidura: "Vidura: wise middle-aged man, dark brown complexion, short grey beard, saffron dhoti, pilgrim's walking staff",
  bhishma: "Bhishma: majestic elderly warrior, silver-white hair and thick beard, white warrior garments, lying on bed of arrows",
  yudhishthira: "King Yudhishthira: fair-complexioned noble king, gentle features, thin dark beard, white royal garments, simple golden crown",
  radha: "Srimati Radharani: golden-complexioned goddess, large doe eyes, blue silk sari with gold, jasmine flowers in long braid",
  balarama: "Lord Balarama: fair muscular young man, blue garments, single earring, carrying plough and mace",
  devaki: "Mother Devaki: beautiful noble woman, gentle maternal face, green and gold sari, folded hands",
  vasudeva: "King Vasudeva: noble strong man, thick dark beard, royal garments, gold armlets, Yadava prince",
  kamsa: "King Kamsa: fearsome tyrant, dark complexion, cruel eyes, black and red royal garments, golden crown",
  uddhava: "Uddhava: devoted young man, fair, clean-shaven, yellow silk dhoti, carrying lotus, Vaishnava tilak",
  rukmini: "Queen Rukmini: beautiful golden-fair queen, large eyes with kajal, red and gold silk sari, heavy bridal jewelry",
  nanda: "Nanda Maharaja: jovial elderly cowherd, round face, grey beard, white dhoti, turban, sturdy farmer build",
  shiva: "Lord Shiva: ascetic with matted jata dreadlocks, third eye, crescent moon, ash-smeared, tiger skin, trident",
  duryodhana: "Prince Duryodhana: arrogant warrior king, broad face, dark beard, red and gold royal garments, carrying mace",
};

const PERSONA_FULL = {
  krishna_adult: "Lord Krishna: a handsome young man aged 20-25 with luminous deep blue skin, oval face, high cheekbones, large almond-shaped dark brown eyes, curly jet-black shoulder-length hair adorned with a peacock feather tucked into a golden mukut crown, wearing yellow silk pitambara dhoti, Kaustubha gem pendant, golden armlets and bracelets, fresh tulsi and rose garland",
  krishna_child: "Baby Krishna: an adorable divine infant aged 1-2 with soft round chubby blue-tinted cheeks, perfectly round face, large sparkling doe-like dark brown eyes, tiny upturned button nose, curly black wispy hair with a small peacock feather, wearing miniature golden crown, tiny gold anklets and waistband",
  narada: "Sage Narada: a male sage aged 45-50 with rectangular face, strong square jawline, light brown wheat-toned skin, completely clean-shaven, warm radiant smile, vertical white U-shaped Vaishnava tilak mark on forehead, grey-streaked dark hair in high topknot bun, wearing simple white cotton dhoti, carrying his signature wooden tanpura veena",
  vyasa: "Sage Vyasa (Vedavyasa): a majestic elderly rishi aged 70-80 with broad square face, very dark brown complexion, long flowing silver-white beard reaching mid-chest, deep-set wise penetrating eyes, matted grey-white jata dreadlocks, wearing rough bark-cloth garment and deerskin, large rudraksha mala",
  suta_goswami: "Suta Goswami: an elderly sage aged 65-70 with round soft face, fair pinkish-white complexion, neatly trimmed short white beard, calm serene eyes, prominent vertical white tilak, bald shiny crown with white hair on sides, wearing saffron silk robes, rudraksha mala",
  shukadeva: "Shukadeva Goswami: a very young sage aged 16-17 with oval delicate face, radiant golden-fair luminous complexion, completely clean-shaven bald head, very large luminous innocent wide-open dark brown eyes, slight knowing half-smile, slender youthful build, wearing only simple undyed white cotton cloth, no ornaments",
  arjuna: "Arjuna: a tall muscular warrior prince aged 30-35 with chiseled diamond-shaped face, fair wheatish complexion, sharp handsome angular features, determined focused dark brown eyes, neatly tied long black hair in warrior topknot with golden diadem, wearing gleaming golden chest armor and silver arm-guards, carrying the Gandiva bow",
  vishnu: "Lord Vishnu: a supreme divine being aged 25-30 with perfectly symmetrical oval face, deep royal blue skin, serene majestic face with golden irises, wearing magnificent tall golden crown, yellow silk garments, four arms holding conch Panchajanya, discus Sudarshana, mace Kaumodaki, and lotus",
  brahma: "Lord Brahma: the creator god with four faces, aged around 60, reddish-golden complexion, long white flowing beard on each face, wise contemplative half-closed eyes, wearing red-golden silk robes, tall golden crown on each head, four arms holding Vedas, water pot kamandalu, crystal prayer beads, and white lotus",
  prahlada: "Prahlada: a young boy aged 6-7 with soft round childish face, warm brown skin, innocent round face with chubby cheeks, very large devotional eyes full of faith and wonder, short black hair, wearing simple white prince kurta with thin gold necklace, tulsi mala around neck",
  narasimha: "Lord Narasimha: a fierce half-lion half-man divine form with massive golden-brown flowing lion mane, powerful muscular blue-skinned human torso, fearsome lion face with blazing golden-yellow fiery eyes, sharp white fangs, wearing golden ornaments and yellow silk garment, divine golden effulgence radiating outward",
  parikshit: "King Parikshit: a dignified middle-aged king aged 50-55 with rectangular noble face, fair complexion, well-groomed short dark brown beard, serious contemplative deep-set dark eyes, high forehead with vertical sandalwood tilak, greying dark hair tied back, wearing simple white cotton cloth having renounced his kingdom, sitting cross-legged",
  yashoda: "Mother Yashoda: a beautiful middle-aged woman aged 35-40 with round full face, warm fair complexion, loving maternal soft features, large expressive almond eyes with kajal, rounded nose with gold nose stud, dark black hair with red sindoor tied in low bun, wearing rich maroon silk sari with gold zari border, gold bangles and jhumka earrings",
  kunti: "Queen Kunti: a dignified elderly woman aged 60-65 with oval thin face, gentle sorrowful eyes with fine wrinkles, thin greying dark hair in tight bun covered with white silk pallu, wearing white and gold silk sari, small gold earrings and thin gold bangles, vermillion tilak",
  draupadi: "Draupadi: a strikingly beautiful young woman aged 25-28 with heart-shaped face, dark olive-brown complexion, large fierce expressive almond eyes with thick kajal, proud noble bearing, long thick dark wavy hair adorned with jasmine flowers, wearing rich red and gold silk sari with heavy gold zari, gold choker necklace with ruby, large gold jhumka earrings",
  gandhari: "Queen Gandhari: a dignified elderly woman aged 65-70 with thin oval face, fair pale complexion, a wide white silk blindfold covering her eyes as lifelong vow, serene composed expression, greying white hair fully covered with white silk pallu, wearing simple white silk sari with thin gold border",
  dhritarashtra: "King Dhritarashtra: a very old blind king aged 80+ with long narrow gaunt face, pale sallow complexion, permanently closed sunken sightless eyes, long thin white beard reaching mid-chest, deeply wrinkled face, tall but stooped bearing, wearing simple white royal garments, gripping wooden walking staff",
  vidura: "Vidura: a wise middle-aged man aged 55-60 with angular lean face, dark brown complexion, calm penetrating sharp dark brown eyes, neatly trimmed short grey beard, dignified humble bearing, wearing simple saffron dhoti and white uttariya cloth over left shoulder, carrying wooden pilgrim's walking staff",
  bhishma: "Bhishma: a majestic elderly warrior aged 75-80 with broad strong square face, fair complexion, silver-white long hair and thick white beard reaching chest, powerful broad-shouldered build, wise serene half-open eyes with acceptance, wearing white warrior garments, lying on bed of arrows",
  yudhishthira: "King Yudhishthira: a fair-complexioned noble king aged 35-40 with oval gentle face, calm gentle soft features, kind thoughtful eyes with a hint of sadness, thin neatly groomed dark beard, wearing white royal garments with minimal thin gold chain, simple golden band crown",
  radha: "Srimati Radharani: the supreme goddess aged 16-18 with perfectly golden luminous complexion, extraordinarily beautiful lotus face, large doe-like dark brown eyes with divine love, delicate arched eyebrows, lustrous long black hair in elaborate braid adorned with jasmine and gold ornaments, wearing radiant blue silk sari with gold embroidery",
  balarama: "Lord Balarama: a powerful muscular young man aged 25-28 with fair white complexion, broad strong face, intense large dark brown eyes, wearing blue garments, single gold earring, carrying a plough weapon on shoulder and mace, golden armlets on powerful arms",
  devaki: "Mother Devaki: a beautiful noble woman aged 30-35 with fair radiant complexion, gentle maternal face with large expressive dark eyes filled with love and sorrow, wearing modest silk sari in green and gold, minimal gold jewelry, hair covered with pallu",
  vasudeva: "King Vasudeva: a noble dignified man aged 40-45 with broad strong face, medium-dark complexion, thick dark beard and mustache, determined courageous eyes, wearing royal but simple garments, gold armlets and earrings, tall strong build",
  kamsa: "King Kamsa: a fearsome tyrant aged 35-40 with harsh angular face, dark complexion, cruel narrow dark eyes with heavy brows, thick black beard, large hooked nose, muscular imposing build, wearing royal black and red garments with heavy gold ornaments",
  uddhava: "Uddhava: a devoted young man aged 25-30 with gentle refined face, fair complexion, soft thoughtful dark brown eyes filled with devotion, clean-shaven smooth face, neat dark hair, wearing yellow silk dhoti, carrying lotus flower, Vaishnava tilak",
  rukmini: "Queen Rukmini: a stunningly beautiful young queen aged 20-22 with golden-fair complexion, perfectly symmetrical lotus face, large luminous dark brown eyes with kajal, wearing rich silk sari in red and gold with heavy bridal jewelry, gold necklace, jhumka earrings",
  nanda: "Nanda Maharaja: a prosperous elderly cowherd chief aged 55-60 with round jolly face, warm tanned complexion, kind smiling dark eyes with laugh lines, short grey beard, wearing simple white dhoti and uttariya, rudraksha mala, turban on head",
  shiva: "Lord Shiva: an ascetic divine being with matted grey-brown jata dreadlocks piled high, third eye on forehead, crescent moon in hair, fair ashen complexion smeared with sacred ash, half-closed meditative eyes, blue throat, wearing tiger skin, serpent Vasuki around neck, sitting in meditation with trident beside him",
  duryodhana: "Prince Duryodhana: a powerful arrogant young king aged 30-35 with broad aggressive face, fair complexion, angry intense dark eyes, strong square jaw, dark beard, wearing rich royal red and gold garments with heavy gold ornaments, golden crown, carrying a mace",
};

{
  const personaDir = path.join(OUT_DIR, "persona");
  fs.mkdirSync(personaDir, { recursive: true });

  let faceManifest = [];
  const faceManifestPath = path.join(DATA_DIR, "faces", "face-manifest.json");
  if (fs.existsSync(faceManifestPath)) {
    faceManifest = JSON.parse(fs.readFileSync(faceManifestPath, "utf-8"));
  }

  const gallery = Object.entries(PERSONA_SHORT).map(([key, shortDesc]) => {
    const name = shortDesc.split(":")[0]?.trim() || key.replace(/_/g, " ");
    const face = faceManifest.find(f => f.characterName === key);
    return {
      key,
      name,
      shortDescription: shortDesc.split(":").slice(1).join(":").trim(),
      fullDescription: PERSONA_FULL[key] || shortDesc,
      faceImage: face ? face.imagePath : null,
    };
  });

  fs.writeFileSync(path.join(personaDir, "gallery"), JSON.stringify(gallery));
  console.log(`✓ persona/gallery (${gallery.length} characters)`);
}

// 9. /api/bhagwatham/instagram/manifest — instagram image manifest
const igManifestSrc = path.join(DATA_DIR, "instagram", "ig-manifest.json");
if (fs.existsSync(igManifestSrc)) {
  const igDir = path.join(OUT_DIR, "instagram");
  fs.mkdirSync(igDir, { recursive: true });
  fs.copyFileSync(igManifestSrc, path.join(igDir, "manifest"));
  const igData = JSON.parse(fs.readFileSync(igManifestSrc, "utf-8"));
  const imgCount = igData.images?.length || 0;
  console.log(`✓ instagram/manifest (${imgCount} images)`);
}

console.log("\n✅ Static API files generated successfully");
