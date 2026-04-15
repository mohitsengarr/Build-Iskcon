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

const INSTAGRAM_STYLE_SUFFIX = "\nRaja Ravi Varma style classic oil painting, soft painterly brushstrokes, NOT photorealistic. Warm golden sunlight, vibrant sky. Traditional Indian devotional art, serene atmosphere, museum quality fine art. Ancient Vedic era 5000 years ago — absolutely NO modern items, NO modern hairstyles, NO trimmed beards, NO glasses, NO modern clothing. All men have long flowing uncut beards and matted jata hair or topknots as per ancient Vedic tradition. Women have long braided hair with flowers. Smooth feminine faces for women, no facial hair on women. Ancient ashram and forest settings only. Vertical portrait composition, centered subject.";

// Persona injection — reuse the same logic from image-gen
const PERSONA_SHORT: Record<string, string> = {
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
  draupadi: "Draupadi: beautiful young woman, dark olive skin, thick black wavy hair with jasmine flowers, red and gold silk sari",
  gandhari: "Queen Gandhari: elderly woman with white silk blindfold over eyes, white sari, greying hair covered with pallu",
  dhritarashtra: "King Dhritarashtra: very old blind king, closed sunken eyes, long white beard, white garments, wooden walking staff",
  vidura: "Vidura: wise dark-skinned middle-aged man, short grey beard, saffron dhoti, pilgrim's walking staff",
  bhishma: "Bhishma: majestic elderly warrior, silver-white hair, long white beard, lying on bed of arrows",
  yudhishthira: "King Yudhishthira: fair gentle-faced king, thin dark beard, white royal garments, simple golden crown",
};

function injectPersona(scene: string): string {
  const checks: Array<[RegExp, string]> = [
    [/\bBaby\b.*\bKrishna\b/i, "krishna_child"],
    [/\b(?:child|infant|baby)\b.*\bKrishna\b/i, "krishna_child"],
    [/\bKrishna\b(?!.*\b(?:child|infant|baby)\b)/i, "krishna_adult"],
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

  const systemPrompt = `You write Instagram captions for devotional art from Srimad Bhagavatam. Respond ONLY with valid JSON.`;

  const userPrompt = `Chapter: ${chapterTitle}
${cantoChapterLine ? `Reference: Srimad Bhagavatam — ${cantoChapterLine}` : ""}
Scene: ${scenePrompt}
${summaryHi ? `Hindi summary: ${summaryHi}` : ""}

Write an Instagram caption for this Srimad Bhagavatam illustration. The caption must tell the ACTUAL STORY shown in the scene — not generic devotional text.

1. **caption**: Write a BILINGUAL (Hindi + English) story-driven caption (12-16 lines). Structure it as:
   - Line 1: "📖 श्रीमद्भागवतम् — ${cantoChapterLine || chapterTitle}"
   - Line 2: A relevant Sanskrit shlok from this chapter (in Devanagari script)
   - Line 3: Hindi meaning of the shlok (1-2 lines)
   - Line 4: English translation of the shlok (1-2 lines)
   - Line 5-6: HINDI narration — Tell the story in simple Hindi (3-4 lines). Who are the characters? What is happening in this scene?
   - Line 7-10: ENGLISH narration — Narrate the SAME story in English (4-5 lines):
     * Who are the characters and what are they doing?
     * What is the conflict, miracle, or key event?
     * What is the spiritual significance?
   - Line 11: A devotional reflection in Hindi connecting to the reader's life
   - Line 12: Same reflection in English
   - Line 13: "🙏 हरे कृष्ण | Hare Krishna"
   Use line breaks between sections. Keep total under 2200 characters.

2. **hashtags**: 5 relevant hashtags. Include #SrimadBhagavatam #ISKCON and 3 scene-specific ones.

JSON format: {"caption": "...", "hashtags": "#tag1 #tag2 #tag3 #tag4 #tag5"}`;

  const tryParseCaption = (text: string) => {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.caption) return {
        caption: parsed.caption as string,
        hashtags: (parsed.hashtags as string) || "#SrimadBhagavatam #ISKCON #BhagavatamArt #Devotion #Krishna",
      };
    } catch { /* invalid */ }
    return null;
  };

  // Try Anthropic first — produces better detailed storyline captions
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic();
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: `${systemPrompt}\n\n${userPrompt}` }],
      });
      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const result = tryParseCaption(text);
      if (result) {
        logger.info("Caption generated via Anthropic");
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

  // Fallback caption
  const headerLine = cantoNumber && chapterNumber
    ? `📖 Srimad Bhagavatam — Canto ${cantoNumber}, Chapter ${chapterNumber}\n${chapterTitle}`
    : `📖 ${chapterTitle}`;
  return {
    caption: `${headerLine}\n\nA scene from Srimad Bhagavatam — the timeless wisdom of the Supreme Lord, narrated for the upliftment of all souls.\n\n🙏 Hare Krishna`,
    hashtags: "#SrimadBhagavatam #ISKCON #BhagavatamArt #Devotion #Krishna",
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
   - Describe the SPECIFIC ACTION: What is each character doing? What is the conflict or event?
   - Describe the SPECIFIC SETTING: Where exactly does this take place? (forest, river bank, battlefield, palace, etc.)
   - Include VISUAL DETAILS from the story: objects, weapons, animals, elements (fire, water, etc.)
   - Example of GOOD prompt: "Krishna stands at the edge of the blazing Munjavaranya forest, arms raised, swallowing the massive fire into his mouth as terrified cowherds and Balarama watch from behind, their cattle huddled together, flames reflecting off Krishna's blue skin"
   - Example of BAD prompt: "Krishna protects inhabitants with divine intervention" (too vague, no story)

   IMPORTANT: No violent/graphic language. Describe conflicts in a dignified way.
   IMPORTANT: Each scene MUST show a DIFFERENT moment in the chapter's storyline, in chronological order.

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

  // Try Anthropic first
  if (anthropicKey) {
    try {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic();
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1200,
        messages: [{ role: "user", content: userPrompt }],
      });
      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const result = tryParse(text);
      if (result) {
        logger.info({ chapterTitle, count: result.length, engine: "anthropic" }, "Multi-scene prompts generated");
        return result.slice(0, numScenes);
      }
    } catch (err) {
      logger.warn({ err }, "Anthropic multi-scene failed");
    }
  }

  // Fallback: Together AI
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
      logger.warn({ err }, "Together multi-scene failed");
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

  // Threads has a 500 character limit — truncate caption smartly for Threads
  if (service === "threads" && fullCaption.length > 500) {
    // Keep the first line (canto/chapter header) + hashtags, truncate the middle
    const lines = caption.split("\n").filter((l) => l.trim());
    const headerLine = lines[0] || "";
    const lastLine = lines[lines.length - 1] || "";
    // Build a short version: header + truncated story + hashtags
    const availableChars = 500 - headerLine.length - hashtags.length - 10; // 10 for newlines
    const storyLines = lines.slice(1, -1).join("\n");
    const truncatedStory = storyLines.length > availableChars
      ? storyLines.substring(0, availableChars - 3) + "..."
      : storyLines;
    fullCaption = `${headerLine}\n${truncatedStory}\n${lastLine}\n\n${hashtags}`;
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

// ── Main public API ──────────────────────────────────────────────────────────

/**
 * Generate 3-4 Instagram-friendly images for a chapter and optionally queue to Buffer.
 */
export async function generateInstagramForChapter(
  chapterNumber: number,
  chapterTitle: string,
  contentSnippet: string,
  options: { queueToBuffer?: boolean; numScenes?: number; cantoNumber?: number; forceRegenerate?: boolean } = {},
): Promise<{
  generated: number;
  queued: number;
  images: InstagramImage[];
}> {
  const numScenes = options.numScenes || 4;
  const cantoNumber = options.cantoNumber;
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

      // Generate caption with canto/chapter info
      const { caption, hashtags } = await generateCaption(
        chapterTitle, scene.scene, scene.summaryHi, cantoNumber, chapterNumber,
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
