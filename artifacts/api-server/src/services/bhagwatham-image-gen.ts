import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger";
import Anthropic from "@anthropic-ai/sdk";
import { reportAIFailure } from "./ai-credit-monitor";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "..", "..", "..", "..", "data", "bhagwatham");
const IMAGES_DIR = path.join(DATA_DIR, "images");
const MANIFEST_FILE = path.join(IMAGES_DIR, "manifest.json");
const TRASH_DIR = path.join(IMAGES_DIR, ".trash");
const TRASH_META_FILE = path.join(TRASH_DIR, "trash-meta.json");

// ── Trash / Undo support ────────────────────────────────────────────────────

interface TrashEntry {
  trashId: string;
  originalFile: string;        // filename in images dir
  trashedFile: string;         // filename in trash dir
  manifestEntry: ChapterImage; // full manifest metadata for restore
  trashedAt: string;
  operation: "delete" | "regenerate";
}

function ensureTrashDir() {
  if (!fs.existsSync(TRASH_DIR)) fs.mkdirSync(TRASH_DIR, { recursive: true });
}

function readTrashMeta(): TrashEntry[] {
  if (!fs.existsSync(TRASH_META_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(TRASH_META_FILE, "utf-8")); }
  catch { return []; }
}

function writeTrashMeta(entries: TrashEntry[]) {
  ensureTrashDir();
  fs.writeFileSync(TRASH_META_FILE, JSON.stringify(entries, null, 2) + "\n");
}

/** Move an image file to trash and record metadata for undo */
function trashImage(img: ChapterImage, operation: "delete" | "regenerate"): string {
  ensureTrashDir();
  const trashId = `${img.chapterNumber}-${img.sceneIndex ?? 0}-${Date.now()}`;
  const srcPath = path.join(IMAGES_DIR, img.imagePath);
  const ext = path.extname(img.imagePath);
  const trashedFile = `${trashId}${ext}`;
  const destPath = path.join(TRASH_DIR, trashedFile);

  if (fs.existsSync(srcPath)) {
    fs.renameSync(srcPath, destPath);
  }

  const entries = readTrashMeta();
  entries.push({
    trashId,
    originalFile: img.imagePath,
    trashedFile,
    manifestEntry: { ...img },
    trashedAt: new Date().toISOString(),
    operation,
  });
  // Keep only last 50 trash entries to avoid unbounded growth
  while (entries.length > 50) {
    const old = entries.shift()!;
    const oldPath = path.join(TRASH_DIR, old.trashedFile);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  writeTrashMeta(entries);
  logger.info({ trashId, file: img.imagePath, operation }, "Image moved to trash");
  return trashId;
}

/** Restore an image from trash back to images dir and manifest */
export function restoreImage(trashId: string): { success: boolean; restored?: ChapterImage } {
  const entries = readTrashMeta();
  const idx = entries.findIndex(e => e.trashId === trashId);
  if (idx === -1) return { success: false };

  const entry = entries[idx];
  const trashedPath = path.join(TRASH_DIR, entry.trashedFile);
  const restorePath = path.join(IMAGES_DIR, entry.originalFile);

  // Move file back
  if (fs.existsSync(trashedPath)) {
    // If a new image was generated at the same path, remove it first
    if (fs.existsSync(restorePath)) fs.unlinkSync(restorePath);
    fs.renameSync(trashedPath, restorePath);
  } else {
    return { success: false };
  }

  // Restore manifest entry — remove any current entry for same chapter+scene, then add back the old one
  const manifest = readManifest();
  const chNum = entry.manifestEntry.chapterNumber;
  const scIdx = entry.manifestEntry.sceneIndex ?? 0;
  manifest.images = manifest.images.filter(
    i => !(i.chapterNumber === chNum && (i.sceneIndex ?? 0) === scIdx)
  );
  manifest.images.push(entry.manifestEntry);
  manifest.lastUpdated = new Date().toISOString();
  writeManifest(manifest);

  // Remove from trash meta
  entries.splice(idx, 1);
  writeTrashMeta(entries);

  logger.info({ trashId, file: entry.originalFile }, "Image restored from trash");
  return { success: true, restored: entry.manifestEntry };
}

// ── Art style suffix — appended to every prompt ──────────────────────────────
const ART_STYLE = [
  "classical Indian devotional oil painting style",
  "traditional hand-painted look with visible soft brushstrokes and painterly texture",
  "NOT photo-realistic NOT photographic NOT 3D render — must look like a fine art painting",
  "rich warm golden and earthy color palette with deep saffron ochre amber and forest green tones",
  "soft diffused warm lighting with a dreamy golden glow throughout the scene like early morning or late afternoon",
  "lush detailed natural backgrounds with ancient trees flowers and foliage painted in a classical romantic landscape style",
  "traditional Indian Vedic clothing in saffron or warm colors with fine painted fabric texture ornate gold borders rudraksha malas and traditional jewelry",
  "ancient setting with manuscripts scrolls palm-leaf books clay or brass vessels thatched huts wooden furniture — no modern elements whatsoever",
  "characters have gentle idealized painted faces with warm skin tones soft expressive eyes and serene devotional expressions",
  "wide scene composition showing the full environment and setting — NOT a portrait or close-up of a face looking at the camera",
  "characters should be engaged in the story action within the scene — interacting with each other or the environment — never posing for or looking directly at the viewer",
  "camera angle: wide or medium-wide establishing shot showing landscape architecture or nature as a significant part of the frame",
  "balanced harmonious composition with main characters clearly in focus and background softly blended in painterly depth",
  "overall mood: peaceful devotional serene and sacred — like a classical Indian temple painting or calendar art brought to life as a fine oil painting",
  "4K resolution highly detailed brushwork rich color depth warm atmospheric perspective",
].join(", ");

// ── Character Personas — consistent appearance across all images ─────────────
// Each character has a fixed description so they look the same everywhere.
const CHARACTER_PERSONAS: Record<string, string> = {
  krishna_adult: "Lord Krishna: a handsome young man with luminous deep blue skin, large almond-shaped dark eyes with perfectly defined irises, gentle serene smile, sharp nose, curly dark black hair adorned with a single peacock feather in a golden crown, wearing yellow silk pitambara dhoti, Kaustubha gem on chest, golden armlets and bracelets, fresh tulsi and rose garland",
  krishna_child: "Baby Krishna: an adorable divine infant with soft round blue-tinted cheeks, large sparkling doe-like dark eyes with perfectly defined irises, playful mischievous smile, tiny button nose, curly black hair with a small peacock feather, wearing miniature golden crown, tiny gold anklets and waistband, pearl necklace",
  narada: "Sage Narada: a male sage, masculine face with strong jawline, light brown skin, clean-shaven face with a warm radiant smile, bright alert almond-shaped eyes, prominent white tilak mark on forehead, neatly tied grey-streaked hair in a topknot, slender athletic male build, wearing simple white cotton dhoti with golden border, bare male chest with sacred thread, carrying his signature wooden tanpura veena instrument",
  vyasa: "Sage Vyasa (Vedavyasa): a majestic elderly rishi with dark complexion, long flowing silver-white beard reaching his chest, deep wise penetrating eyes with perfectly defined irises, broad forehead with ash tilak, thick matted grey hair in jata, strong dignified bearing, wearing bark-cloth garment and deerskin, rudraksha mala",
  suta_goswami: "Suta Goswami: an elderly sage with fair complexion, neatly trimmed white beard, calm serene almond eyes with perfectly defined irises, gentle knowing smile, prominent white tilak on forehead, bald crown with white hair on sides, wearing saffron silk robes with gold border, rudraksha mala around neck",
  shukadeva: "Shukadeva Goswami: a very young sage of about sixteen years, radiant golden-fair complexion, completely clean-shaven head, large luminous innocent eyes with perfectly defined irises, slight knowing smile, slender youthful build, wearing only a simple white cotton cloth, no ornaments, barefoot, emanating a natural divine glow",
  arjuna: "Arjuna: a tall muscular warrior prince with fair wheatish complexion, sharp handsome features, determined focused eyes with perfectly defined irises, strong jaw, neatly tied dark hair in a warrior topknot with golden diadem, wearing gleaming golden armor and silver arm-guards, carrying the mighty Gandiva bow",
  vishnu: "Lord Vishnu: a supreme divine being with deep blue skin, serene majestic face with perfectly proportioned symmetrical almond eyes with clear defined irises, gentle compassionate smile, wearing magnificent golden crown studded with gems, yellow silk garments, holding conch Panchajanya, discus Sudarshana, mace Kaumodaki, and lotus",
  brahma: "Lord Brahma: the creator god with four faces visible, reddish-golden complexion, long white flowing beard on each face, wise contemplative eyes with perfectly defined irises, wearing red-golden robes, golden crown, holding Vedas, a water pot, prayer beads, and lotus, seated on a golden lotus flower",
  prahlada: "Prahlada: a young boy of about seven years with soft brown skin, innocent round face, large devotional eyes with perfectly defined irises full of faith and peace, slight gentle smile, wearing simple prince clothing with minimal gold ornaments, a small tulsi mala around his neck",
  narasimha: "Lord Narasimha: a fierce half-lion half-man divine form with golden-brown lion mane, powerful muscular blue-skinned human torso, fearsome lion face with blazing fiery eyes with perfectly defined irises, sharp fangs, wearing golden ornaments and yellow garment, divine effulgence radiating outward",
  parikshit: "King Parikshit: a dignified middle-aged king with noble bearing, fair complexion, well-groomed short dark beard, serious contemplative eyes with perfectly defined irises, wearing simple white cloth having renounced his kingdom, sitting cross-legged on the bank of the Ganges",
  yashoda: "Mother Yashoda: a beautiful middle-aged woman with warm fair complexion, loving maternal face, large expressive eyes with perfectly defined irises, gentle affectionate smile, dark hair parted in center with red sindoor, wearing a rich maroon silk sari with gold border, gold nose ring, bangles, and earrings",
  kunti: "Queen Kunti: a dignified elderly Indian woman with fair complexion, gentle sorrowful eyes with perfectly defined irises, greying dark hair in a bun covered with a white silk pallu, graceful noble bearing, wearing a white and gold silk sari befitting a dowager queen, gold earrings and bangles, vermillion tilak on forehead",
  draupadi: "Draupadi: a strikingly beautiful young Indian woman with dark complexion, large fierce expressive eyes with perfectly defined irises, proud noble bearing, long dark hair adorned with flowers, wearing a rich red and gold silk sari, gold jewelry including necklace earrings and bangles, vermillion in her hair parting",
  gandhari: "Queen Gandhari: a dignified elderly Indian woman with fair complexion, a white silk blindfold covering her eyes as a lifelong vow, serene composed face, greying hair covered with a white pallu, wearing a simple white silk sari with gold border, gold bangles",
  dhritarashtra: "King Dhritarashtra: a very old blind Indian king with closed sightless eyes, long white beard, gaunt weathered face showing years of inner conflict, tall but stooped bearing, wearing simple white royal garments, a walking staff in hand",
  vidura: "Vidura: a wise middle-aged Indian man with dark complexion, calm penetrating eyes with perfectly defined irises, neatly trimmed grey beard, dignified humble bearing, wearing simple saffron dhoti and white uttariya cloth, carrying a pilgrim's staff",
  bhishma: "Bhishma: a majestic elderly warrior with silver-white hair and long flowing white beard, powerful broad-shouldered build despite his age, wise serene eyes with perfectly defined irises, wearing white warrior garments, lying on a bed of arrows with arrows piercing his entire body",
  yudhishthira: "King Yudhishthira: a fair-complexioned noble Indian king with calm gentle features, kind thoughtful eyes with perfectly defined irises, neatly groomed dark beard, wearing white royal garments with minimal gold ornaments befitting a dharmic king, golden crown",
};

/** Look up which persona names appear in a scene prompt */
function injectPersona(scene: string): string {
  let result = scene;
  const checks: Array<[RegExp, string]> = [
    [/\bBaby\b.*\bKrishna\b/i, CHARACTER_PERSONAS.krishna_child],
    [/\b(?:child|infant|baby)\b.*\bKrishna\b/i, CHARACTER_PERSONAS.krishna_child],
    [/\bKrishna\b(?!.*\b(?:child|infant|baby)\b)/i, CHARACTER_PERSONAS.krishna_adult],
    [/\bNarada\b/i, CHARACTER_PERSONAS.narada],
    [/\bVyasa(?:deva)?\b/i, CHARACTER_PERSONAS.vyasa],
    [/\bSuta\s*Goswami\b/i, CHARACTER_PERSONAS.suta_goswami],
    [/\bShukadeva\b/i, CHARACTER_PERSONAS.shukadeva],
    [/\bArjuna\b/i, CHARACTER_PERSONAS.arjuna],
    [/\bVishnu\b/i, CHARACTER_PERSONAS.vishnu],
    [/\bBrahma\b/i, CHARACTER_PERSONAS.brahma],
    [/\bPrahlada?\b/i, CHARACTER_PERSONAS.prahlada],
    [/\bNarasimha\b|\bNrisimha\b/i, CHARACTER_PERSONAS.narasimha],
    [/\bParikshit\b/i, CHARACTER_PERSONAS.parikshit],
    [/\bYashoda\b/i, CHARACTER_PERSONAS.yashoda],
    [/\bKunti\b/i, CHARACTER_PERSONAS.kunti],
    [/\bDraupadi\b/i, CHARACTER_PERSONAS.draupadi],
    [/\bGandhari\b/i, CHARACTER_PERSONAS.gandhari],
    [/\bDhritarashtra\b/i, CHARACTER_PERSONAS.dhritarashtra],
    [/\bVidura\b/i, CHARACTER_PERSONAS.vidura],
    [/\bBhishma\b/i, CHARACTER_PERSONAS.bhishma],
    [/\bYudhishthira\b/i, CHARACTER_PERSONAS.yudhishthira],
  ];

  // Find the first matching persona and prepend it
  for (const [pattern, persona] of checks) {
    if (pattern.test(scene)) {
      // Replace the character name portion with the full persona description
      result = `${persona}. Scene: ${scene}`;
      break;
    }
  }
  return result;
}

/** Detect which persona keys appear in a scene prompt */
function detectPersonasInScene(scene: string): string[] {
  const found: string[] = [];
  const checks: Array<[RegExp, string]> = [
    [/\bBaby\b.*\bKrishna\b|\bchild\b.*\bKrishna\b|\binfant\b.*\bKrishna\b/i, "krishna_child"],
    [/\bKrishna\b/i, "krishna_adult"],
    [/\bNarada\b/i, "narada"],
    [/\bVyasa(?:deva)?\b/i, "vyasa"],
    [/\bSuta\s*Goswami\b/i, "suta_goswami"],
    [/\bShukadeva\b/i, "shukadeva"],
    [/\bArjuna\b/i, "arjuna"],
    [/\bVishnu\b/i, "vishnu"],
    [/\bBrahma\b/i, "brahma"],
    [/\bPrahlada?\b/i, "prahlada"],
    [/\bNarasimha\b|\bNrisimha\b/i, "narasimha"],
    [/\bParikshit\b/i, "parikshit"],
    [/\bYashoda\b/i, "yashoda"],
    [/\bKunti\b/i, "kunti"],
    [/\bDraupadi\b/i, "draupadi"],
    [/\bGandhari\b/i, "gandhari"],
    [/\bDhritarashtra\b/i, "dhritarashtra"],
    [/\bVidura\b/i, "vidura"],
    [/\bBhishma\b/i, "bhishma"],
    [/\bYudhishthira\b/i, "yudhishthira"],
  ];
  for (const [pattern, key] of checks) {
    if (pattern.test(scene) && !found.includes(key)) {
      found.push(key);
    }
  }
  return found;
}

// ── Persona versioning ──────────────────────────────────────────────────────
// Each persona has a version number. When a persona is enhanced with new details,
// its version is bumped. The audit cron checks if any image uses an outdated
// persona version and queues regeneration.

const PERSONA_VERSION_FILE = path.join(DATA_DIR, "persona-versions.json");

interface PersonaVersions {
  versions: Record<string, number>;  // e.g. { "krishna_adult": 2, "kunti": 1 }
  lastUpdated: string;
  enhancementLog: Array<{
    persona: string;
    version: number;
    enhancement: string;
    timestamp: string;
  }>;
}

function readPersonaVersions(): PersonaVersions {
  if (!fs.existsSync(PERSONA_VERSION_FILE)) {
    // Initialize all personas at version 1
    const versions: Record<string, number> = {};
    for (const key of Object.keys(CHARACTER_PERSONAS)) {
      versions[key] = 1;
    }
    return { versions, lastUpdated: new Date().toISOString(), enhancementLog: [] };
  }
  return JSON.parse(fs.readFileSync(PERSONA_VERSION_FILE, "utf-8"));
}

function writePersonaVersions(pv: PersonaVersions): void {
  pv.lastUpdated = new Date().toISOString();
  fs.writeFileSync(PERSONA_VERSION_FILE, JSON.stringify(pv, null, 2) + "\n");
}

/** Get the current version for a set of personas (max of their individual versions) */
function getPersonaGroupVersion(personaKeys: string[]): number {
  const pv = readPersonaVersions();
  return Math.max(...personaKeys.map((k) => pv.versions[k] || 1), 1);
}

/**
 * Enhance a persona with new information discovered during translation.
 * Bumps the version so the audit cron knows to regenerate affected images.
 */
export function enhancePersona(personaKey: string, enhancement: string): { success: boolean; newVersion: number; affectedImages: number } {
  if (!CHARACTER_PERSONAS[personaKey]) {
    return { success: false, newVersion: 0, affectedImages: 0 };
  }

  // Append new details to the persona
  CHARACTER_PERSONAS[personaKey] = `${CHARACTER_PERSONAS[personaKey]}, ${enhancement}`;

  // Bump version
  const pv = readPersonaVersions();
  const oldVersion = pv.versions[personaKey] || 1;
  const newVersion = oldVersion + 1;
  pv.versions[personaKey] = newVersion;
  pv.enhancementLog.push({
    persona: personaKey,
    version: newVersion,
    enhancement,
    timestamp: new Date().toISOString(),
  });
  writePersonaVersions(pv);

  // Count affected images in manifest
  const manifest = readManifest();
  const affected = manifest.images.filter((img) =>
    img.personasUsed?.includes(personaKey) && (img.personaVersion || 1) < newVersion
  ).length;

  logger.info({ personaKey, newVersion, affected, enhancement }, "Persona enhanced — audit will regenerate affected images");

  return { success: true, newVersion, affectedImages: affected };
}

export function getPersonaVersions(): PersonaVersions {
  return readPersonaVersions();
}

// ── Scene keywords → multiple scene prompts per theme ────────────────────────
// Each entry can produce multiple images (scenes) for a chapter.
const SCENE_KEYWORDS: Array<{ pattern: RegExp; scenes: string[] }> = [
  {
    pattern: /नैमिषारण्य|सूत.*गोस्वामी|मुनि.*जिज्ञासा/iu,
    scenes: [
      "Suta Goswami sitting on a stone seat under a large banyan tree, speaking to a small group of five or six sages seated on grass mats around a modest sacred fire, ancient Naimisharanya forest with tall trees and dappled golden sunlight filtering through leaves, wide landscape view, realistic natural setting",
      "Suta Goswami in mid-gesture while teaching, warm firelight illuminating his face, two sages in foreground listening attentively with folded hands, forest clearing at dusk, realistic proportions and natural lighting",
    ],
  },
  {
    pattern: /दिव्यता.*दिव्य\s*सेवा|व्यास\s*उवाच/iu,
    scenes: [
      "Vyasadeva sitting cross-legged on a deerskin mat inside a simple thatched forest hermitage, writing on palm-leaf manuscripts with a reed stylus, golden morning light streaming through the doorway, ink pot and stack of manuscripts beside him, realistic rustic ashram interior, wide landscape composition",
      "Vyasadeva meditating peacefully under a massive ancient banyan tree with aerial roots, a small stream flowing nearby, birds perched on branches, early morning mist in the forest, natural realistic landscape",
    ],
  },
  {
    pattern: /कृष्ण.*अवतार|समस्त\s*अवतार|अवतारों.*स्रोत/iu,
    scenes: [
      "Lord Krishna standing gracefully in a lush Vrindavan meadow playing his bamboo flute, two peacocks nearby, a gentle river flowing in the background, flowering trees, warm golden hour sunlight, wide cinematic landscape composition",
      "Lord Krishna seated under a kadamba tree in a serene forest glade, three cows resting nearby, lotus pond in foreground reflecting golden sky, Vrindavan hills in the distance, natural realistic landscape wallpaper",
    ],
  },
  {
    pattern: /नारद.*प्राकट्य|नारद|श्री\s*नारद/iu,
    scenes: [
      "Sage Narada walking along a mountain path at sunrise, playing his tanpura veena, vast panoramic Himalayan landscape stretching behind him, golden clouds and snow-capped peaks, two eagles soaring in the sky, wide cinematic landscape",
      "Sage Narada resting on a rocky outcrop above the clouds, his veena leaning beside him, gazing at a spectacular sunset over a valley of rivers and forests, birds in flight, peaceful wide landscape",
    ],
  },
  {
    pattern: /कृष्ण.*गोपी|गोपी.*कृष्ण|रास\s*लीला/iu,
    scenes: [
      "Lord Krishna and Radha dancing together in a moonlit Vrindavan clearing beside the Yamuna river, full moon reflecting on calm water, three or four gopis watching joyfully from the side, fireflies glowing, wide landscape with forest silhouette",
      "Krishna playing flute on the bank of Yamuna river at night, Radha and two gopis listening from nearby, full moon overhead, lotus flowers floating on water, serene wide landscape composition",
    ],
  },
  {
    pattern: /कृष्ण.*बंसी|बंसी.*कृष्ण|वेणु|मुरली|बाँसुरी/iu,
    scenes: [
      "Lord Krishna leaning against a flowering kadamba tree playing bamboo flute, three white cows grazing nearby, a peacock with spread feathers on the ground, rolling green Vrindavan meadows stretching to horizon, warm golden sunset, wide landscape",
      "Krishna seated on a rock by a gentle stream playing flute, two deer and a peacock listening nearby, Vrindavan forest in background with birds in flight, soft golden light, natural wide landscape wallpaper",
    ],
  },
  {
    pattern: /गोवर्धन|गिरिराज/iu,
    scenes: [
      "Young Lord Krishna lifting Govardhan hill on his little finger, a small group of villagers with two cows sheltering underneath, dramatic dark storm clouds with rain on one side and golden light on the other, wide cinematic landscape composition",
    ],
  },
  {
    pattern: /कालिय|नाग/iu,
    scenes: [
      "Lord Krishna standing triumphantly on the multi-hooded serpent Kaliya in the Yamuna river, wide river landscape with forested banks on both sides, dramatic sky, two villagers watching from the riverbank, cinematic wide composition",
    ],
  },
  {
    pattern: /माखन.*चोर|दधि|मक्खन/iu,
    scenes: [
      "Baby Krishna reaching for a clay butter pot hanging from the ceiling in a rustic village kitchen, butter on his face, Mother Yashoda approaching from the doorway with a loving smile, realistic village home interior with earthen walls, warm lamp light, wide composition",
    ],
  },
  {
    pattern: /यशोदा|माता.*कृष्ण|बाल.*कृष्ण/iu,
    scenes: [
      "Mother Yashoda cradling baby Krishna in her lap in a sunlit courtyard, blooming jasmine creeper on the wall, a brass lamp nearby, two peacocks in the garden, warm realistic domestic scene, wide landscape composition",
      "Baby Krishna crawling playfully in a sunny village courtyard, Mother Yashoda watching from the verandah doorway, a cow resting in the shade nearby, realistic rural Indian setting, warm golden light, wide composition",
    ],
  },
  {
    pattern: /अर्जुन|गीता|कुरुक्षेत्र|रथ/iu,
    scenes: [
      "Krishna and Arjuna on a golden chariot drawn by four white horses, positioned between two distant armies on the vast Kurukshetra plain, dramatic sky with rays of sunlight breaking through clouds, wide cinematic panoramic landscape",
      "Krishna speaking to Arjuna on the chariot, gesturing with one hand, Arjuna listening with bow resting at his side, the vast empty battlefield stretching to the horizon, dramatic sunset sky, wide landscape",
    ],
  },
  {
    pattern: /विष्णु|वैकुण्ठ|शेषनाग|शेष/iu,
    scenes: [
      "Lord Vishnu reclining peacefully on Shesha Naga serpent floating on a vast calm cosmic ocean, Goddess Lakshmi at his feet, a golden lotus growing from his navel reaching toward a sky filled with stars, wide panoramic cosmic landscape",
    ],
  },
  {
    pattern: /ब्रह्मा.*सृष्टि|सृष्टि|सर्ग/iu,
    scenes: [
      "Lord Brahma seated on a golden lotus flower in a vast cosmic space, galaxies and nebulae forming around him, golden light emanating outward, the lotus stem descending into an infinite ocean below, wide cosmic panoramic landscape",
    ],
  },
  {
    pattern: /प्रह्लाद|हिरण्यकशिपु|नरसिंह|नृसिंह/iu,
    scenes: [
      "Lord Narasimha emerging from a cracked palace pillar in a grand throne room, young Prahlada watching with calm folded hands from nearby, dramatic lighting with golden divine glow contrasting dark palace interior, wide cinematic composition",
      "Young boy Prahlada meditating peacefully in a dark palace chamber, a faint golden protective aura around him, single oil lamp flickering nearby, moonlight from a high window, realistic interior, wide landscape composition",
    ],
  },
  {
    pattern: /शुकदेव|परीक्षित/iu,
    scenes: [
      "Young sage Shukadeva on a simple raised seat narrating to King Parikshit, four or five sages listening nearby, on the banks of the wide Ganges river at sunset, temple spires visible in the distance, realistic wide riverside landscape",
    ],
  },
  {
    pattern: /धर्म|कलियुग|कलि/iu,
    scenes: [
      "A majestic white bull standing weakly on one leg on a barren dusty plain, a cow nearby looking sorrowful, dark storm clouds gathering on the horizon with a single ray of golden light breaking through, wide dramatic landscape",
    ],
  },
];

// ── Fallback scenes ──────────────────────────────────────────────────────────
const GENERIC_SCENES = [
  "Lord Krishna standing in a lush Vrindavan meadow playing flute, peacocks nearby, river flowing in background, golden sunset, wide cinematic landscape wallpaper",
  "A sacred Vedic fire ceremony in a forest clearing, three sages seated around a modest fire, smoke rising into golden sky through tree canopy, wide natural landscape",
  "Magnificent Vaikuntha palace with golden architecture reflected in a crystal lotus pond, ethereal clouds, two peacocks on marble balustrade, wide panoramic landscape",
  "A sage meditating alone in a Himalayan ashram, majestic snow peaks in background, waterfall cascading nearby, golden sunrise, wide mountain landscape",
  "Lord Krishna standing at the entrance of a lamp-lit temple at dusk, lotus flowers in foreground, devotional atmosphere, wide landscape composition",
  "Vrindavan forest landscape with sacred white cows grazing under blossoming trees, a peacock on a branch, lotus pond reflecting golden sky, Yamuna river winding into distance, wide wallpaper",
  "Vast cosmic scene with Lord Vishnu at center, stars and galaxies swirling around, divine golden effulgence, wide panoramic cosmic landscape",
  "Sacred Ganges flowing from celestial realms, sages performing rituals on stone ghats, temple spires silhouetted against golden sunrise",
];

// ── Manifest types ────────────────────────────────────────────────────────────

export interface ChapterImage {
  chapterNumber: number;
  chapterTitle: string;
  imagePath: string;
  prompt: string;
  descriptionHi?: string;
  personasUsed?: string[];     // e.g. ["krishna_adult", "kunti"] — tracks which personas were used
  personaVersion?: number;     // incremented when any used persona is enhanced
  generatedAt: string;
  sceneIndex?: number; // 0, 1, 2... for multiple images per chapter
}

export interface ImageManifest {
  images: ChapterImage[];
  lastUpdated: string;
}

// ── Face Bank — character face consistency ───────────────────────────────────

const FACES_DIR = path.join(DATA_DIR, "faces");
const FACE_MANIFEST = path.join(FACES_DIR, "face-manifest.json");

interface FaceEntry {
  characterName: string;
  imagePath: string;   // relative to faces dir
  generatedAt: string;
}

function readFaceManifest(): FaceEntry[] {
  if (!fs.existsSync(FACE_MANIFEST)) return [];
  return JSON.parse(fs.readFileSync(FACE_MANIFEST, "utf-8"));
}

function writeFaceManifest(entries: FaceEntry[]): void {
  if (!fs.existsSync(FACES_DIR)) fs.mkdirSync(FACES_DIR, { recursive: true });
  fs.writeFileSync(FACE_MANIFEST, JSON.stringify(entries, null, 2) + "\n");
}

/** Get public URLs of canonical face images for characters detected in the scene */
function getFaceReferenceUrls(scene: string): string[] {
  const faces = readFaceManifest();
  if (faces.length === 0) return [];

  const baseUrl = process.env.PUBLIC_URL || "http://localhost:3001/api/bhagwatham/faces";
  const urls: string[] = [];

  const charPatterns: Array<[RegExp, string]> = [
    [/\bBaby\b.*\bKrishna\b|\bchild\b.*\bKrishna\b/i, "krishna_child"],
    [/\bKrishna\b/i, "krishna_adult"],
    [/\bNarada\b/i, "narada"],
    [/\bVyasa(?:deva)?\b/i, "vyasadeva"],
    [/\bSuta\s*Goswami\b/i, "suta_goswami"],
    [/\bShukadeva\b/i, "shukadeva"],
    [/\bArjuna\b/i, "arjuna"],
    [/\bYashoda\b/i, "yashoda"],
    [/\bParikshit\b/i, "parikshit"],
    [/\bVishnu\b/i, "vishnu"],
    [/\bBrahma\b/i, "brahma"],
    [/\bPrahlad/i, "prahlada"],
    [/\bNarasimha\b|\bNrisimha\b/i, "narasimha"],
    [/\bKunti\b/i, "kunti"],
    [/\bDraupadi\b/i, "draupadi"],
    [/\bGandhari\b/i, "gandhari"],
    [/\bDhritarashtra\b/i, "dhritarashtra"],
    [/\bVidura\b/i, "vidura"],
    [/\bBhishma\b/i, "bhishma"],
    [/\bYudhishthira\b/i, "yudhishthira"],
  ];

  for (const [pattern, charName] of charPatterns) {
    if (pattern.test(scene)) {
      const face = faces.find(f => f.characterName === charName);
      if (face && fs.existsSync(path.join(FACES_DIR, face.imagePath))) {
        urls.push(`${baseUrl}/${face.imagePath}`);
      }
    }
  }
  return urls;
}

// ── Core functions ────────────────────────────────────────────────────────────

function ensureImageDir(): void {
  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

// Simple async mutex to prevent concurrent manifest corruption
let _manifestLock: Promise<void> = Promise.resolve();
function withManifestLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = _manifestLock;
  let resolve: () => void;
  _manifestLock = new Promise<void>((r) => { resolve = r; });
  return prev.then(fn).finally(() => resolve!());
}

function readManifest(): ImageManifest {
  ensureImageDir();
  if (!fs.existsSync(MANIFEST_FILE)) return { images: [], lastUpdated: new Date().toISOString() };
  return JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf-8"));
}

function writeManifest(manifest: ImageManifest): void {
  ensureImageDir();
  manifest.lastUpdated = new Date().toISOString();
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2) + "\n");
}

export function getImageManifest(): ImageManifest {
  return readManifest();
}

// ── Scene detection — returns multiple scenes ────────────────────────────────

// ── Content-aware story extraction ──────────────────────────────────────────

/**
 * Extract the chapter subject line (Hindi title beneath the "Chapter X" heading).
 * e.g. "महारानी कुन्ती द्वारा प्रार्थना तथा परीक्षित की रक्षा"
 */
function extractChapterSubject(contentSnippet: string): string {
  const lines = contentSnippet.split("\n").map((l) => l.trim()).filter(Boolean);
  // The subject line is typically the first non-empty Devanagari line before "सूत उवाच" / shlok
  for (const line of lines.slice(0, 5)) {
    const devCount = (line.match(/[\u0900-\u097F]/gu) || []).length;
    const total = line.replace(/\s/g, "").length;
    if (
      devCount > 5 &&
      total > 0 &&
      devCount / total > 0.6 &&
      !/^(?:सूत|शौनक)\s*उवाच/u.test(line) &&
      !/॥/u.test(line) &&
      !/^शब्दार्थ/u.test(line) &&
      line.length > 10 &&
      line.length < 150
    ) {
      return line;
    }
  }
  return "";
}

/**
 * Extract key story elements from tatparya (commentary) sections.
 * These contain the actual narrative in Hindi prose.
 */
export function extractTatparyaStory(contentSnippet: string): string[] {
  const stories: string[] = [];
  const lines = contentSnippet.split("\n");
  let inTatparya = false;
  let currentStory = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^तात्पर्य/u.test(trimmed)) {
      if (currentStory.length > 30) stories.push(currentStory.trim());
      inTatparya = true;
      currentStory = trimmed.replace(/^तात्पर्य\s*:?\s*/u, "");
      continue;
    }
    if (/^शब्दार्थ/u.test(trimmed) || /^अनुवाद/u.test(trimmed)) {
      if (inTatparya && currentStory.length > 30) stories.push(currentStory.trim());
      inTatparya = false;
      currentStory = "";
      continue;
    }
    if (/॥/u.test(trimmed) && trimmed.length < 200) {
      if (inTatparya && currentStory.length > 30) stories.push(currentStory.trim());
      inTatparya = false;
      currentStory = "";
      continue;
    }
    if (inTatparya) {
      currentStory += " " + trimmed;
    }
  }
  if (inTatparya && currentStory.length > 30) stories.push(currentStory.trim());

  return stories;
}

/**
 * Extract shabdarth (word meanings) to identify key characters and actions.
 */
function extractCharactersFromShabdarth(contentSnippet: string): string[] {
  const characters: string[] = [];
  const charPatterns: Array<[RegExp, string]> = [
    [/कृष्ण/u, "Krishna"],
    [/अर्जुन|धनञ्जय/u, "Arjuna"],
    [/भीष्म/u, "Bhishma"],
    [/युधिष्ठिर/u, "Yudhishthira"],
    [/द्रौपदी|कृष्णा/u, "Draupadi"],
    [/कुन्ती|पृथा/u, "Kunti"],
    [/धृतराष्ट्र/u, "Dhritarashtra"],
    [/गान्धारी|गांधारी/u, "Gandhari"],
    [/विदुर/u, "Vidura"],
    [/व्यास/u, "Vyasa"],
    [/परीक्षित/u, "Parikshit"],
    [/अश्वत्थामा/u, "Ashwatthama"],
    [/शुकदेव/u, "Shukadeva"],
    [/नारद/u, "Narada"],
    [/ब्रह्मा/u, "Brahma"],
    [/विष्णु/u, "Vishnu"],
    [/उत्तरा/u, "Uttara"],
    [/सूत.*गोस्वामी/u, "Suta Goswami"],
  ];

  for (const [pat, name] of charPatterns) {
    if (pat.test(contentSnippet) && !characters.includes(name)) {
      characters.push(name);
    }
  }
  return characters.slice(0, 5);
}

/**
 * Use Claude to summarize chapter content and generate a rich, detailed scene prompt.
 * Falls back to rule-based scene detection if Claude is unavailable.
 */
export async function buildAIScenePrompt(
  chapterTitle: string,
  contentSnippet: string,
): Promise<{ scene: string; descriptionHi: string } | null> {
  const characters = extractCharactersFromShabdarth(contentSnippet);
  const charList = characters.length > 0 ? `Characters present: ${characters.join(", ")}` : "";

  const systemPrompt = `You summarize chapters from the Srimad Bhagavatam and create image prompts. Respond ONLY with valid JSON.`;

  const userPrompt = `Chapter title: ${chapterTitle}
${charList}

Chapter content (Hindi/Sanskrit):
${contentSnippet.substring(0, 3000)}

Read the chapter content above carefully and do TWO things:

1. **summary_hi**: Write a 2-3 sentence Hindi summary of this chapter — what is the key event, who are the main characters, and what is the emotional/spiritual significance.

2. **scene_prompt**: Based on your summary, write a concise English scene description (40-60 words) of the single most important moment from this chapter. Focus on:
   - WHO: Name the characters involved (use their proper names like Krishna, Vyasa, Narada, Arjuna, etc.)
   - WHAT: The key action or event happening
   - WHERE: The setting (forest, palace, riverbank, battlefield, etc.)
   Keep it simple and narrative-focused. Do NOT include style instructions, camera angles, or composition directions — just describe the scene as a story moment.

IMPORTANT: The scene_prompt must be ENGLISH ONLY. No Hindi/Sanskrit text.

Respond in this exact JSON format only:
{"summary_hi": "...", "scene_prompt": "..."}`;

  // Try Anthropic first, then Together AI chat models
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const togetherKey = process.env.TOGETHER_API_KEY;

  if (anthropicKey) {
    try {
      const client = new Anthropic();
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 600,
        messages: [{ role: "user", content: userPrompt }],
      });
      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const result = parseSceneJSON(text);
      if (result) {
        logger.info({ chapterTitle, engine: "anthropic" }, "AI scene prompt generated");
        return result;
      }
    } catch (err) {
      logger.warn({ err, chapterTitle }, "Anthropic scene generation failed");
    }
  }

  if (togetherKey) {
    try {
      const res = await fetch("https://api.together.xyz/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${togetherKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 600,
          temperature: 0.7,
        }),
      });
      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      const text = data.choices?.[0]?.message?.content || "";
      const result = parseSceneJSON(text);
      if (result) {
        logger.info({ chapterTitle, engine: "together-llama" }, "AI scene prompt generated");
        return result;
      }
    } catch (err) {
      logger.warn({ err, chapterTitle }, "Together AI scene generation failed");
    }
  }

  logger.info({ chapterTitle }, "No AI keys available for scene generation, using rules");
  return null;
}

function parseSceneJSON(text: string): { scene: string; descriptionHi: string } | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.scene_prompt && parsed.summary_hi) {
      return { scene: parsed.scene_prompt, descriptionHi: parsed.summary_hi };
    }
  } catch { /* invalid JSON */ }
  return null;
}

/**
 * Build a scene description from the actual chapter content.
 * Returns both the English scene prompt and a Hindi description.
 * Tries AI-powered scene generation first, falls back to rule-based.
 */
function buildContentAwareScene(
  chapterTitle: string,
  contentSnippet: string,
): { scene: string; descriptionHi: string }[] {
  const subject = extractChapterSubject(contentSnippet);
  const stories = extractTatparyaStory(contentSnippet);
  const characters = extractCharactersFromShabdarth(contentSnippet);

  const results: { scene: string; descriptionHi: string }[] = [];

  // Scene 1: Main chapter theme — try SUBJECT_SCENES first for high-quality curated scenes
  const combined = `${subject} ${contentSnippet.substring(0, 500)}`;
  let scene1FromSubject = false;
  for (const { pattern, scenes } of SUBJECT_SCENES) {
    if (pattern.test(combined)) {
      results.push({ scene: scenes[0], descriptionHi: subject || chapterTitle });
      // If there's a second curated scene, use it as scene 2
      if (scenes.length > 1) {
        const storyDesc = stories.length > 0
          ? (stories[0].length > 120 ? stories[0].slice(0, 117) + "…" : stories[0])
          : subject || chapterTitle;
        results.push({ scene: scenes[1], descriptionHi: storyDesc });
      }
      scene1FromSubject = true;
      break;
    }
  }

  if (!scene1FromSubject && subject) {
    const charStr = characters.slice(0, 3).join(", ");
    const scene = translateSubjectToScene(subject, charStr, contentSnippet);
    results.push({ scene, descriptionHi: subject });
  }

  // Scene 2: From the most descriptive tatparya story (if we don't already have 2 scenes)
  if (results.length < 2 && stories.length > 0) {
    const bestStory = stories.sort((a, b) => b.length - a.length)[0];
    const storyScene = buildStoryScene(bestStory, characters, contentSnippet);
    const storyDesc = bestStory.length > 120 ? bestStory.slice(0, 117) + "…" : bestStory;
    if (storyScene && (!results[0] || storyScene !== results[0].scene)) {
      results.push({ scene: storyScene, descriptionHi: storyDesc });
    }
  }

  return results.slice(0, 2);
}

/**
 * Map Hindi chapter subjects to English scene descriptions.
 * All prompts must be ENGLISH ONLY (no Hindi), concise, and visually specific —
 * matching the quality of SCENE_KEYWORDS prompts used for chapters 1-7.
 */
const SUBJECT_SCENES: Array<{ pattern: RegExp; scenes: string[] }> = [
  {
    pattern: /कुन्ती|पृथा.*प्रार्थना/u,
    scenes: [
      "An elderly Indian queen mother in a white and gold sari kneeling with folded hands praying to blue-skinned Lord Krishna who stands on a golden chariot, her five warrior sons the Pandavas standing behind her respectfully, on the bank of the sacred Ganges river at golden sunset, wide cinematic landscape",
      "Royal Indian women in white saris performing sacred water rituals on the ancient stone ghats of the Ganges river at sunset, priests chanting nearby, golden light reflecting on the holy water, wide landscape",
    ],
  },
  {
    pattern: /परीक्षित.*रक्षा/u,
    scenes: [
      "Lord Krishna's glowing golden Sudarshana chakra spinning above a young Indian princess to protect her unborn child, divine golden radiance filling an ornate palace chamber, anxious royal family watching, wide cinematic composition",
      "An elderly Indian queen mother in a white and gold sari kneeling with folded hands praying to blue-skinned Lord Krishna who stands on a golden chariot, her five warrior sons the Pandavas standing behind her respectfully, on the bank of the sacred Ganges river at golden sunset, wide cinematic landscape",
    ],
  },
  {
    pattern: /परीक्षित.*जन्म/u,
    scenes: [
      "A divine newborn baby glowing with golden light in a grand palace chamber, royal family gathered around with joy, priests performing blessing rituals with sacred fire, wide cinematic composition",
      "Young sage Shukadeva narrating to King Parikshit on the banks of the wide Ganges river, four sages listening nearby, temple spires in the distance, golden sunset, wide landscape",
    ],
  },
  {
    pattern: /भीष्म.*देह.*त्याग|भीष्म.*शर/u,
    scenes: [
      "Bhishma lying serenely on a bed of arrows on the vast Kurukshetra battlefield, Lord Krishna and the five Pandava princes standing around him with reverence, golden sunset sky, wide dramatic landscape",
      "Bhishma speaking his final words of wisdom from his bed of arrows, sages and warriors gathered around listening, rays of golden light breaking through dramatic clouds above, wide landscape",
    ],
  },
  {
    pattern: /द्वारका.*प्रवेश|कृष्ण.*द्वारका.*प्रवेश/u,
    scenes: [
      "Lord Krishna entering the magnificent golden city of Dwarka on a grand chariot, citizens throwing flowers from ornate balconies, golden domes and spires, ocean in the background, festive wide landscape",
      "Lord Krishna blowing the divine conch Panchajanya with radiant golden light, citizens of Dwarka gathered joyfully on the streets, magnificent golden city architecture, ocean waves, wide landscape",
    ],
  },
  {
    pattern: /द्वारका.*प्रस्थान|कृष्ण.*प्रस्थान|कृष्ण.*द्वारका/u,
    scenes: [
      "Lord Krishna departing on a golden chariot from Hastinapura, the Pandava family watching from the palace steps with tearful eyes, dramatic golden sunset sky, ancient city architecture, wide cinematic landscape",
      "Lord Krishna's grand chariot with four white horses traveling along a river road toward the distant golden city of Dwarka, rolling green plains, dramatic sky with golden clouds, wide panoramic landscape",
    ],
  },
  {
    pattern: /धृतराष्ट्र.*गृह.*त्याग|धृतराष्ट्र.*त्याग/u,
    scenes: [
      "Blind old king Dhritarashtra and queen Gandhari in simple white renunciation robes walking away from the grand Hastinapura palace toward the forest at dawn, Vidura guiding them with a gentle hand, wide cinematic landscape",
      "Vidura speaking earnestly to blind king Dhritarashtra in a grand palace hall by lamplight, urging him to renounce the world, dramatic shadows, wide cinematic composition",
    ],
  },
  {
    pattern: /विदुर.*तीर्थ|विदुर.*यात्रा|विदुर.*लौट/u,
    scenes: [
      "Sage Vidura walking along a peaceful river path at sunrise with a pilgrim's staff, Himalayan foothills in the background, birds in flight, serene wide landscape",
      "Vidura entering the gates of Hastinapura after a long pilgrimage, relatives greeting him with respect, ancient city architecture, golden morning light, wide landscape",
    ],
  },
  {
    pattern: /पाण्डव.*स्वर्गारोहण|पाण्डव.*प्रस्थान/u,
    scenes: [
      "The five Pandava brothers and Draupadi walking in a line toward snow-capped Himalayan peaks on their final journey, vast mountain landscape, golden dawn light, wide cinematic composition",
    ],
  },
  {
    pattern: /ब्रह्मास्त्र|अश्वत्थामा.*दण्ड/u,
    scenes: [
      "Arjuna on his chariot facing Ashwatthama's deadly Brahmastra weapon glowing with intense fire in the sky, Lord Krishna beside Arjuna with hand raised, dramatic battlefield, wide landscape",
    ],
  },
  {
    pattern: /द्रोणपुत्र|अश्वत्थामा/u,
    scenes: [
      "A warrior prince on horseback confronting a kneeling prisoner on a vast battlefield, dramatic sky, ancient Indian setting, wide cinematic landscape",
    ],
  },
];

function translateSubjectToScene(subject: string, characters: string, contentSnippet: string): string {
  // Check subject against specific patterns
  const combined = `${subject} ${contentSnippet.substring(0, 500)}`;
  for (const { pattern, scenes } of SUBJECT_SCENES) {
    if (pattern.test(combined)) {
      return scenes[0];
    }
  }

  // Fallback: build a visual English-only scene from detected characters
  // NEVER include Hindi text in prompts
  const charNames = extractCharactersFromShabdarth(contentSnippet);
  if (charNames.length > 0) {
    const primary = charNames[0];
    const secondary = charNames[1] || "";

    // Character-specific fallback scenes
    if (primary === "Krishna" || primary === "Vishnu") {
      return `Lord Krishna standing majestically in a palace courtyard, golden architecture, peacocks nearby, devotees gathered with folded hands, warm golden sunset light, wide cinematic landscape`;
    }
    if (primary === "Arjuna") {
      return `Arjuna standing beside Lord Krishna with the mighty Gandiva bow, ancient Indian palace courtyard, golden light, wide cinematic landscape`;
    }
    if (primary === "Vyasa") {
      return `Sage Vyasa seated in meditation in a peaceful forest ashram by a river, golden morning light filtering through trees, palm leaf manuscripts nearby, wide landscape`;
    }
    if (primary === "Suta Goswami") {
      return `Suta Goswami speaking to sages seated around a sacred fire in Naimisharanya forest, golden dappled sunlight through ancient trees, wide landscape`;
    }

    const others = secondary ? ` and ${secondary}` : "";
    return `${primary}${others} in a grand ancient Indian palace setting, ornate golden architecture, sacred atmosphere, warm golden light, wide cinematic landscape`;
  }

  // Ultimate fallback — generic but visually rich
  return `A sacred gathering of sages in an ancient Indian forest ashram, golden sunlight filtering through massive banyan trees, a small sacred fire burning, wide cinematic landscape`;
}

/** Build a second scene from tatparya story text */
function buildStoryScene(story: string, characters: string[], contentSnippet: string): string {
  if (/गंगा|नदी.*तट|जल.*दान/u.test(story)) {
    return "Royal family performing sacred water rituals on the banks of the Ganges at sunset, women in white saris offering water, priests chanting, golden light reflecting on the river, wide landscape";
  }
  if (/शंख.*बज|पाञ्चजन्य/u.test(story)) {
    return "Lord Krishna blowing the divine conch Panchajanya with golden light emanating outward, citizens gathered joyfully, magnificent city architecture with golden domes, wide landscape";
  }
  if (/रथ.*पर|रथ.*यात्रा/u.test(story)) {
    const charStr = characters.slice(0, 2).join(" and ") || "royal warriors";
    return `${charStr} riding golden chariots with white horses through an ancient Indian city, cheering crowds, grand temple architecture, golden hour light, wide landscape`;
  }
  if (/शोक|विलाप|रोना|दुख/u.test(story)) {
    return "A solemn gathering of the royal family in a grand palace hall, soft lamplight casting long shadows, Lord Krishna consoling them with a gentle gesture, wide cinematic composition";
  }
  if (/वन.*गमन|वन.*प्रस्थान|गृह.*त्याग/u.test(story)) {
    return "An elderly couple in simple white clothes departing a grand palace at dawn, walking toward a distant forest path, golden morning mist, wide landscape";
  }
  if (/राज्य.*अभिषेक|सिंहासन|राजा.*बन/u.test(story)) {
    return "Grand coronation of a young king in an ancient Indian palace, seated on a golden throne, priests performing Vedic fire rituals, courtiers gathered, wide cinematic composition";
  }
  if (/युद्ध|संग्राम|सेना/u.test(story)) {
    return "Vast ancient Indian battlefield at dawn, golden chariots and warriors assembling, dramatic sky with golden light breaking through clouds, eagles circling, wide panoramic landscape";
  }
  if (/तीर्थ|यात्रा|पवित्र/u.test(story)) {
    return "A sage walking along a sacred river path through rolling hills at sunrise, ancient temples visible in the distance, birds in flight, peaceful wide landscape";
  }
  if (/उपदेश|ज्ञान|शिक्षा/u.test(story)) {
    return "A wise sage teaching younger disciples under a massive banyan tree, sacred texts spread on the ground, golden afternoon light, forest ashram setting, wide landscape";
  }
  if (/भक्ति|प्रेम|पूजा/u.test(story)) {
    return "Devotees performing aarti with golden oil lamps before a magnificent temple at dusk, flower garlands and incense smoke, sacred atmosphere, wide cinematic landscape";
  }

  // Character-aware fallback
  const charStr = characters.slice(0, 2).join(" and ") || "sages";
  return `${charStr} in a peaceful forest ashram by a flowing river, golden sunlight through trees, sacred fire nearby, wide cinematic landscape`;
}

async function detectScenes(chapterTitle: string, contentSnippet: string, maxScenes: number = 3): Promise<string[]> {
  // FIRST: try AI-powered scene generation for rich, detailed prompts
  const aiScene = await buildAIScenePrompt(chapterTitle, contentSnippet);
  if (aiScene) {
    (detectScenes as any)._lastDescriptions = [aiScene.descriptionHi];
    return [aiScene.scene].slice(0, maxScenes);
  }

  // SECOND: try content-aware extraction from the actual chapter text (rule-based)
  const contentScenes = buildContentAwareScene(chapterTitle, contentSnippet);
  if (contentScenes.length > 0) {
    (detectScenes as any)._lastDescriptions = contentScenes.map((s) => s.descriptionHi);
    return contentScenes.map((s) => s.scene).slice(0, maxScenes);
  }

  // THIRD: try keyword-based scene matching
  const combined = `${chapterTitle} ${contentSnippet}`;
  for (const { pattern, scenes } of SCENE_KEYWORDS) {
    if (pattern.test(combined)) {
      (detectScenes as any)._lastDescriptions = undefined;
      return scenes.slice(0, maxScenes);
    }
  }

  // Fallback: pick a generic scene
  (detectScenes as any)._lastDescriptions = undefined;
  const numMatch = chapterTitle.match(/\d+/);
  const idx = numMatch ? parseInt(numMatch[0], 10) % GENERIC_SCENES.length : 0;
  return [GENERIC_SCENES[idx]];
}

function buildPrompt(scene: string, _contentContext: string): string {
  // Inject character persona for consistency, but no art style — let the model decide
  return injectPersona(scene);
}

// ── Together AI image generation (FLUX.2-pro) ─────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

async function generateWithTogether(prompt: string, destPath: string, model: string = "black-forest-labs/FLUX.2-pro"): Promise<void> {
  const apiKey = process.env.TOGETHER_API_KEY;
  if (!apiKey) throw new Error("TOGETHER_API_KEY not set");

  const fullPrompt = prompt + "\nClassic oil painting style, rich warm earth tones, dramatic chiaroscuro lighting, ancient banyan trees and sacred fire, detailed Indian traditional clothing, serene devotional atmosphere, museum quality fine art.";
  const body: Record<string, unknown> = {
    model,
    prompt: fullPrompt,
    width: 1440,
    height: 768,
  };

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch("https://api.together.xyz/v1/images/generations", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Together AI error ${response.status}: ${errText}`);
      }

      const result = await response.json() as {
        data?: Array<{ b64_json?: string; url?: string }>;
      };

      if (result.data?.[0]?.b64_json) {
        const buffer = Buffer.from(result.data[0].b64_json, "base64");
        fs.writeFileSync(destPath, buffer);
      } else if (result.data?.[0]?.url) {
        const imgRes = await fetch(result.data[0].url);
        if (!imgRes.ok) throw new Error(`Image download failed: ${imgRes.status}`);
        const arrBuf = await imgRes.arrayBuffer();
        fs.writeFileSync(destPath, Buffer.from(arrBuf));
      } else {
        throw new Error("No image data in Together AI response");
      }

      logger.info({ attempt, destPath }, "Together AI image generated successfully");
      return; // Success — exit retry loop
    } catch (err: any) {
      lastError = err;
      logger.warn({ attempt, maxRetries: MAX_RETRIES, err: err?.message }, "Together AI attempt failed");
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }

  throw lastError || new Error("Together AI failed after all retries");
}


// ── Main generation function ─────────────────────────────────────────────────

/**
 * Generate images for a chapter. Supports multiple images (scenes) per chapter.
 * Uses Together AI (FLUX.2) for image generation.
 * Returns array of generated filenames.
 */
export function generateChapterImages(
  chapterNumber: number,
  chapterTitle: string,
  contentSnippet: string,
): Promise<string[]> {
  return withManifestLock(() => _generateChapterImages(chapterNumber, chapterTitle, contentSnippet));
}

async function _generateChapterImages(
  chapterNumber: number,
  chapterTitle: string,
  contentSnippet: string,
): Promise<string[]> {
  ensureImageDir();

  const scenes = await detectScenes(chapterTitle, contentSnippet, 1);
  const generatedFiles: string[] = [];
  const manifest = readManifest();

  for (let sceneIdx = 0; sceneIdx < scenes.length; sceneIdx++) {
    const suffix = sceneIdx === 0 ? "" : `-${sceneIdx + 1}`;
    const filename = `chapter-${String(chapterNumber).padStart(3, "0")}${suffix}.jpg`;
    const destPath = path.join(IMAGES_DIR, filename);

    // Skip if already exists AND is a valid image (>10KB)
    if (fs.existsSync(destPath)) {
      const stat = fs.statSync(destPath);
      if (stat.size > 10_000) {
        logger.info({ chapterNumber, filename, sceneIdx, size: stat.size }, "Chapter image already exists, skipping");
        generatedFiles.push(filename);
        continue;
      }
      // File is too small — likely an error response; delete and regenerate
      logger.warn({ chapterNumber, filename, size: stat.size }, "Removing broken image file");
      fs.unlinkSync(destPath);
    }

    const prompt = buildPrompt(scenes[sceneIdx], contentSnippet);

    try {
      logger.info({
        chapterNumber, sceneIdx, totalScenes: scenes.length,
        engine: "together-flux2",
      }, "Generating chapter image");

      await generateWithTogether(prompt, destPath);

      // Update manifest — include descriptionHi from content-aware extraction
      const descriptions = (detectScenes as any)._lastDescriptions as string[] | undefined;
      const descHi = descriptions?.[sceneIdx] || undefined;

      manifest.images = manifest.images.filter(
        (img) => !(img.chapterNumber === chapterNumber && (img.sceneIndex ?? 0) === sceneIdx)
      );
      const personas = detectPersonasInScene(scenes[sceneIdx]);
      manifest.images.push({
        chapterNumber,
        chapterTitle,
        imagePath: filename,
        prompt: scenes[sceneIdx],  // Store the clean scene description, not the full enriched prompt
        descriptionHi: descHi,
        personasUsed: personas.length > 0 ? personas : undefined,
        personaVersion: personas.length > 0 ? getPersonaGroupVersion(personas) : undefined,
        generatedAt: new Date().toISOString(),
        sceneIndex: sceneIdx,
      });

      generatedFiles.push(filename);
      logger.info({ chapterNumber, filename, sceneIdx }, "Chapter image generated successfully");
    } catch (err) {
      logger.warn({ chapterNumber, sceneIdx, err }, "Failed to generate chapter image");
    }
  }

  // Write manifest once after all scenes
  manifest.images.sort((a, b) => {
    if (a.chapterNumber !== b.chapterNumber) return a.chapterNumber - b.chapterNumber;
    return (a.sceneIndex ?? 0) - (b.sceneIndex ?? 0);
  });
  writeManifest(manifest);

  return generatedFiles;
}

/**
 * Force-regenerate images for a specific chapter.
 * Deletes existing images and manifest entries, then regenerates with content-aware scenes.
 */
export function regenerateChapterImages(
  chapterNumber: number,
  chapterTitle: string,
  contentSnippet: string,
): Promise<{ files: string[]; trashIds: string[] }> {
  return withManifestLock(async () => {
    ensureImageDir();

    // Move existing images to trash (for undo) instead of deleting
    const manifest = readManifest();
    const existing = manifest.images.filter((img) => img.chapterNumber === chapterNumber);
    const trashIds: string[] = [];
    for (const img of existing) {
      const tid = trashImage(img, "regenerate");
      trashIds.push(tid);
    }
    // Remove from manifest
    manifest.images = manifest.images.filter((img) => img.chapterNumber !== chapterNumber);
    writeManifest(manifest);

    // Generate fresh (call internal directly since we already hold the lock)
    const files = await _generateChapterImages(chapterNumber, chapterTitle, contentSnippet);
    return { files, trashIds };
  });
}

/**
 * Regenerate a chapter image using a user-provided custom prompt.
 * Trashes the existing image and generates a new one with the custom scene description.
 */
export function regenerateWithCustomPrompt(
  chapterNumber: number,
  chapterTitle: string,
  customPrompt: string,
  sceneIndex: number = 0,
  summaryHi?: string,
): Promise<{ file: string | null; trashId: string | null }> {
  return withManifestLock(async () => {
    ensureImageDir();

    // Trash existing image for this scene
    const manifest = readManifest();
    const existing = manifest.images.find(
      (img) => img.chapterNumber === chapterNumber && (img.sceneIndex ?? 0) === sceneIndex
    );
    let trashId: string | null = null;
    if (existing) {
      trashId = trashImage(existing, "regenerate");
      manifest.images = manifest.images.filter(
        (img) => !(img.chapterNumber === chapterNumber && (img.sceneIndex ?? 0) === sceneIndex)
      );
      writeManifest(manifest);
    }

    // Generate with custom prompt
    const suffix = sceneIndex === 0 ? "" : `-${sceneIndex + 1}`;
    const filename = `chapter-${String(chapterNumber).padStart(3, "0")}${suffix}.jpg`;
    const destPath = path.join(IMAGES_DIR, filename);

    const prompt = buildPrompt(customPrompt, "");

    try {
      await generateWithTogether(prompt, destPath);

      const personas = detectPersonasInScene(customPrompt);
      const updatedManifest = readManifest();
      updatedManifest.images.push({
        chapterNumber,
        chapterTitle,
        imagePath: filename,
        prompt: customPrompt,
        descriptionHi: summaryHi || customPrompt,
        personasUsed: personas.length > 0 ? personas : undefined,
        personaVersion: personas.length > 0 ? getPersonaGroupVersion(personas) : undefined,
        generatedAt: new Date().toISOString(),
        sceneIndex,
      });
      updatedManifest.images.sort((a, b) => {
        if (a.chapterNumber !== b.chapterNumber) return a.chapterNumber - b.chapterNumber;
        return (a.sceneIndex ?? 0) - (b.sceneIndex ?? 0);
      });
      writeManifest(updatedManifest);

      return { file: filename, trashId };
    } catch (err) {
      logger.warn({ chapterNumber, sceneIndex, err }, "Failed to generate with custom prompt");
      return { file: null, trashId };
    }
  });
}

/**
 * Delete a specific image by chapter number and scene index.
 */
export function deleteChapterImage(chapterNumber: number, sceneIndex: number): { success: boolean; deleted?: string; trashId?: string } {
  const manifest = readManifest();
  const img = manifest.images.find((i) => i.chapterNumber === chapterNumber && (i.sceneIndex ?? 0) === sceneIndex);
  if (!img) return { success: false };

  // Move to trash instead of permanent delete
  const trashId = trashImage(img, "delete");

  manifest.images = manifest.images.filter((i) => !(i.chapterNumber === chapterNumber && (i.sceneIndex ?? 0) === sceneIndex));
  writeManifest(manifest);
  logger.info({ chapterNumber, sceneIndex, file: img.imagePath, trashId }, "Deleted chapter image (moved to trash)");
  return { success: true, deleted: img.imagePath, trashId };
}

// Keep backward-compatible single-image function
export async function generateChapterImage(
  chapterNumber: number,
  chapterTitle: string,
  contentSnippet: string,
): Promise<string | null> {
  const files = await generateChapterImages(chapterNumber, chapterTitle, contentSnippet);
  return files[0] || null;
}

/**
 * Scan batch text for chapter headings and generate images for new chapters.
 */
// OCR-mangled chapter headings — map to correct chapter numbers
const OCR_CHAPTER_FIXES: Record<string, { num: number; title: string }> = {
  "Chapter 278 अध्याय": { num: 8, title: "अध्याय आठ" },
  "Chapter it": { num: 9, title: "अध्याय नौ" },
};

export async function generateImagesForBatch(
  pages: Array<{ pageNumber: number; text: string }>,
): Promise<void> {
  const chapterPattern = /^(?:\d+\s+)?(?:Chapter|अध्याय)\s+(.+)/imu;
  const hindiNums: Record<string, number> = {
    एक: 1, दो: 2, तीन: 3, चार: 4, पाँच: 5, छः: 6, छह: 6,
    सात: 7, आठ: 8, नौ: 9, दस: 10, ग्यारह: 11, बारह: 12,
    तेरह: 13, चौदह: 14, पन्द्रह: 15, सोलह: 16, सत्रह: 17,
    अठारह: 18, उन्नीस: 19, बीस: 20,
  };

  for (const page of pages) {
    const lines = page.text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const match = trimmed.match(chapterPattern);
      if (match && !trimmed.includes("पूर्ण हुए")) {
        let chapterTitle = match[0].replace(/^\d+\s+/, "").trim();

        // Check OCR fixes first
        let chapterNum = 0;
        for (const [key, fix] of Object.entries(OCR_CHAPTER_FIXES)) {
          if (chapterTitle.includes(key) || trimmed.includes(key)) {
            chapterNum = fix.num;
            chapterTitle = fix.title;
            break;
          }
        }

        if (!chapterNum) {
          // Check Hindi words before digits (avoid matching page numbers)
          for (const [word, num] of Object.entries(hindiNums)) {
            if (chapterTitle.includes(word)) { chapterNum = num; break; }
          }
        }
        if (!chapterNum) {
          const numMatch = chapterTitle.match(/\d+/);
          if (numMatch) {
            const n = parseInt(numMatch[0], 10);
            if (n > 0 && n <= 100) chapterNum = n;
          }
        }

        if (chapterNum > 0) {
          // Get LARGE content snippet — more context = better prompts
          const remainingLines = lines.slice(i + 1, i + 40).join("\n");
          const contentSnippet = remainingLines.substring(0, 2000);

          await generateChapterImages(chapterNum, chapterTitle, contentSnippet);
        }
      }
    }
  }
}

export function getImagesDir(): string {
  ensureImageDir();
  return IMAGES_DIR;
}
