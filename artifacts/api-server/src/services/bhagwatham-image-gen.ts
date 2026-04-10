import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "..", "..", "..", "..", "data", "bhagwatham");
const IMAGES_DIR = path.join(DATA_DIR, "images");
const MANIFEST_FILE = path.join(IMAGES_DIR, "manifest.json");

// ── Art style suffix — appended to every prompt ──────────────────────────────
const ART_STYLE = [
  "Indian devotional calendar art",
  "ultra detailed oil painting",
  "rich saturated colors",
  "soft glowing divine halo light",
  "intricate gold jewelry with gemstones",
  "fresh flower garlands of roses and jasmine",
  "rich silk fabrics with gold zari embroidery",
  "8k extremely detailed",
  "volumetric lighting",
  "perfectly proportioned symmetrical eyes with clear iris and pupil detail",
  "anatomically correct human face with natural eye spacing",
  "warm golden saffron and blue color palette",
].join(", ");

// ── Character Personas — consistent appearance across all images ─────────────
// Each character has a fixed description so they look the same everywhere.
const CHARACTER_PERSONAS: Record<string, string> = {
  krishna_adult: "Lord Krishna: a handsome young man with luminous deep blue skin, large almond-shaped dark eyes with perfectly defined irises, gentle serene smile, sharp nose, curly dark black hair adorned with a single peacock feather in a golden crown, wearing yellow silk pitambara dhoti, Kaustubha gem on chest, golden armlets and bracelets, fresh tulsi and rose garland",
  krishna_child: "Baby Krishna: an adorable divine infant with soft round blue-tinted cheeks, large sparkling doe-like dark eyes with perfectly defined irises, playful mischievous smile, tiny button nose, curly black hair with a small peacock feather, wearing miniature golden crown, tiny gold anklets and waistband, pearl necklace",
  narada: "Sage Narada: a youthful-looking sage with light brown skin, clean-shaven face with a warm radiant smile, bright alert almond-shaped eyes with clear defined irises, prominent white tilak mark on forehead, neatly tied grey-streaked hair in a topknot, slender build, wearing simple white cotton dhoti with golden border, sacred thread across chest, carrying his signature wooden tanpura veena instrument",
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

function detectScenes(chapterTitle: string, contentSnippet: string, maxScenes: number = 3): string[] {
  const combined = `${chapterTitle} ${contentSnippet}`;

  for (const { pattern, scenes } of SCENE_KEYWORDS) {
    if (pattern.test(combined)) {
      return scenes.slice(0, maxScenes);
    }
  }

  // Fallback: pick a generic scene
  const numMatch = chapterTitle.match(/\d+/);
  const idx = numMatch ? parseInt(numMatch[0], 10) % GENERIC_SCENES.length : 0;
  return [GENERIC_SCENES[idx]];
}

function buildPrompt(scene: string, contentContext: string): string {
  // Inject character persona for consistency
  const enrichedScene = injectPersona(scene);

  // Add key content details to enrich the prompt
  const contextHint = contentContext
    .replace(/[^\u0900-\u097F\sa-zA-Z]/g, " ") // Keep Hindi and English
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 150);

  let prompt = `${enrichedScene}, ${ART_STYLE}`;
  if (contextHint.length > 30) {
    prompt += `. Scene context: ${contextHint}`;
  }
  return prompt;
}

// ── Together AI image generation (FLUX.2-max) ────────────────────────────────

async function generateWithTogether(prompt: string, destPath: string, model: string = "black-forest-labs/FLUX.2-max", referenceImageUrls?: string[]): Promise<void> {
  const apiKey = process.env.TOGETHER_API_KEY;
  if (!apiKey) throw new Error("TOGETHER_API_KEY not set");

  const body: Record<string, unknown> = {
    model,
    prompt,
    width: 1440,
    height: model.includes("FLUX.1") ? 832 : 816, // FLUX.1.1-pro needs multiples of 32
    steps: 28,
    n: 1,
    response_format: "b64_json",
  };

  // Add reference images for face consistency (FLUX.2 pro/dev/flex only)
  if (referenceImageUrls?.length && model.includes("FLUX.2")) {
    body.reference_images = referenceImageUrls;
  }

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
    // Fallback: download from URL
    const imgRes = await fetch(result.data[0].url);
    if (!imgRes.ok) throw new Error(`Image download failed: ${imgRes.status}`);
    const arrBuf = await imgRes.arrayBuffer();
    fs.writeFileSync(destPath, Buffer.from(arrBuf));
  } else {
    throw new Error("No image data in Together AI response");
  }
}

// ── Stability AI fallback ────────────────────────────────────────────────────

async function generateWithStability(prompt: string, destPath: string): Promise<void> {
  const apiKey = process.env.STABILITY_API_KEY;
  if (!apiKey) throw new Error("STABILITY_API_KEY not set");

  const boundary = `----FormBoundary${Date.now()}`;
  const parts: Buffer[] = [];
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\n${prompt}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="output_format"\r\n\r\njpeg\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="aspect_ratio"\r\n\r\n16:9\r\n`));
  parts.push(Buffer.from(`--${boundary}--\r\n`));

  const response = await fetch("https://api.stability.ai/v2beta/stable-image/generate/core", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Accept": "image/jpeg",
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body: Buffer.concat(parts),
  });

  if (!response.ok) throw new Error(`Stability error ${response.status}: ${await response.text()}`);
  fs.writeFileSync(destPath, Buffer.from(await response.arrayBuffer()));
}

// ── Pollinations fallback (free) ─────────────────────────────────────────────

async function generateWithPollinations(prompt: string, destPath: string, seed: number): Promise<void> {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1440&height=816&seed=${seed}&nologo=true&model=flux`;
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Pollinations HTTP ${response.status}`);
  fs.writeFileSync(destPath, Buffer.from(await response.arrayBuffer()));
}

// ── Main generation function ─────────────────────────────────────────────────

/**
 * Generate images for a chapter. Supports multiple images (scenes) per chapter.
 * Uses Together AI (FLUX.2-max) > Stability AI > Pollinations.ai fallback chain.
 * Returns array of generated filenames.
 */
export async function generateChapterImages(
  chapterNumber: number,
  chapterTitle: string,
  contentSnippet: string,
): Promise<string[]> {
  ensureImageDir();

  const scenes = detectScenes(chapterTitle, contentSnippet, 3);
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
    const faceUrls = getFaceReferenceUrls(scenes[sceneIdx]);

    try {
      logger.info({
        chapterNumber, sceneIdx, totalScenes: scenes.length,
        faceRefs: faceUrls.length,
        engine: process.env.TOGETHER_API_KEY ? "together-flux2" : process.env.STABILITY_API_KEY ? "stability" : "pollinations",
      }, "Generating chapter image");

      // Fallback chain: Together FLUX.2-max (with face refs) → Together FLUX.1.1-pro → Pollinations
      let generated = false;
      if (process.env.TOGETHER_API_KEY) {
        try {
          await generateWithTogether(prompt, destPath, "black-forest-labs/FLUX.2-max", faceUrls.length > 0 ? faceUrls : undefined);
          generated = true;
        } catch (err: any) {
          logger.warn({ chapterNumber, sceneIdx, err: err?.message }, "FLUX.2-max failed, trying FLUX.1.1-pro");
          try {
            await generateWithTogether(prompt, destPath, "black-forest-labs/FLUX.1.1-pro");
            generated = true;
          } catch (err2: any) {
            logger.warn({ chapterNumber, sceneIdx, err: err2?.message }, "FLUX.1.1-pro also failed");
          }
        }
      }
      if (!generated) {
        await generateWithPollinations(prompt, destPath, chapterNumber * 42 + sceneIdx);
      }

      // Update manifest
      manifest.images = manifest.images.filter(
        (img) => !(img.chapterNumber === chapterNumber && (img.sceneIndex ?? 0) === sceneIdx)
      );
      manifest.images.push({
        chapterNumber,
        chapterTitle,
        imagePath: filename,
        prompt,
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
      const match = lines[i].trim().match(chapterPattern);
      if (match && !lines[i].includes("पूर्ण हुए")) {
        const chapterTitle = match[0].replace(/^\d+\s+/, "").trim();

        const numMatch = chapterTitle.match(/\d+/);
        let chapterNum = numMatch ? parseInt(numMatch[0], 10) : 0;
        if (!chapterNum) {
          for (const [word, num] of Object.entries(hindiNums)) {
            if (chapterTitle.includes(word)) { chapterNum = num; break; }
          }
        }

        if (chapterNum > 0) {
          // Get LARGE content snippet — more context = better prompts
          const remainingLines = lines.slice(i + 1, i + 40).join(" ");
          const contentSnippet = remainingLines.substring(0, 1500);

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
