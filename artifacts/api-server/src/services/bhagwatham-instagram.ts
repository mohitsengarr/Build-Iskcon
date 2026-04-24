import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger";
import {
  buildAIScenePrompt,
  getImageManifest,
  type ChapterImage,
} from "./bhagwatham-image-gen";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "..", "..", "..", "..", "data", "bhagwatham");
const INSTAGRAM_DIR = path.join(DATA_DIR, "instagram");
const IG_MANIFEST_FILE = path.join(INSTAGRAM_DIR, "ig-manifest.json");

// ── Types ────────────────────────────────────────────────────────────────────

interface InstagramImage {
  chapterNumber: number;
  chapterTitle: string;
  cantoNumber?: number;
  sceneIndex: number;
  imagePath: string;         // local filename
  publicUrl?: string;        // Supabase Storage public URL
  prompt: string;
  caption: string;
  hashtags: string;
  bufferId?: string;         // Buffer post ID once queued (Instagram)
  bufferThreadsId?: string;  // Buffer post ID for Threads
  bufferStatus?: "queued" | "sent" | "error";
  generatedAt: string;
  queuedAt?: string;
}

interface InstagramManifest {
  images: InstagramImage[];
  lastUpdated: string;
}

// ── Supabase Storage ─────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
const STORAGE_BUCKET = "instagram-images";

async function uploadToSupabaseStorage(filePath: string, destName: string): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for storage upload");
  }

  const fileBuffer = fs.readFileSync(filePath);
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${destName}`;

  // Upsert the file
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "image/jpeg",
      "x-upsert": "true",
    },
    body: fileBuffer,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase storage upload failed ${res.status}: ${errText}`);
  }

  // Return public URL
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${destName}`;
}

/** Delete an image from Supabase Storage bucket */
async function deleteFromSupabaseStorage(filename: string): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return false;
  try {
    const deleteUrl = `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${filename}`;
    const res = await fetch(deleteUrl, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    logger.info({ filename, status: res.status }, "Supabase Storage delete");
    return res.ok;
  } catch (err) {
    logger.warn({ err, filename }, "Supabase Storage delete failed");
    return false;
  }
}

// ── Manifest helpers ─────────────────────────────────────────────────────────

function ensureInstagramDir() {
  if (!fs.existsSync(INSTAGRAM_DIR)) fs.mkdirSync(INSTAGRAM_DIR, { recursive: true });
}

function readIGManifest(): InstagramManifest {
  if (!fs.existsSync(IG_MANIFEST_FILE)) return { images: [], lastUpdated: new Date().toISOString() };
  try { return JSON.parse(fs.readFileSync(IG_MANIFEST_FILE, "utf-8")); }
  catch { return { images: [], lastUpdated: new Date().toISOString() }; }
}

function writeIGManifest(manifest: InstagramManifest) {
  ensureInstagramDir();
  manifest.lastUpdated = new Date().toISOString();
  fs.writeFileSync(IG_MANIFEST_FILE, JSON.stringify(manifest, null, 2) + "\n");
}

// ── FLUX.2-pro image generation (Instagram portrait format) ──────────────────

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

const INSTAGRAM_STYLE_SUFFIX = "\nRaja Ravi Varma style classic oil painting, soft painterly brushstrokes, NOT photorealistic. Warm golden sunlight, vibrant sky. Traditional Indian devotional art, serene atmosphere, museum quality fine art. Ancient Vedic era 5000 years ago — absolutely NO modern items, NO modern hairstyles, NO trimmed beards, NO glasses, NO modern clothing. ABSOLUTE GENDER RULES (NEVER VIOLATE): 1) WOMEN: Every single female character MUST have a completely smooth clean-shaven feminine face — absolutely ZERO facial hair, ZERO beard, ZERO mustache, ZERO stubble, ZERO shadow on chin or jaw. Women have soft round cheeks, delicate jawline, kajal-lined eyes, long braided black hair decorated with flowers and gold ornaments. 2) MEN: Every male character MUST have a clearly masculine face with strong angular jawline and broad shoulders. Men must NEVER have flowers in their hair — men wear topknots, crowns, turbans, or matted jata locks ONLY. Only Lord Krishna may wear a single peacock feather. 3) Make male and female characters visually DISTINCT — different body builds, different facial structures, different hair styles. Ancient ashram and forest settings only. Vertical portrait composition, centered subject.";

// Persona injection — reuse the same logic from image-gen
const PERSONA_SHORT: Record<string, string> = {
  krishna_adult: "Lord Krishna: MALE deity young man (strong masculine jawline, broad shoulders, bare masculine chest, NO feminine features), deep blue skin, peacock feather in curly black hair, golden crown, yellow silk dhoti, Kaustubha gem necklace, bamboo flute",
  krishna_child: "Baby Krishna: MALE divine infant boy, chubby blue-tinted, tiny peacock feather, gold anklets, playful smile",
  narada: "Sage Narada: MALE sage man (masculine face, strong jawline, NO feminine features), fair wheat-toned skin, clean-shaven, white U-shaped tilak, grey-streaked topknot, bare male chest, white dhoti, carrying tanpura veena",
  vyasa: "Sage Vyasa: MALE majestic dark-skinned elderly rishi, long silver-white beard, matted grey dreadlocks, bark-cloth garment, rudraksha mala",
  suta_goswami: "Suta Goswami: MALE elderly fair sage, short white beard, bald crown, saffron silk robes, rudraksha mala",
  shukadeva: "Shukadeva Goswami: MALE radiant young bald sage aged 16, luminous fair skin, large innocent eyes, simple white cloth, no ornaments",
  arjuna: "Arjuna: MALE tall muscular warrior prince, dark hair in tight topknot (NO flowers in hair), golden armor, carrying Gandiva bow",
  vishnu: "Lord Vishnu: MALE royal blue-skinned divine being, four arms holding conch discus mace lotus, tall golden crown, yellow silk",
  brahma: "Lord Brahma: MALE four-faced creator god, white beard, red-golden robes, holding Vedas and water pot",
  prahlada: "Prahlada: MALE young boy aged 6-7, warm brown skin, innocent devotional eyes, simple white kurta, tulsi mala",
  narasimha: "Lord Narasimha: fierce half-lion half-man, golden lion mane, blue-skinned muscular MALE torso, blazing golden eyes, sharp fangs",
  parikshit: "King Parikshit: MALE dignified middle-aged king, short dark beard, white renunciation cloth, sitting cross-legged",
  yashoda: "Mother Yashoda: FEMALE woman (smooth feminine face, absolutely NO beard NO facial hair NO mustache), beautiful middle-aged, loving face, dark hair with red sindoor and flowers, maroon silk sari with gold border",
  kunti: "Queen Kunti: FEMALE woman (smooth feminine face, absolutely NO beard NO facial hair NO mustache), dignified elderly, greying hair in bun, white and gold silk sari, sorrowful gentle eyes",
  draupadi: "Draupadi: FEMALE woman (smooth feminine face, absolutely NO beard NO facial hair NO mustache), beautiful young, dark olive skin, thick black wavy hair with jasmine flowers, red and gold silk sari",
  gandhari: "Queen Gandhari: FEMALE woman (smooth feminine face, absolutely NO beard NO facial hair NO mustache), elderly with white silk blindfold over eyes, white sari, greying hair covered with pallu",
  dhritarashtra: "King Dhritarashtra: MALE very old blind king, closed sunken eyes, long white beard, white garments, wooden walking staff",
  vidura: "Vidura: MALE wise dark-skinned middle-aged man, short grey beard, saffron dhoti, pilgrim's walking staff",
  bhishma: "Bhishma: MALE majestic elderly warrior, silver-white hair, long white beard, lying on bed of arrows",
  yudhishthira: "King Yudhishthira: MALE fair gentle-faced king, thin dark beard, white royal garments, simple golden crown",
};

function isChildKrishnaContext(scene: string): boolean {
  // Detect scenes where Krishna is a child/baby — check the FULL text for context clues
  const childPatterns = [
    /\b(?:child|infant|baby|toddler|little|young|boy)\b.*\bKrishna\b/i,
    /\bKrishna\b.*\b(?:child|infant|baby|toddler|little|boy|crawl|lap|cradle|lullaby|butter|ball)\b/i,
    /\b(?:mother|Yashoda|gopi|maiya)\b.*\b(?:embrace|lap|hold|nurse|feed|bathe)\b.*\bKrishna\b/i,
    /\bKrishna\b.*\b(?:embrace|lap|hold|nurse|feed|bathe)\b.*\b(?:mother|Yashoda|gopi|maiya)\b/i,
    /\bBaby\s*Krishna\b/i,
    /\bBal\s*Krishna\b|\bBala?\s*Gopal\b|\bGopal\b/i,
    /\b(?:Gokul|Vrindavan|Nandgaon)\b.*\bKrishna\b.*\b(?:play|steal|mischief|prank)\b/i,
    /\bmother.*placed.*(?:Him|Krishna).*lap/i,
    /\b(?:mothers|gopis)\s+(?:embraced|bathed|nursed)\b/i,
  ];
  return childPatterns.some(p => p.test(scene));
}

function injectPersona(scene: string): string {
  const checks: Array<[RegExp, string]> = [
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

  const matched: string[] = [];

  // Handle Krishna persona separately — context-aware child vs adult detection
  if (/\bKrishna\b|\bGopal\b/i.test(scene)) {
    const key = isChildKrishnaContext(scene) ? "krishna_child" : "krishna_adult";
    matched.push(PERSONA_SHORT[key]);
  }

  for (const [pattern, key] of checks) {
    if (pattern.test(scene) && PERSONA_SHORT[key] && !matched.includes(PERSONA_SHORT[key])) {
      matched.push(PERSONA_SHORT[key]);
    }
  }
  return matched.length > 0 ? `${matched.join(". ")}. Scene: ${scene}` : scene;
}

async function generateInstagramImage(prompt: string, destPath: string, seed?: number): Promise<void> {
  const apiKey = process.env.TOGETHER_API_KEY;
  if (!apiKey) throw new Error("TOGETHER_API_KEY not set");

  let fullPrompt = injectPersona(prompt) + INSTAGRAM_STYLE_SUFFIX;

  const PROMPT_LIMIT = 2000;
  if (fullPrompt.length > PROMPT_LIMIT) {
    const maxLen = PROMPT_LIMIT - INSTAGRAM_STYLE_SUFFIX.length;
    fullPrompt = injectPersona(prompt).substring(0, maxLen) + INSTAGRAM_STYLE_SUFFIX;
  }

  const body: Record<string, unknown> = {
    model: "black-forest-labs/FLUX.2-pro",
    prompt: fullPrompt,
    width: 1088,   // must be multiple of 16 for FLUX.2-pro (closest to 1080)
    height: 1344,  // 4:5 portrait — maximum Instagram feed real estate
  };

  // Use a consistent seed per chapter for visual consistency across scenes
  if (seed !== undefined) {
    body.seed = seed;
  }

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch("https://api.together.xyz/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
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
        fs.writeFileSync(destPath, Buffer.from(result.data[0].b64_json, "base64"));
      } else if (result.data?.[0]?.url) {
        const imgRes = await fetch(result.data[0].url);
        if (!imgRes.ok) throw new Error(`Image download failed: ${imgRes.status}`);
        fs.writeFileSync(destPath, Buffer.from(await imgRes.arrayBuffer()));
      } else {
        throw new Error("No image data in Together AI response");
      }

      logger.info({ attempt, destPath }, "Instagram image generated");
      return;
    } catch (err: any) {
      lastError = err;
      logger.warn({ attempt, err: err?.message }, "Instagram image attempt failed");
      if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  throw lastError || new Error("Instagram image generation failed after all retries");
}

// ── AI Caption Generation ────────────────────────────────────────────────────

async function generateCaption(
  chapterTitle: string,
  scenePrompt: string,
  summaryHi: string | undefined,
  cantoNumber?: number,
  chapterNumber?: number,
): Promise<{ caption: string; hashtags: string }> {
  const togetherKey = process.env.TOGETHER_API_KEY;

  const cantoChapterLine = cantoNumber && chapterNumber
    ? `Canto ${cantoNumber}, Chapter ${chapterNumber}`
    : chapterNumber
      ? `Chapter ${chapterNumber}`
      : "";

  const systemPrompt = `You write devotional story narratives for Srimad Bhagavatam Instagram posts. You are fluent in both Hindi (Devanagari) and English. Respond ONLY with valid JSON.`;

  const userPrompt = `Chapter: ${chapterTitle}
${cantoChapterLine ? `Reference: Srimad Bhagavatam — ${cantoChapterLine}` : ""}
Scene: ${scenePrompt}
${summaryHi ? `Hindi summary (existing): ${summaryHi}` : ""}

Generate FIVE separate text fields for this scene. Every field is REQUIRED — do not skip any.

1. **chapter_title_hi**: Translate the chapter title "${chapterTitle}" into Hindi Devanagari (e.g. "अध्याय दो — हृदय में भगवान्"). One line only.

2. **story_hi**: Tell the SPECIFIC story of this scene in simple Hindi Devanagari. 4-6 sentences. Describe the characters (पात्र), what is happening (क्या हो रहा है), and the spiritual significance (आध्यात्मिक संदेश). Write natural flowing Hindi — not a translation of the English. DO NOT write English words in this field. USE ONLY Devanagari script.

3. **story_en**: Tell the SAME story in English. 4-6 sentences. Describe who the characters are, what happens, and the spiritual meaning. This should narrate the specific event from this chapter, not a generic devotional line.

4. **reflection_hi**: One-line devotional reflection in Hindi Devanagari (single sentence, Hindi script only).

5. **reflection_en**: The same reflection in English (single sentence).

6. **hashtags**: Five relevant hashtags separated by spaces. Always include #SrimadBhagavatam and #ISKCON. Add 3 scene-specific ones.

STRICT RULES:
- story_hi and reflection_hi MUST be in Hindi Devanagari script (देवनागरी) — no English words, no Roman transliteration.
- story_en and reflection_en MUST be in English.
- All text fields must contain actual narrative content — no placeholders, no brackets, no "TODO".
- story_hi and story_en must tell the SAME story but written independently in each language.

Return JSON with EXACTLY these keys:
{"chapter_title_hi": "...", "story_hi": "...", "story_en": "...", "reflection_hi": "...", "reflection_en": "...", "hashtags": "#tag1 #tag2 #tag3 #tag4 #tag5"}`;

  // Detect Devanagari script to verify the Hindi fields really are in Hindi
  const hasDevanagari = (s: string): boolean => /[\u0900-\u097F]/.test(s);

  const DEFAULT_HASHTAGS = "#SrimadBhagavatam #ISKCON #BhagavatamArt #Devotion #Krishna";

  // Assemble the final caption deterministically from AI-generated fields.
  // This way the Hindi section CANNOT be missed — the code composes it, not the AI.
  const assembleCaption = (fields: {
    chapter_title_hi?: string;
    story_hi?: string;
    story_en?: string;
    reflection_hi?: string;
    reflection_en?: string;
  }): string => {
    const parts: string[] = [];
    const header = cantoChapterLine
      ? `📖 Srimad Bhagavatam — ${cantoChapterLine}`
      : `📖 ${chapterTitle}`;
    parts.push(header);
    if (fields.chapter_title_hi?.trim()) parts.push(fields.chapter_title_hi.trim());
    parts.push(""); // blank line

    if (fields.story_hi?.trim()) {
      parts.push(fields.story_hi.trim());
      parts.push(""); // blank line
    }
    if (fields.story_en?.trim()) {
      parts.push(fields.story_en.trim());
      parts.push(""); // blank line
    }

    if (fields.reflection_hi?.trim()) parts.push(fields.reflection_hi.trim());
    if (fields.reflection_en?.trim()) parts.push(fields.reflection_en.trim());
    parts.push(""); // blank line

    parts.push("🙏 हरे कृष्ण हरे कृष्ण कृष्ण कृष्ण हरे हरे");
    parts.push("हरे राम हरे राम राम राम हरे हरे");

    return parts.join("\n").replace(/\n{3,}/g, "\n\n");
  };

  const tryParseCaption = (text: string) => {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      // Validate: story_hi must contain Devanagari
      if (!parsed.story_hi || !hasDevanagari(String(parsed.story_hi))) {
        logger.warn({ sample: String(parsed.story_hi || "").substring(0, 80) }, "Caption missing Hindi story — will retry");
        return null;
      }
      if (!parsed.story_en || parsed.story_en.length < 30) {
        logger.warn("Caption missing English story — will retry");
        return null;
      }
      const caption = assembleCaption(parsed);
      return {
        caption,
        hashtags: (parsed.hashtags as string) || DEFAULT_HASHTAGS,
      };
    } catch { /* invalid */ }
    return null;
  };

  // COST: Claude Haiku (12× cheaper than Sonnet) handles Hindi + English fine.
  // Keep Claude as primary here because Hindi Devanagari output is its strength.
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic();
      const response = await client.messages.create({
        model: "claude-haiku-4-5", // was claude-sonnet-4-6
        max_tokens: 1000,
        messages: [{ role: "user", content: `${systemPrompt}\n\n${userPrompt}` }],
      });
      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const result = tryParseCaption(text);
      if (result) {
        logger.info("Caption generated via Anthropic Haiku");
        return result;
      }
    } catch (err) {
      logger.warn({ err }, "Anthropic caption generation failed, trying Together AI");
    }
  }

  // Fallback: Together AI / Llama
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
          max_tokens: 1000,
          temperature: 0.7,
        }),
      });
      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      const text = data.choices?.[0]?.message?.content || "";
      const result = tryParseCaption(text);
      if (result) return result;
    } catch (err) {
      logger.warn({ err }, "Caption generation failed, using fallback");
    }
  }

  // Fallback caption — always bilingual. Uses summaryHi if present, otherwise a generic Hindi line.
  const fallbackStoryHi = summaryHi && hasDevanagari(summaryHi)
    ? summaryHi
    : "यह दृश्य श्रीमद्भागवत् से है — भगवान् की लीलाओं का दिव्य वर्णन। भक्त इन कथाओं के श्रवण से मुक्ति पाते हैं।";
  const fallbackStoryEn = "A scene from Srimad Bhagavatam — the timeless wisdom of the Supreme Lord, narrated for the upliftment of all souls.";
  const fallbackCaption = assembleCaption({
    story_hi: fallbackStoryHi,
    story_en: fallbackStoryEn,
    reflection_hi: "हरि ॐ तत् सत्।",
    reflection_en: "Glory to Lord Krishna.",
  });
  return {
    caption: fallbackCaption,
    hashtags: DEFAULT_HASHTAGS,
  };
}

// ── Multi-Scene AI Generation ────────────────────────────────────────────────

async function generateMultipleScenes(
  chapterTitle: string,
  contentSnippet: string,
  numScenes: number = 4,
): Promise<Array<{ scene: string; summaryHi: string }>> {
  const togetherKey = process.env.TOGETHER_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  const systemPrompt = `You analyze Srimad Bhagavatam chapters and create image prompts. Respond ONLY with valid JSON.`;

  const userPrompt = `Chapter title: ${chapterTitle}

Chapter content (Hindi/Sanskrit):
${contentSnippet.substring(0, 3000)}

Read the chapter content carefully and identify the ${numScenes} most important ACTUAL STORY EVENTS that happen in this specific chapter. Do NOT create generic devotional scenes — each scene must depict a SPECIFIC EVENT from the chapter text above.

For EACH scene:

1. **scene_prompt**: A SPECIFIC scene description (50-80 words) showing EXACTLY what is happening in the story.
   - Name ALL characters involved (Krishna, Arjuna, Narada, etc.)
   - CRITICAL: Always specify each character's AGE/FORM explicitly. Is Krishna a baby, a child (age 5-7), a young boy (age 10-12), or an adult? Say "Baby Krishna", "child Krishna", "young boy Krishna", or "Lord Krishna" accordingly. Same for other characters — "young prince Parikshit" vs "King Parikshit".
   - Describe the SPECIFIC ACTION: What is each character doing? What is the conflict or event?
   - Describe the SPECIFIC SETTING: Where exactly does this take place? (forest, river bank, battlefield, palace, etc.)
   - Include VISUAL DETAILS from the story: objects, weapons, animals, elements (fire, water, etc.)
   - Example of GOOD prompt: "Baby Krishna lies on mother Yashoda's lap in the courtyard of Nanda's house in Gokul, while elderly gopi women surround them, pouring blessings, tears of joy streaming down their faces, oil lamps glowing in the evening light"
   - Example of BAD prompt: "Krishna protects inhabitants with divine intervention" (too vague, no story, no age specified)

   IMPORTANT: No violent/graphic language. Describe conflicts in a dignified way.
   IMPORTANT: Each scene MUST show a DIFFERENT moment in the chapter's storyline, in chronological order.
   IMPORTANT: The scene prompt will be used DIRECTLY to generate an image. The image MUST match the story text. If the story describes a child, the prompt MUST say "child". If the story describes a king, say "king".

2. **summary_hi**: 2-3 sentence Hindi summary of this specific story event, describing what happens.

Return JSON array: [{"scene_prompt": "...", "summary_hi": "..."}, ...]`;

  const tryParse = (text: string) => {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;
    try {
      const arr = JSON.parse(jsonMatch[0]);
      if (Array.isArray(arr) && arr.length > 0 && arr[0].scene_prompt) {
        return arr.map((s: any) => ({ scene: s.scene_prompt, summaryHi: s.summary_hi || "" }));
      }
    } catch { /* invalid */ }
    return null;
  };

  // COST: Together Llama first (10× cheaper), Claude Haiku fallback
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
          max_tokens: 1200,
          temperature: 0.7,
        }),
      });
      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      const text = data.choices?.[0]?.message?.content || "";
      const result = tryParse(text);
      if (result) {
        logger.info({ chapterTitle, count: result.length, engine: "together" }, "Multi-scene prompts generated");
        return result.slice(0, numScenes);
      }
    } catch (err) {
      logger.warn({ err }, "Together multi-scene failed, trying Haiku fallback");
    }
  }

  // Claude Haiku fallback (cheaper than Sonnet)
  if (anthropicKey) {
    try {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic();
      const response = await client.messages.create({
        model: "claude-haiku-4-5", // was claude-sonnet-4-6
        max_tokens: 1200,
        messages: [{ role: "user", content: userPrompt }],
      });
      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const result = tryParse(text);
      if (result) {
        logger.info({ chapterTitle, count: result.length, engine: "anthropic-haiku" }, "Multi-scene prompts generated (fallback)");
        return result.slice(0, numScenes);
      }
    } catch (err) {
      logger.warn({ err }, "Anthropic Haiku multi-scene failed");
    }
  }

  // Last resort: use single scene from existing system
  const single = await buildAIScenePrompt(chapterTitle, contentSnippet);
  if (single) return [{ scene: single.scene, summaryHi: single.descriptionHi }];

  return [{ scene: `A serene scene from ${chapterTitle} in an ancient forest ashram by a sacred river`, summaryHi: "" }];
}

// ── Buffer API Integration ───────────────────────────────────────────────────

const BUFFER_API_URL = "https://api.buffer.com";

async function bufferGraphQL(query: string, variables?: Record<string, unknown>): Promise<any> {
  const apiKey = process.env.BUFFER_API_KEY;
  if (!apiKey) throw new Error("BUFFER_API_KEY not set");

  const res = await fetch(BUFFER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Buffer API error ${res.status}: ${errText}`);
  }

  return res.json();
}

export async function getBufferChannels(): Promise<Array<{ id: string; name: string; service: string }>> {
  const result = await bufferGraphQL(`
    query {
      account {
        organizations {
          id
          channels {
            id
            name
            service
          }
        }
      }
    }
  `);

  const channels: Array<{ id: string; name: string; service: string }> = [];
  const orgs = result?.data?.account?.organizations || [];
  for (const org of orgs) {
    for (const ch of org.channels || []) {
      channels.push({ id: ch.id, name: ch.name, service: ch.service });
    }
  }
  return channels;
}

export async function getInstagramChannelId(): Promise<string | null> {
  const channels = await getBufferChannels();
  const ig = channels.find((c) => c.service === "instagram");
  return ig?.id || null;
}

export async function getThreadsChannelId(): Promise<string | null> {
  const channels = await getBufferChannels();
  const threads = channels.find((c) => c.service === "threads");
  return threads?.id || null;
}

async function getPublishChannelIds(): Promise<string[]> {
  const channels = await getBufferChannels();
  const ids: string[] = [];
  for (const ch of channels) {
    if (ch.service === "instagram" || ch.service === "threads") {
      ids.push(ch.id);
    }
  }
  return ids;
}

async function queueToBuffer(
  imageUrl: string,
  caption: string,
  hashtags: string,
  channelId: string,
  service: "instagram" | "threads" = "instagram",
): Promise<{ postId: string; status: string }> {
  let fullCaption = `${caption}\n\n${hashtags}`;

  // Threads has a 500 character limit — shrink each section proportionally
  // so BOTH Hindi and English story sections survive.
  if (service === "threads" && fullCaption.length > 500) {
    const lines = caption.split("\n");
    // Script-based classification: a line with Devanagari is Hindi, otherwise English.
    const hasDevanagari = (s: string) => /[\u0900-\u097F]/.test(s);
    // Find the header (first line starting with 📖) and mantra (🙏) to preserve
    const headerIdx = lines.findIndex((l) => l.includes("📖"));
    const mantraIdx = lines.findIndex((l) => l.includes("🙏"));
    const header = headerIdx >= 0 ? lines[headerIdx] : (lines[0] || "");
    // Find the chapter title Hindi line (line right after header with Devanagari)
    const chapterTitleHi = headerIdx >= 0 && lines[headerIdx + 1] && hasDevanagari(lines[headerIdx + 1])
      ? lines[headerIdx + 1]
      : "";
    // Collect story content between chapter title and mantra
    const storyStart = chapterTitleHi ? headerIdx + 2 : headerIdx + 1;
    const storyEnd = mantraIdx >= 0 ? mantraIdx : lines.length;
    const storyLines = lines.slice(storyStart, storyEnd).filter((l) => l.trim());
    const hindiStoryLines = storyLines.filter((l) => hasDevanagari(l));
    const englishStoryLines = storyLines.filter((l) => !hasDevanagari(l));

    const fixedChars = header.length + chapterTitleHi.length + hashtags.length + 20; // 20 for newlines/mantra
    const mantraShort = "🙏 हरे कृष्ण"; // short form to save chars
    const availableForStory = 500 - fixedChars - mantraShort.length;

    // Split available budget 50/50 between Hindi and English
    const perSide = Math.floor(availableForStory / 2) - 4;
    const truncate = (s: string, max: number) =>
      s.length > max ? s.substring(0, max - 1).trim() + "…" : s;

    const hindiText = truncate(hindiStoryLines.join(" ").trim(), Math.max(60, perSide));
    const englishText = truncate(englishStoryLines.join(" ").trim(), Math.max(60, perSide));

    const parts = [header];
    if (chapterTitleHi) parts.push(chapterTitleHi);
    parts.push("");
    if (hindiText) parts.push(hindiText);
    if (englishText) parts.push(englishText);
    parts.push("");
    parts.push(mantraShort);
    parts.push("");
    parts.push(hashtags);
    fullCaption = parts.join("\n").replace(/\n{3,}/g, "\n\n");

    if (fullCaption.length > 500) {
      // Hard truncate as last resort
      fullCaption = fullCaption.substring(0, 497) + "...";
    }
  }

  const mutation = `
    mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        ... on PostActionSuccess {
          post {
            id
            status
            dueAt
          }
        }
        ... on MutationError {
          message
        }
      }
    }
  `;

  const input: Record<string, unknown> = {
    text: fullCaption,
    channelId,
    schedulingType: "automatic",
    mode: "shareNow",
    assets: {
      images: [{ url: imageUrl }],
    },
  };

  // Instagram needs specific metadata; Threads doesn't need it
  if (service === "instagram") {
    input.metadata = {
      instagram: {
        type: "post",
        shouldShareToFeed: true,
      },
    };
  }

  const result = await bufferGraphQL(mutation, { input });

  const post = result?.data?.createPost?.post;
  if (post) {
    return { postId: post.id, status: post.status || "queued" };
  }

  const error = result?.data?.createPost?.message || "Unknown Buffer error";
  throw new Error(`Buffer createPost failed: ${error}`);
}

/**
 * Publish to all channels (Instagram + Threads) and return results.
 */
async function publishToAllChannels(
  imageUrl: string,
  caption: string,
  hashtags: string,
): Promise<Array<{ channelService: string; postId: string }>> {
  const channels = await getBufferChannels();
  const targets = channels.filter((c) => c.service === "instagram" || c.service === "threads");
  const results: Array<{ channelService: string; postId: string }> = [];

  for (const ch of targets) {
    try {
      const res = await queueToBuffer(imageUrl, caption, hashtags, ch.id, ch.service as "instagram" | "threads");
      results.push({ channelService: ch.service, postId: res.postId });
      logger.info({ service: ch.service, postId: res.postId }, "Published to Buffer channel");
    } catch (err) {
      logger.warn({ err, service: ch.service }, "Failed to publish to channel");
    }
  }

  return results;
}

/**
 * Delete a Buffer post by its ID (works for both Instagram and Threads).
 */
async function deleteBufferPost(postId: string): Promise<boolean> {
  try {
    const mutation = `
      mutation DeletePost($postId: ID!) {
        deletePost(input: { postId: $postId }) {
          ... on PostActionSuccess {
            post { id status }
          }
          ... on MutationError {
            message
          }
        }
      }
    `;
    const result = await bufferGraphQL(mutation, { postId });
    const success = !!result?.data?.deletePost?.post;
    logger.info({ postId, success }, "Buffer deletePost result");
    return success;
  } catch (err) {
    logger.warn({ err, postId }, "Buffer deletePost failed");
    return false;
  }
}

/**
 * Delete old IG/Threads posts via Buffer, remove from manifest, regenerate new image, requeue.
 * Returns the new manifest entry.
 */
/**
 * Delete an IG image permanently — removes from manifest, Buffer, Supabase Storage, and local disk.
 * Does NOT regenerate. Use this for removing bad images.
 */
export async function deleteIGImage(
  chapterNumber: number,
  sceneIndex: number,
): Promise<{ success: boolean; deleted: string[] }> {
  const manifest = readIGManifest();
  const deleted: string[] = [];

  const existingIdx = manifest.images.findIndex(
    (img) => img.chapterNumber === chapterNumber && img.sceneIndex === sceneIndex,
  );
  const existing = existingIdx >= 0 ? manifest.images[existingIdx] : null;

  if (!existing) return { success: false, deleted };

  // 1. Delete Buffer posts (Instagram + Threads)
  if (existing.bufferId) {
    const ok = await deleteBufferPost(existing.bufferId);
    if (ok) deleted.push(`instagram:${existing.bufferId}`);
  }
  if (existing.bufferThreadsId) {
    const ok = await deleteBufferPost(existing.bufferThreadsId);
    if (ok) deleted.push(`threads:${existing.bufferThreadsId}`);
  }

  // 2. Delete from Supabase Storage
  if (existing.imagePath) {
    await deleteFromSupabaseStorage(existing.imagePath);
    deleted.push(`supabase:${existing.imagePath}`);
  }

  // 3. Delete local file
  const localPath = path.join(INSTAGRAM_DIR, existing.imagePath);
  if (fs.existsSync(localPath)) {
    fs.unlinkSync(localPath);
    deleted.push(`local:${existing.imagePath}`);
  }

  // 4. Remove from manifest
  manifest.images.splice(existingIdx, 1);
  writeIGManifest(manifest);

  logger.info({ chapterNumber, sceneIndex, deleted }, "IG image permanently deleted (no regeneration)");
  return { success: true, deleted };
}

export async function deleteAndRegenerateIG(
  chapterNumber: number,
  sceneIndex: number,
): Promise<{ success: boolean; deleted: string[]; newEntry?: InstagramImage }> {
  // Step 1: Delete fully (including Supabase Storage)
  const { deleted } = await deleteIGImage(chapterNumber, sceneIndex);

  // Step 2: Regenerate
  const manifest = readIGManifest();
  const existing = manifest.images.find(
    (img) => img.chapterNumber === chapterNumber,
  );
  const chapterTitle = existing?.chapterTitle || `Chapter ${chapterNumber}`;

  try {
    const result = await generateInstagramForChapter(
      chapterNumber, chapterTitle, existing?.caption || "Regenerated scene",
      { numScenes: 1, cantoNumber: existing?.cantoNumber, queueToBuffer: true, forceRegenerate: false },
    );
    const updatedManifest = readIGManifest();
    const newEntry = updatedManifest.images.find(
      (img) => img.chapterNumber === chapterNumber && img.sceneIndex === sceneIndex,
    );
    return { success: true, deleted, newEntry: newEntry || undefined };
  } catch (err) {
    logger.error({ err, chapterNumber, sceneIndex }, "Failed to regenerate IG image");
    return { success: false, deleted };
  }
}

// ── Main public API ──────────────────────────────────────────────────────────

/**
 * Generate 3-4 Instagram-friendly images for a chapter and optionally queue to Buffer.
 */
export async function generateInstagramForChapter(
  chapterNumber: number,
  chapterTitle: string,
  contentSnippet: string,
  options: { queueToBuffer?: boolean; numScenes?: number; cantoNumber?: number; chapterInCanto?: number; forceRegenerate?: boolean } = {},
): Promise<{
  generated: number;
  queued: number;
  images: InstagramImage[];
}> {
  const numScenes = options.numScenes || 4;
  const cantoNumber = options.cantoNumber;
  const chapterInCanto = options.chapterInCanto; // chapter number within the canto (e.g. 79 in canto 10), NOT global 280
  ensureInstagramDir();

  const manifest = readIGManifest();
  const results: InstagramImage[] = [];
  let queued = 0;

  // Check if already generated (skip check if forceRegenerate)
  if (!options.forceRegenerate) {
    const existing = manifest.images.filter((img) => img.chapterNumber === chapterNumber);
    if (existing.length >= numScenes) {
      logger.info({ chapterNumber, existing: existing.length }, "Instagram images already exist for chapter");
      return { generated: 0, queued: 0, images: existing };
    }
  } else {
    // Remove existing entries for this chapter so they get regenerated
    manifest.images = manifest.images.filter((img) => img.chapterNumber !== chapterNumber);
  }

  // Generate multiple scene prompts
  logger.info({ chapterNumber, chapterTitle, numScenes }, "Generating Instagram scenes");
  const scenes = await generateMultipleScenes(chapterTitle, contentSnippet, numScenes);

  // Use a consistent seed derived from chapter number for visual consistency across scenes
  const chapterSeed = chapterNumber * 1000;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const filename = `ig-chapter-${String(chapterNumber).padStart(3, "0")}-scene-${i + 1}.jpg`;
    const destPath = path.join(INSTAGRAM_DIR, filename);

    // Skip if file already exists and is valid (unless forceRegenerate)
    if (!options.forceRegenerate && fs.existsSync(destPath) && fs.statSync(destPath).size > 10_000) {
      logger.info({ filename }, "Instagram image already exists, skipping generation");
      const existingEntry = manifest.images.find(
        (img) => img.chapterNumber === chapterNumber && img.sceneIndex === i
      );
      if (existingEntry) {
        results.push(existingEntry);
        continue;
      }
    }

    try {
      // Generate the image with chapter seed for consistent character appearance
      logger.info({ chapterNumber, scene: i + 1, total: scenes.length }, "Generating Instagram image");
      await generateInstagramImage(scene.scene, destPath, chapterSeed + i);

      // Verify file
      if (!fs.existsSync(destPath) || fs.statSync(destPath).size < 10_000) {
        logger.warn({ filename }, "Generated Instagram image too small, skipping");
        continue;
      }

      // Generate caption with canto/chapter info — use chapterInCanto for display
      // (e.g. "Canto 10, Chapter 79") not the global number (280)
      const displayChapterNum = chapterInCanto || chapterNumber;
      const { caption, hashtags } = await generateCaption(
        chapterTitle, scene.scene, scene.summaryHi, cantoNumber, displayChapterNum,
      );

      // Upload to Supabase Storage for public URL
      let publicUrl: string | undefined;
      try {
        publicUrl = await uploadToSupabaseStorage(destPath, filename);
        logger.info({ filename, publicUrl }, "Uploaded to Supabase Storage");
      } catch (err) {
        logger.warn({ err, filename }, "Supabase upload failed — image saved locally only");
      }

      const entry: InstagramImage = {
        chapterNumber,
        chapterTitle,
        cantoNumber,
        sceneIndex: i,
        imagePath: filename,
        publicUrl,
        prompt: scene.scene,
        caption,
        hashtags,
        generatedAt: new Date().toISOString(),
      };

      // Publish to all channels (Instagram + Threads) if requested
      if (options.queueToBuffer && publicUrl) {
        try {
          const publishResults = await publishToAllChannels(publicUrl, caption, hashtags);
          for (const pr of publishResults) {
            if (pr.channelService === "instagram") entry.bufferId = pr.postId;
            if (pr.channelService === "threads") entry.bufferThreadsId = pr.postId;
          }
          if (publishResults.length > 0) {
            entry.bufferStatus = "sent";
            entry.queuedAt = new Date().toISOString();
            queued++;
          }
          logger.info({ chapterNumber, scene: i + 1, channels: publishResults.length }, "Published to Buffer channels");
        } catch (err) {
          logger.warn({ err, chapterNumber, scene: i + 1 }, "Buffer publish failed");
          entry.bufferStatus = "error";
        }
      }

      // Update manifest
      manifest.images = manifest.images.filter(
        (img) => !(img.chapterNumber === chapterNumber && img.sceneIndex === i)
      );
      manifest.images.push(entry);
      results.push(entry);
    } catch (err) {
      logger.warn({ err, chapterNumber, scene: i + 1 }, "Failed to generate Instagram image");
    }
  }

  // Sort and save manifest
  manifest.images.sort((a, b) => {
    if (a.chapterNumber !== b.chapterNumber) return a.chapterNumber - b.chapterNumber;
    return a.sceneIndex - b.sceneIndex;
  });
  writeIGManifest(manifest);

  return { generated: results.length, queued, images: results };
}

/**
 * Queue existing (already generated) Instagram images to Buffer.
 */
export async function queueChapterToBuffer(
  chapterNumber: number,
): Promise<{ queued: number; errors: number }> {
  const manifest = readIGManifest();
  // Find images that haven't been published to at least one channel
  const images = manifest.images.filter(
    (img) => img.chapterNumber === chapterNumber && !img.bufferId && !img.bufferThreadsId
  );

  if (images.length === 0) {
    return { queued: 0, errors: 0 };
  }

  let queued = 0;
  let errors = 0;

  for (const img of images) {
    if (!img.publicUrl) {
      // Try uploading first
      const localPath = path.join(INSTAGRAM_DIR, img.imagePath);
      if (!fs.existsSync(localPath)) { errors++; continue; }
      try {
        img.publicUrl = await uploadToSupabaseStorage(localPath, img.imagePath);
      } catch { errors++; continue; }
    }

    try {
      const publishResults = await publishToAllChannels(img.publicUrl, img.caption, img.hashtags);
      for (const pr of publishResults) {
        if (pr.channelService === "instagram") img.bufferId = pr.postId;
        if (pr.channelService === "threads") img.bufferThreadsId = pr.postId;
      }
      if (publishResults.length > 0) {
        img.bufferStatus = "sent";
        img.queuedAt = new Date().toISOString();
        queued++;
      } else {
        errors++;
      }
    } catch {
      img.bufferStatus = "error";
      errors++;
    }
  }

  writeIGManifest(manifest);
  return { queued, errors };
}

/**
 * Get the Instagram manifest — all generated images and their Buffer status.
 */
export function getInstagramManifest(): InstagramManifest {
  return readIGManifest();
}

/**
 * Get Instagram images directory path.
 */
export function getInstagramDir(): string {
  ensureInstagramDir();
  return INSTAGRAM_DIR;
}

/**
 * Publish a single manifest entry to all channels (Instagram + Threads).
 * Updates the manifest in place.
 */
export async function publishSinglePost(
  entry: { chapterNumber: number; sceneIndex: number; publicUrl?: string; caption: string; hashtags: string },
): Promise<Array<{ channelService: string; postId: string }>> {
  if (!entry.publicUrl) throw new Error("No public URL for image");

  const results = await publishToAllChannels(entry.publicUrl, entry.caption, entry.hashtags);

  // Update manifest
  const manifest = readIGManifest();
  const img = manifest.images.find(
    (i) => i.chapterNumber === entry.chapterNumber && i.sceneIndex === entry.sceneIndex
  );
  if (img) {
    for (const r of results) {
      if (r.channelService === "instagram") img.bufferId = r.postId;
      if (r.channelService === "threads") img.bufferThreadsId = r.postId;
    }
    if (results.length > 0) {
      img.bufferStatus = "sent";
      img.queuedAt = new Date().toISOString();
    }
    writeIGManifest(manifest);
  }

  return results;
}
