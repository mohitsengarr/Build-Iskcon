/**
 * Bhagavad Gita Image Generation Service
 *
 * Simplified version of bhagwatham-image-gen.ts for the Bhagavad Gita pipeline.
 * Only 4 personas (Krishna, Arjuna, Sanjaya, Dhritarashtra).
 * 18 chapters, no cantos/skandh.
 * No Instagram-related code.
 *
 * Uses Together AI FLUX.2-pro for image generation with consistent character personas.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { logger } from "../lib/logger";
import Anthropic from "@anthropic-ai/sdk";
import { reportAIFailure } from "./ai-credit-monitor";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "..", "..", "..", "..", "data", "gita");
const IMAGES_DIR = path.join(DATA_DIR, "images");
const MANIFEST_FILE = path.join(IMAGES_DIR, "manifest.json");
const TRASH_DIR = path.join(IMAGES_DIR, ".trash");
const TRASH_META_FILE = path.join(TRASH_DIR, "trash-meta.json");

// ── Trash / Undo support ────────────────────────────────────────────────────

interface TrashEntry {
  trashId: string;
  originalFile: string;
  trashedFile: string;
  manifestEntry: ChapterImage;
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
  while (entries.length > 50) {
    const old = entries.shift()!;
    const oldPath = path.join(TRASH_DIR, old.trashedFile);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  writeTrashMeta(entries);
  logger.info({ trashId, file: img.imagePath, operation }, "Gita image moved to trash");
  return trashId;
}

export function restoreImage(trashId: string): { success: boolean; restored?: ChapterImage } {
  const entries = readTrashMeta();
  const idx = entries.findIndex(e => e.trashId === trashId);
  if (idx === -1) return { success: false };

  const entry = entries[idx];
  const trashedPath = path.join(TRASH_DIR, entry.trashedFile);
  const restorePath = path.join(IMAGES_DIR, entry.originalFile);

  if (fs.existsSync(trashedPath)) {
    if (fs.existsSync(restorePath)) fs.unlinkSync(restorePath);
    fs.renameSync(trashedPath, restorePath);
  } else {
    return { success: false };
  }

  const manifest = readManifest();
  const chNum = entry.manifestEntry.chapterNumber;
  const scIdx = entry.manifestEntry.sceneIndex ?? 0;
  manifest.images = manifest.images.filter(
    i => !(i.chapterNumber === chNum && (i.sceneIndex ?? 0) === scIdx)
  );
  manifest.images.push(entry.manifestEntry);
  manifest.lastUpdated = new Date().toISOString();
  writeManifest(manifest);

  entries.splice(idx, 1);
  writeTrashMeta(entries);

  logger.info({ trashId, file: entry.originalFile }, "Gita image restored from trash");
  return { success: true, restored: entry.manifestEntry };
}

// ── Art style suffix ────────────────────────────────────────────────────────
const ART_STYLE = [
  "classical Indian devotional oil painting style",
  "traditional hand-painted look with visible soft brushstrokes and painterly texture",
  "NOT photo-realistic NOT photographic NOT 3D render — must look like a fine art painting",
  "rich warm golden and earthy color palette with deep saffron ochre amber and forest green tones",
  "soft diffused warm lighting with a dreamy golden glow throughout the scene like early morning or late afternoon",
  "traditional Indian Vedic clothing in saffron or warm colors with fine painted fabric texture ornate gold borders",
  "ancient Kurukshetra battlefield setting or royal palace — no modern elements whatsoever",
  "characters have gentle idealized painted faces with warm skin tones soft expressive eyes",
  "wide scene composition showing the full environment and setting — NOT a portrait or close-up",
  "characters should be engaged in the story action within the scene — never posing for or looking directly at the viewer",
  "camera angle: wide or medium-wide establishing shot showing landscape or architecture",
  "overall mood: peaceful devotional serene and sacred — like a classical Indian temple painting or calendar art",
  "4K resolution highly detailed brushwork rich color depth warm atmospheric perspective",
].join(", ");

// ── Character Personas — only 4 for Bhagavad Gita ──────────────────────────
const CHARACTER_PERSONAS: Record<string, string> = {
  krishna_charioteer: "Lord Krishna as divine charioteer, deep blue-skinned young man aged 25, peacock feather in curly black hair, golden crown, yellow silk dhoti, standing on Arjuna's chariot at Kurukshetra battlefield",
  arjuna_warrior: "Arjuna the warrior prince, tall muscular man aged 30, dark hair in tight warrior topknot, golden armor and arm-guards, carrying mighty Gandiva bow, standing on chariot, looking conflicted and sorrowful",
  sanjaya_narrator: "Sanjaya the narrator, middle-aged man aged 45, fair complexion, simple white dhoti, seated in palace, eyes closed in divine meditation, recounting the battlefield dialogue",
  dhritarashtra_blind: "King Dhritarashtra, very old blind king aged 80, closed sunken sightless eyes, long white beard, white royal garments, seated on throne, listening to Sanjaya",
};

const PERSONA_SHORT: Record<string, string> = {
  krishna_charioteer: "Lord Krishna: deep blue-skinned young man aged 25, peacock feather in curly black hair, golden crown, yellow silk dhoti, standing on Arjuna's chariot at Kurukshetra battlefield",
  arjuna_warrior: "Arjuna: tall muscular warrior prince aged 30, dark hair in tight warrior topknot, golden armor and arm-guards, carrying mighty Gandiva bow, standing on chariot, looking conflicted and sorrowful",
  sanjaya_narrator: "Sanjaya: middle-aged narrator aged 45, fair complexion, simple white dhoti, seated in palace, eyes closed in divine meditation",
  dhritarashtra_blind: "King Dhritarashtra: very old blind king aged 80, closed sunken sightless eyes, long white beard, white royal garments, seated on throne",
};

function injectPersona(scene: string): string {
  let result = scene;
  const checks: Array<[RegExp, string]> = [
    [/\bKrishna\b/i, "krishna_charioteer"],
    [/\bArjuna\b/i, "arjuna_warrior"],
    [/\bSanjaya\b/i, "sanjaya_narrator"],
    [/\bDhritarashtra\b/i, "dhritarashtra_blind"],
  ];

  const matchedPersonas: string[] = [];
  for (const [pattern, key] of checks) {
    if (pattern.test(scene) && PERSONA_SHORT[key] && !matchedPersonas.includes(PERSONA_SHORT[key])) {
      matchedPersonas.push(PERSONA_SHORT[key]);
    }
  }

  if (matchedPersonas.length > 0) {
    result = `${matchedPersonas.join(". ")}. Scene: ${scene}`;
  }
  return result;
}

function detectPersonasInScene(scene: string): string[] {
  const found: string[] = [];
  const checks: Array<[RegExp, string]> = [
    [/\bKrishna\b/i, "krishna_charioteer"],
    [/\bArjuna\b/i, "arjuna_warrior"],
    [/\bSanjaya\b/i, "sanjaya_narrator"],
    [/\bDhritarashtra\b/i, "dhritarashtra_blind"],
  ];
  for (const [pattern, key] of checks) {
    if (pattern.test(scene) && !found.includes(key)) {
      found.push(key);
    }
  }
  return found;
}

// ── Persona versioning ──────────────────────────────────────────────────────

const PERSONA_VERSION_FILE = path.join(DATA_DIR, "persona-versions.json");

interface PersonaVersions {
  versions: Record<string, number>;
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

function getPersonaGroupVersion(personaKeys: string[]): number {
  const pv = readPersonaVersions();
  return Math.max(...personaKeys.map((k) => pv.versions[k] || 1), 1);
}

export function enhancePersona(personaKey: string, enhancement: string): { success: boolean; newVersion: number; affectedImages: number } {
  if (!CHARACTER_PERSONAS[personaKey]) {
    return { success: false, newVersion: 0, affectedImages: 0 };
  }

  CHARACTER_PERSONAS[personaKey] = `${CHARACTER_PERSONAS[personaKey]}, ${enhancement}`;

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

  const manifest = readManifest();
  const affected = manifest.images.filter((img) =>
    img.personasUsed?.includes(personaKey) && (img.personaVersion || 1) < newVersion
  ).length;

  logger.info({ personaKey, newVersion, affected, enhancement }, "Gita persona enhanced");

  return { success: true, newVersion, affectedImages: affected };
}

export function getPersonaVersions(): PersonaVersions {
  return readPersonaVersions();
}

// ── Scene keywords for Bhagavad Gita chapters ──────────────────────────────
const SCENE_KEYWORDS: Array<{ pattern: RegExp; scenes: string[] }> = [
  {
    pattern: /अर्जुन.*विषाद|विषाद.*योग|कुरुक्षेत्र.*सैन्य/iu,
    scenes: [
      "Krishna and Arjuna on a golden chariot drawn by four white horses, positioned between two vast armies on the Kurukshetra plain, Arjuna looking sorrowful with bow lowered, dramatic sky with rays of sunlight, wide cinematic panoramic landscape",
      "Arjuna sitting dejectedly on the chariot seat with Gandiva bow dropped, tears in his eyes, Krishna beside him looking compassionate, both armies visible in the background, dramatic battlefield sunset, wide landscape",
    ],
  },
  {
    pattern: /सांख्य.*योग|ज्ञान.*विज्ञान/iu,
    scenes: [
      "Krishna speaking wisdom to Arjuna on the chariot, gesturing with one hand, divine golden aura around Krishna, Arjuna listening attentively with folded hands, vast Kurukshetra battlefield stretching to the horizon, golden light, wide landscape",
    ],
  },
  {
    pattern: /कर्म.*योग/iu,
    scenes: [
      "Krishna standing majestically on the chariot explaining karma yoga, one hand raised in teaching gesture, Arjuna seated listening with determination growing on his face, battlefield at dawn, wide cinematic landscape",
    ],
  },
  {
    pattern: /भक्ति.*योग|अनन्य.*भक्ति/iu,
    scenes: [
      "Krishna with divine golden radiance speaking about devotion, Arjuna with folded hands in reverence, chariot on a hill overlooking the vast battlefield, dramatic golden clouds, wide landscape",
    ],
  },
  {
    pattern: /विश्वरूप|विश्व.*रूप.*दर्शन/iu,
    scenes: [
      "Krishna revealing his cosmic universal form (Vishwaroop) — a towering divine figure with multiple faces and arms filling the sky, Arjuna on the chariot looking up in awe and terror, cosmic lights and galaxies swirling, wide panoramic cosmic landscape",
      "Arjuna with folded hands trembling before the magnificent cosmic form of Krishna spanning the entire sky, divine fire and radiance, armies visible below, wide dramatic composition",
    ],
  },
  {
    pattern: /क्षेत्र.*क्षेत्रज्ञ/iu,
    scenes: [
      "Krishna and Arjuna in deep philosophical dialogue on the chariot, warm golden sunlight, peaceful pause in the battlefield, wide landscape with both armies resting in the distance",
    ],
  },
  {
    pattern: /दैवासुर.*सम्पद|दैव.*आसुर/iu,
    scenes: [
      "Krishna teaching Arjuna about divine and demonic qualities, two symbolic visions in the sky — one golden radiant and one dark shadowy — Arjuna gazing upward, battlefield at dusk, wide dramatic landscape",
    ],
  },
  {
    pattern: /मोक्ष.*संन्यास|संन्यास.*योग/iu,
    scenes: [
      "Krishna blessing Arjuna with both hands, Arjuna standing with renewed resolve holding Gandiva bow, golden divine light surrounding them, vast Kurukshetra battlefield at golden dawn, wide cinematic landscape",
      "Arjuna picking up his Gandiva bow with determination, Krishna smiling approvingly from the chariot, both armies ready for battle, dramatic sunrise on the horizon, wide panoramic landscape",
    ],
  },
  {
    pattern: /ध्यान.*योग|योग.*ध्यान/iu,
    scenes: [
      "Krishna demonstrating meditation posture to Arjuna on the chariot, both seated cross-legged, divine golden aura, peaceful battlefield at twilight, wide serene landscape",
    ],
  },
  {
    pattern: /धृतराष्ट्र|संजय.*उवाच/iu,
    scenes: [
      "Sanjaya narrating the battlefield events to blind King Dhritarashtra in the grand palace of Hastinapura, Dhritarashtra seated on his throne looking anxious, Sanjaya with eyes closed in divine vision, wide palace interior with golden lamplight",
    ],
  },
];

const GENERIC_SCENES = [
  "Krishna and Arjuna on their golden chariot on the vast Kurukshetra battlefield, dramatic sky with golden clouds, wide cinematic landscape",
  "Krishna speaking divine wisdom to Arjuna on the chariot, golden divine aura, armies in the background, wide landscape",
  "Sanjaya narrating with divine vision in King Dhritarashtra's palace, grand ancient Indian palace interior, golden lamplight, wide composition",
  "Arjuna standing resolute with Gandiva bow, Krishna beside him on the chariot, Kurukshetra sunrise, wide panoramic landscape",
  "Krishna in his four-armed divine form on the battlefield, Arjuna in reverent awe, cosmic golden light, wide dramatic landscape",
  "Two vast armies facing each other on the Kurukshetra plain at dawn, golden chariots and flags, dramatic sky, wide panoramic landscape",
];

// ── Manifest types ──────────────────────────────────────────────────────────

export interface ChapterImage {
  chapterNumber: number;
  chapterTitle: string;
  imagePath: string;
  prompt: string;
  descriptionHi?: string;
  personasUsed?: string[];
  personaVersion?: number;
  generatedAt: string;
  sceneIndex?: number;
}

export interface ImageManifest {
  images: ChapterImage[];
  lastUpdated: string;
}

// ── Face Bank ───────────────────────────────────────────────────────────────

const FACES_DIR = path.join(DATA_DIR, "faces");
const FACE_MANIFEST = path.join(FACES_DIR, "face-manifest.json");

interface FaceEntry {
  characterName: string;
  imagePath: string;
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

function getFaceReferenceUrls(scene: string): string[] {
  const faces = readFaceManifest();
  if (faces.length === 0) return [];

  const baseUrl = process.env.PUBLIC_URL || "http://localhost:3001/api/gita/faces";
  const urls: string[] = [];

  const charPatterns: Array<[RegExp, string]> = [
    [/\bKrishna\b/i, "krishna_charioteer"],
    [/\bArjuna\b/i, "arjuna_warrior"],
    [/\bSanjaya\b/i, "sanjaya_narrator"],
    [/\bDhritarashtra\b/i, "dhritarashtra_blind"],
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

// ── Core functions ──────────────────────────────────────────────────────────

function ensureImageDir(): void {
  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

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

// ── Content-aware scene extraction ──────────────────────────────────────────

function extractChapterSubject(contentSnippet: string): string {
  const lines = contentSnippet.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 5)) {
    const devCount = (line.match(/[\u0900-\u097F]/gu) || []).length;
    const total = line.replace(/\s/g, "").length;
    if (
      devCount > 5 &&
      total > 0 &&
      devCount / total > 0.6 &&
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

function extractCharactersFromContent(contentSnippet: string): string[] {
  const characters: string[] = [];
  const charPatterns: Array<[RegExp, string]> = [
    [/कृष्ण/u, "Krishna"],
    [/अर्जुन|धनञ्जय/u, "Arjuna"],
    [/संजय/u, "Sanjaya"],
    [/धृतराष्ट्र/u, "Dhritarashtra"],
  ];

  for (const [pat, name] of charPatterns) {
    if (pat.test(contentSnippet) && !characters.includes(name)) {
      characters.push(name);
    }
  }
  return characters;
}

// ── AI Scene generation via Claude ──────────────────────────────────────────

export async function buildAIScenePrompt(
  chapterTitle: string,
  contentSnippet: string,
): Promise<{ scene: string; descriptionHi: string } | null> {
  const characters = extractCharactersFromContent(contentSnippet);
  const charList = characters.length > 0 ? `Characters present: ${characters.join(", ")}` : "";

  const systemPrompt = `You summarize chapters from the Bhagavad Gita and create image prompts. Respond ONLY with valid JSON.`;

  const userPrompt = `Chapter title: ${chapterTitle}
${charList}

Chapter content (Hindi/Sanskrit):
${contentSnippet.substring(0, 3000)}

Read the chapter content above carefully and do TWO things:

1. **summary_hi**: Write a 2-3 sentence Hindi summary of this chapter from the Bhagavad Gita — what is the key teaching, who is speaking, and what is the spiritual significance.

2. **scene_prompt**: Based on your summary, write a concise English scene description (40-60 words) of the single most important moment from this chapter. Focus on:
   - WHO: Name the characters (Krishna, Arjuna, Sanjaya, Dhritarashtra)
   - WHAT: The key teaching or event happening
   - WHERE: The setting (battlefield chariot, palace throne room, cosmic vision, etc.)
   Keep it simple and narrative-focused. Do NOT include style instructions.
   IMPORTANT: Avoid violent, aggressive, or graphic language. Describe the battlefield setting in a dignified, serene way suitable for devotional art.

IMPORTANT: The scene_prompt must be ENGLISH ONLY. No Hindi/Sanskrit text.

Respond in this exact JSON format only:
{"summary_hi": "...", "scene_prompt": "..."}`;

  // COST OPTIMIZATION: Together Llama first (cheap), Claude Haiku fallback
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const togetherKey = process.env.TOGETHER_API_KEY;

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
        logger.info({ chapterTitle, engine: "together-llama" }, "Gita AI scene prompt generated");
        return result;
      }
    } catch (err) {
      logger.warn({ err, chapterTitle }, "Together AI scene generation failed for Gita, trying Haiku fallback");
    }
  }

  if (anthropicKey) {
    try {
      const client = new Anthropic();
      const response = await client.messages.create({
        model: "claude-haiku-4-5", // cheap fallback (was sonnet)
        max_tokens: 600,
        messages: [{ role: "user", content: userPrompt }],
      });
      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const result = parseSceneJSON(text);
      if (result) {
        logger.info({ chapterTitle, engine: "anthropic-haiku" }, "Gita AI scene prompt generated (fallback)");
        return result;
      }
    } catch (err) {
      logger.warn({ err, chapterTitle }, "Anthropic Haiku scene generation failed for Gita");
    }
  }

  logger.info({ chapterTitle }, "No AI keys available for Gita scene generation, using rules");
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

// ── Scene detection ─────────────────────────────────────────────────────────

async function detectScenes(chapterTitle: string, contentSnippet: string, maxScenes: number = 3, chapterNumber?: number): Promise<string[]> {
  // COST: Check manifest for cached prompt from a prior generation
  if (chapterNumber !== undefined) {
    try {
      const manifest = readManifest();
      const existing = manifest.images
        .filter((img) => img.chapterNumber === chapterNumber && img.prompt)
        .sort((a, b) => (a.sceneIndex ?? 0) - (b.sceneIndex ?? 0));
      if (existing.length > 0) {
        (detectScenes as any)._lastDescriptions = existing.map((e) => e.descriptionHi || "");
        logger.info({ chapterNumber, cachedScenes: existing.length }, "Gita scene prompt cache HIT — skipping Claude");
        return existing.map((e) => e.prompt!).slice(0, maxScenes);
      }
    } catch { /* cache miss */ }
  }

  // FIRST: try AI-powered scene generation
  const aiScene = await buildAIScenePrompt(chapterTitle, contentSnippet);
  if (aiScene) {
    (detectScenes as any)._lastDescriptions = [aiScene.descriptionHi];
    return [aiScene.scene].slice(0, maxScenes);
  }

  // SECOND: try keyword-based scene matching
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
  return injectPersona(scene);
}

// ── Together AI image generation (FLUX.2-pro) ───────────────────────────────

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

async function generateWithTogether(prompt: string, destPath: string, model: string = "black-forest-labs/FLUX.2-pro"): Promise<void> {
  const apiKey = process.env.TOGETHER_API_KEY;
  if (!apiKey) throw new Error("TOGETHER_API_KEY not set");

  const styleSuffix = "\nRaja Ravi Varma style classic oil painting, soft painterly brushstrokes, NOT photorealistic. Warm golden sunlight, vibrant sky. Traditional Indian devotional art, serene atmosphere, museum quality fine art. Ancient Vedic era 5000 years ago — absolutely NO modern items, NO modern hairstyles, NO trimmed beards, NO glasses, NO modern clothing. ABSOLUTE GENDER RULES (NEVER VIOLATE): 1) WOMEN: Every single female character MUST have a completely smooth clean-shaven feminine face — absolutely ZERO facial hair, ZERO beard, ZERO mustache, ZERO stubble. Women have soft round cheeks, delicate jawline, kajal-lined eyes, long braided black hair decorated with flowers. 2) MEN: Every male character MUST have a clearly masculine face with strong angular jawline and broad shoulders. Men must NEVER have flowers in their hair — men wear topknots, crowns, turbans, or matted jata locks ONLY. 3) Make male and female characters visually DISTINCT. Ancient battlefield and palace settings only.";

  let fullPrompt = prompt + styleSuffix;

  const PROMPT_LIMIT = 2000;
  if (fullPrompt.length > PROMPT_LIMIT) {
    const maxPromptLen = PROMPT_LIMIT - styleSuffix.length;
    logger.warn({ originalLen: fullPrompt.length, truncatedTo: PROMPT_LIMIT }, "Truncating Gita prompt for FLUX");
    fullPrompt = prompt.substring(0, maxPromptLen) + styleSuffix;
  }

  logger.info({ promptLen: fullPrompt.length, sceneLen: prompt.length }, "Gita FLUX prompt composed");
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

      logger.info({ attempt, destPath }, "Gita Together AI image generated successfully");
      return;
    } catch (err: any) {
      lastError = err;
      logger.warn({ attempt, maxRetries: MAX_RETRIES, err: err?.message }, "Gita Together AI attempt failed");
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }

  throw lastError || new Error("Together AI failed after all retries");
}

// ── Main generation function ────────────────────────────────────────────────

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

  const scenes = await detectScenes(chapterTitle, contentSnippet, 1, chapterNumber);
  const generatedFiles: string[] = [];
  const manifest = readManifest();

  for (let sceneIdx = 0; sceneIdx < scenes.length; sceneIdx++) {
    const suffix = sceneIdx === 0 ? "" : `-${sceneIdx + 1}`;
    const filename = `chapter-${String(chapterNumber).padStart(2, "0")}${suffix}.jpg`;
    const destPath = path.join(IMAGES_DIR, filename);

    if (fs.existsSync(destPath)) {
      const stat = fs.statSync(destPath);
      if (stat.size > 10_000) {
        logger.info({ chapterNumber, filename, sceneIdx, size: stat.size }, "Gita chapter image already exists, skipping");
        generatedFiles.push(filename);
        continue;
      }
      logger.warn({ chapterNumber, filename, size: stat.size }, "Removing broken Gita image file");
      fs.unlinkSync(destPath);
    }

    const prompt = buildPrompt(scenes[sceneIdx], contentSnippet);

    try {
      logger.info({
        chapterNumber, sceneIdx, totalScenes: scenes.length,
        engine: "together-flux2",
      }, "Generating Gita chapter image");

      await generateWithTogether(prompt, destPath);

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
        prompt: scenes[sceneIdx],
        descriptionHi: descHi,
        personasUsed: personas.length > 0 ? personas : undefined,
        personaVersion: personas.length > 0 ? getPersonaGroupVersion(personas) : undefined,
        generatedAt: new Date().toISOString(),
        sceneIndex: sceneIdx,
      });

      generatedFiles.push(filename);
      logger.info({ chapterNumber, filename, sceneIdx }, "Gita chapter image generated successfully");
    } catch (err) {
      logger.warn({ chapterNumber, sceneIdx, err }, "Failed to generate Gita chapter image");
    }
  }

  manifest.images.sort((a, b) => {
    if (a.chapterNumber !== b.chapterNumber) return a.chapterNumber - b.chapterNumber;
    return (a.sceneIndex ?? 0) - (b.sceneIndex ?? 0);
  });
  writeManifest(manifest);

  return generatedFiles;
}

/**
 * Generate one additional scene for a chapter that already has image(s).
 */
export function generateAdditionalScene(
  chapterNumber: number,
  chapterTitle: string,
  contentSnippet: string,
): Promise<string[]> {
  return withManifestLock(async () => {
    ensureImageDir();
    const manifest = readManifest();
    const existing = manifest.images.filter(img => img.chapterNumber === chapterNumber);
    const nextSceneIdx = existing.length;

    const offset = Math.min(500, Math.floor(contentSnippet.length / 2));
    const altContent = contentSnippet.substring(offset) || contentSnippet;
    const scenes = await detectScenes(chapterTitle, altContent, 1);
    if (scenes.length === 0) return [];

    const suffix = nextSceneIdx === 0 ? "" : `-${nextSceneIdx + 1}`;
    const filename = `chapter-${String(chapterNumber).padStart(2, "0")}${suffix}.jpg`;
    const destPath = path.join(IMAGES_DIR, filename);

    if (fs.existsSync(destPath) && fs.statSync(destPath).size > 10_000) {
      logger.info({ chapterNumber, filename }, "Gita additional scene already exists");
      return [filename];
    }

    const prompt = buildPrompt(scenes[0], altContent);

    try {
      await generateWithTogether(prompt, destPath);
      if (!fs.existsSync(destPath) || fs.statSync(destPath).size < 10_000) return [];
      logger.info({ chapterNumber, filename, size: fs.statSync(destPath).size }, "Gita additional scene generated");

      const personas = detectPersonasInScene(scenes[0]);
      manifest.images.push({
        chapterNumber,
        sceneIndex: nextSceneIdx,
        imagePath: filename,
        prompt: scenes[0],
        descriptionHi: "",
        chapterTitle,
        personasUsed: personas,
        personaVersion: 1,
        generatedAt: new Date().toISOString(),
      });
      writeManifest(manifest);

      return [filename];
    } catch (err) {
      logger.error({ err, chapterNumber }, "Failed to generate Gita additional scene");
      return [];
    }
  });
}

/**
 * Force-regenerate images for a specific chapter.
 */
export function regenerateChapterImages(
  chapterNumber: number,
  chapterTitle: string,
  contentSnippet: string,
): Promise<{ files: string[]; trashIds: string[] }> {
  return withManifestLock(async () => {
    ensureImageDir();

    const manifest = readManifest();
    const existing = manifest.images.filter((img) => img.chapterNumber === chapterNumber);
    const trashIds: string[] = [];
    for (const img of existing) {
      const tid = trashImage(img, "regenerate");
      trashIds.push(tid);
    }
    manifest.images = manifest.images.filter((img) => img.chapterNumber !== chapterNumber);
    writeManifest(manifest);

    const files = await _generateChapterImages(chapterNumber, chapterTitle, contentSnippet);
    return { files, trashIds };
  });
}

/**
 * Scan batch text for chapter headings and generate images for new chapters.
 * Gita has only 18 chapters — no skandh/canto logic needed.
 */
export async function generateImagesForBatch(
  pages: Array<{ pageNumber: number; text: string }>,
): Promise<void> {
  const CHAPTER_HEADING_RE = /^(?:Chapter\s+\S+|अध्याय\s+(?:[\u0900-\u097F]+(?:\s+[\u0900-\u097F]+){0,2}|\d+))\s*$/iu;

  const hindiNums: Record<string, number> = {
    एक:1,दो:2,तीन:3,चार:4,पाँच:5,पांच:5,छः:6,छह:6,सात:7,आठ:8,नौ:9,दस:10,
    ग्यारह:11,बारह:12,तेरह:13,चौदह:14,पन्द्रह:15,पंद्रह:15,सोलह:16,सत्रह:17,
    अठारह:18,
  };

  function isHeading(t: string): boolean {
    const cleaned = t.replace(/^\d+\s+/, "");
    if (cleaned.length > 60) return false;
    if (t.includes("पूर्ण हुए") || t.includes("पूर्ण हुआ")) return false;
    return CHAPTER_HEADING_RE.test(cleaned);
  }

  function extractNum(line: string): number {
    const after = line.replace(/^(?:अध्याय|Chapter)\s*/iu, "").trim();
    if (after && hindiNums[after] !== undefined) return hindiNums[after];
    for (const [w, n] of Object.entries(hindiNums)) {
      if (line.includes(w)) return n;
    }
    const m = line.match(/\d+/);
    if (m) { const n = parseInt(m[0]); if (n > 0 && n <= 18) return n; }
    return 0;
  }

  for (const page of pages) {
    if (!page.text || page.text.length < 20) continue;
    const lines = page.text.split("\n");

    const headingCount = lines.filter(l => isHeading(l.trim())).length;
    if (headingCount >= 2) {
      logger.info({ pageNumber: page.pageNumber, headingCount }, "Gita: Skipping ToC page");
      continue;
    }

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!isHeading(trimmed)) continue;
      const chapterNum = extractNum(trimmed);
      if (chapterNum <= 0 || chapterNum > 18) continue;

      const chapterTitle = trimmed.substring(0, 60);
      logger.info({ chapterNum, chapterTitle }, "Gita: Detected chapter for image generation");

      const remainingLines = lines.slice(i + 1, i + 40).join("\n");
      const contentSnippet = remainingLines.substring(0, 2000);

      await generateChapterImages(chapterNum, chapterTitle, contentSnippet);
    }
  }
}

export function getPersonaGallery(): Array<{
  key: string;
  name: string;
  shortDescription: string;
  fullDescription: string;
  faceImage: string | null;
}> {
  let faceManifest: Array<{ characterName: string; imagePath: string }> = [];
  try {
    if (fs.existsSync(FACE_MANIFEST)) {
      faceManifest = JSON.parse(fs.readFileSync(FACE_MANIFEST, "utf-8"));
    }
  } catch { /* ignore */ }

  return Object.entries(CHARACTER_PERSONAS).map(([key, fullDesc]) => {
    const shortDesc = PERSONA_SHORT[key] || "";
    const name = shortDesc.split(":")[0]?.trim() || key.replace(/_/g, " ");
    const face = faceManifest.find(f => f.characterName === key);
    return {
      key,
      name,
      shortDescription: shortDesc.split(":").slice(1).join(":").trim(),
      fullDescription: fullDesc,
      faceImage: face ? face.imagePath : null,
    };
  });
}

export function getImagesDir(): string {
  ensureImageDir();
  return IMAGES_DIR;
}
