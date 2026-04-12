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

// 5. /api/bhagwatham/content?page=1&limit=100 — all content as single file
// The frontend always fetches page=1&limit=100, so serve everything
const contentResponse = {
  batches: allBatches,
  pagination: {
    page: 1,
    limit: 100,
    totalBatches: allBatches.length,
    totalPages: 1,
    hasMore: false,
  },
};
fs.writeFileSync(path.join(OUT_DIR, "content"), JSON.stringify(contentResponse));
console.log(`✓ content (${allBatches.length} batches, ${allBatches.reduce((s, b) => s + b.pages.length, 0)} pages)`);

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
