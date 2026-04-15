/**
 * Persona Discovery Service
 *
 * Scans all OCR'd Bhagavatam pages to extract character names,
 * validates them via Claude, then researches their visual appearance
 * via Firecrawl + Claude to auto-populate the persona system.
 *
 * Three-phase pipeline per tick:
 *   Phase 1: Scan batches → extract candidate names via regex
 *   Phase 2: Validate candidates via Claude (every 25 batches)
 *   Phase 3: Research validated characters via Firecrawl → upsert persona
 *
 * Runs as a cron job — processes incrementally to avoid credit spikes.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger";
import { upsertCustomPersona, getAllPersonas } from "./bhagwatham-image-gen";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "..", "..", "..", "data", "bhagwatham");
const PAGES_DIR = path.join(DATA_DIR, "pages");
const STATE_FILE = path.join(DATA_DIR, "persona-discovery-state.json");

function getFirecrawlKey() { return process.env.FIRECRAWL_API_KEY || ""; }
function getAnthropicKey() { return process.env.ANTHROPIC_API_KEY || ""; }

const BATCHES_PER_TICK = 5;
const VALIDATE_EVERY_N_BATCHES = 25; // Claude validation every 25 batches scanned
const MIN_MENTIONS = 3; // Character must appear 3+ times
const RESEARCH_PER_TICK = 1; // Firecrawl research 1 character per tick

// ── English stopwords to filter out from name candidates ──────────────────

const STOPWORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "had", "her",
  "was", "one", "our", "out", "his", "has", "its", "how", "man", "new", "now",
  "old", "see", "way", "who", "did", "got", "let", "say", "she", "too", "use",
  "him", "may", "than", "them", "then", "they", "this", "what", "when", "will",
  "with", "from", "have", "been", "some", "very", "just", "that", "also", "into",
  "like", "more", "most", "much", "only", "over", "such", "take", "than", "them",
  "each", "made", "said", "were", "thus", "here", "there", "their", "which",
  "these", "those", "being", "about", "above", "after", "again", "below",
  "could", "every", "first", "found", "great", "house", "large", "later",
  "never", "other", "place", "point", "right", "shall", "since", "small",
  "still", "those", "three", "under", "where", "while", "world", "would",
  "after", "always", "another", "because", "before", "between", "during",
  "having", "however", "nothing", "should", "though", "through", "without",
  "therefore", "according", "although", "everything", "something", "sometimes",
  "chapter", "verse", "lord", "king", "queen", "sage", "mother", "father",
  "supreme", "personality", "godhead", "purport", "translation", "text",
  "person", "people", "began", "came", "going", "went", "upon", "unto",
  "thou", "thee", "thy", "hath", "doth", "shalt", "whom", "whose",
  "dear", "good", "well", "many", "form", "time", "life", "body", "mind",
  "soul", "self", "word", "earth", "water", "fire", "become", "became",
  "certainly", "indeed", "actually", "simply", "directly", "already",
  "immediately", "gradually", "similarly", "otherwise", "particularly",
  "transcendental", "material", "spiritual", "devotional", "supreme",
  "different", "various", "entire", "complete", "beautiful", "powerful",
  "living", "divine", "sacred", "holy", "eternal", "human", "celestial",
  "please", "just", "also", "even", "only", "then", "when", "what", "that",
  "this", "very", "much", "such", "like", "well", "back", "down", "over",
  "away", "here", "home", "long", "both", "each", "same", "next", "last",
  "know", "take", "come", "make", "give", "tell", "call", "keep",
  "being", "doing", "going", "coming", "making", "taking", "giving",
  "telling", "having", "seeing", "saying", "knowing", "thinking",
  "offering", "performing", "accepting", "speaking", "hearing", "sitting",
  "standing", "walking", "looking", "passing", "morning", "evening",
  "night", "month", "year", "thousand", "million", "hundred",
  // Common place-like words that are NOT characters
  "vaikuntha", "vrindavan", "vrndavana", "mathura", "dwarka", "dvaraka",
  "hastinapura", "kurukshetra", "kailash", "patala", "svarga", "svargaloka",
  "ayodhya", "lanka", "heaven", "earth", "ocean", "forest", "mountain",
  "palace", "temple", "ashram", "kingdom", "universe",
  // Concepts not characters
  "maya", "dharma", "karma", "yoga", "bhakti", "moksha", "samsara",
  "vedas", "vedic", "upanishad", "purana", "shastra",
  "brahman", "atman", "paramatma", "jiva",
]);

// ── State tracking ──────────────────────────────────────────────────────────

interface ValidatedName {
  name: string;
  role: string;
  gender: "male" | "female";
  validatedAt: string;
  researched: boolean;
}

interface DiscoveryState {
  lastProcessedBatch: number;
  totalBatchesAvailable: number;
  nameCounts: Record<string, number>;
  validatedNames: ValidatedName[];
  researchQueue: string[];
  lastValidationBatch: number; // last batch# when we ran Claude validation
  totalNamesDiscovered: number;
  totalPersonasCreated: number;
  lastRunAt: string;
  status: "idle" | "scanning" | "validating" | "researching" | "completed";
}

function readState(): DiscoveryState {
  if (fs.existsSync(STATE_FILE)) {
    try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")); }
    catch { /* corrupted */ }
  }
  return {
    lastProcessedBatch: 0,
    totalBatchesAvailable: 0,
    nameCounts: {},
    validatedNames: [],
    researchQueue: [],
    lastValidationBatch: 0,
    totalNamesDiscovered: 0,
    totalPersonasCreated: 0,
    lastRunAt: "",
    status: "idle",
  };
}

function writeState(state: DiscoveryState) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
}

// ── Build "already known" name set ──────────────────────────────────────────

function getKnownNames(): Set<string> {
  const known = new Set<string>();
  const { builtIn, custom } = getAllPersonas();

  // Add all built-in persona keys
  for (const key of Object.keys(builtIn)) {
    known.add(key.toLowerCase());
    // Extract name from description (text before first colon)
    const desc = builtIn[key];
    const name = desc.split(":")[0]?.trim().toLowerCase();
    if (name) known.add(name);
  }

  // Add all custom persona keys and names
  for (const cp of custom) {
    known.add(cp.key.toLowerCase());
    known.add(cp.name.toLowerCase());
    // Extract literal names from regex patterns
    for (const pat of cp.patterns) {
      const literal = pat.replace(/\\b/g, "").replace(/[()|\[\]?+*^$.\\]/g, "").trim().toLowerCase();
      if (literal.length > 2) known.add(literal);
    }
  }

  return known;
}

// ── Name extraction via regex on English text ───────────────────────────────

const TITLE_PATTERN = /(?:King|Lord|Queen|Sage|Mother|Prince(?:ss)?|Goddess|Rishi|Maharaj[a]?|Devi|Emperor|Saint|Sri|Srimati?)\s+([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?)/g;
const STANDALONE_NAME = /\b([A-Z][a-z]{3,}(?:deva|pati|raja|dasa|swami|muni|rishi|giri|nath|ananda|aranya|ketu|vrata|dhara|sena|varma|gupta|asura|daitya|yaksha|gandharva|naga)?)\b/g;
const MULTI_SYLLABLE = /\b([A-Z][a-z]{2,}(?:\s[A-Z][a-z]{2,}){0,2})\b/g;

function extractCandidateNames(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  if (!text) return counts;

  const addName = (raw: string) => {
    const name = raw.trim();
    if (name.length < 3 || name.length > 30) return;
    const lower = name.toLowerCase();
    if (STOPWORDS.has(lower)) return;
    // Skip pure numbers or very common English words
    if (/^\d+$/.test(name)) return;
    // Must start with uppercase
    if (!/^[A-Z]/.test(name)) return;
    counts.set(name, (counts.get(name) || 0) + 1);
  };

  // Pattern 1: Title + Name (highest confidence)
  let match;
  while ((match = TITLE_PATTERN.exec(text)) !== null) {
    addName(match[1]);
  }

  // Pattern 2: Standalone Indian-suffix names
  while ((match = STANDALONE_NAME.exec(text)) !== null) {
    addName(match[1]);
  }

  // Pattern 3: Multi-syllable capitalized words (lower confidence, higher count threshold)
  while ((match = MULTI_SYLLABLE.exec(text)) !== null) {
    const name = match[1];
    // Only add if it looks like a proper noun (not common English)
    if (name.length >= 4 && !STOPWORDS.has(name.toLowerCase())) {
      addName(name);
    }
  }

  return counts;
}

// ── Phase 1: Scan batches ───────────────────────────────────────────────────

function scanBatches(state: DiscoveryState): boolean {
  // Find all batch files
  if (!fs.existsSync(PAGES_DIR)) return false;

  const batchFiles = fs.readdirSync(PAGES_DIR)
    .filter(f => f.startsWith("batch-") && f.endsWith(".json"))
    .sort();

  state.totalBatchesAvailable = batchFiles.length;

  if (state.lastProcessedBatch >= batchFiles.length) {
    return false; // All batches scanned
  }

  const startIdx = state.lastProcessedBatch;
  const endIdx = Math.min(startIdx + BATCHES_PER_TICK, batchFiles.length);

  for (let i = startIdx; i < endIdx; i++) {
    const batchFile = batchFiles[i];
    const filePath = path.join(PAGES_DIR, batchFile);

    try {
      const batchData = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      if (!batchData.pages) continue;

      for (const page of batchData.pages) {
        // Scan English translation (cleaner text for name extraction)
        const textEn = page.textEn || "";
        const names = extractCandidateNames(textEn);

        for (const [name, count] of names) {
          const key = name.toLowerCase().replace(/\s+/g, "_");
          state.nameCounts[key] = (state.nameCounts[key] || 0) + count;
        }
      }
    } catch (err) {
      logger.warn({ file: batchFile, err }, "Failed to read batch file for persona discovery");
    }
  }

  state.lastProcessedBatch = endIdx;
  state.totalNamesDiscovered = Object.keys(state.nameCounts).length;

  logger.info(
    { scanned: endIdx, total: batchFiles.length, uniqueNames: state.totalNamesDiscovered },
    "Persona discovery: scanned batches",
  );

  return true;
}

// ── Phase 2: Validate names via Claude ──────────────────────────────────────

async function validateNames(state: DiscoveryState): Promise<void> {
  if (!getAnthropicKey()) {
    logger.warn("ANTHROPIC_API_KEY not set — skipping persona validation");
    return;
  }

  const knownNames = getKnownNames();
  const alreadyValidated = new Set(state.validatedNames.map(v => v.name.toLowerCase().replace(/\s+/g, "_")));

  // Find candidates: appear 3+ times, not already known, not already validated
  const candidates = Object.entries(state.nameCounts)
    .filter(([key, count]) => count >= MIN_MENTIONS && !knownNames.has(key) && !alreadyValidated.has(key))
    .sort((a, b) => b[1] - a[1]) // Sort by frequency (most common first)
    .slice(0, 30); // Validate up to 30 at a time

  if (candidates.length === 0) {
    logger.info("Persona discovery: no new candidates to validate");
    return;
  }

  const candidateNames = candidates.map(([key, count]) => {
    // Convert key back to a readable name
    const name = key.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    return `${name} (${count}x)`;
  });

  logger.info({ count: candidateNames.length }, "Persona discovery: validating candidates via Claude");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": getAnthropicKey(),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        messages: [{
          role: "user",
          content: `From these candidate names extracted from Srimad Bhagavatam (Bhagavata Purana) text, identify which ones are ACTUAL characters/persons/deities mentioned in the scripture. Filter out:
- Place names (cities, planets, realms)
- Concepts or philosophical terms
- Common English words that got misidentified
- Duplicate or variant spellings of the same character (keep the most common spelling)

For each REAL character, provide: their canonical name, a one-line description of their role in the Bhagavatam, and their gender.

Candidates: ${candidateNames.join(", ")}

Return ONLY a valid JSON array (no markdown, no explanation):
[{"name": "Prithu", "role": "King who milked the Earth in form of a cow", "gender": "male"}, ...]

If none are real characters, return: []`,
        }],
      }),
    });

    if (!res.ok) {
      logger.error({ status: res.status }, "Claude validation failed");
      return;
    }

    const data: any = await res.json();
    const text = data.content?.[0]?.text || "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;

    const validated: Array<{ name: string; role: string; gender: string }> = JSON.parse(jsonMatch[0]);

    for (const v of validated) {
      const key = v.name.toLowerCase().replace(/\s+/g, "_");
      if (knownNames.has(key) || alreadyValidated.has(key)) continue;

      state.validatedNames.push({
        name: v.name,
        role: v.role,
        gender: (v.gender === "female" ? "female" : "male"),
        validatedAt: new Date().toISOString(),
        researched: false,
      });
      state.researchQueue.push(v.name);
    }

    state.lastValidationBatch = state.lastProcessedBatch;
    logger.info({ validated: validated.length, queueSize: state.researchQueue.length }, "Persona discovery: validation complete");
  } catch (err) {
    logger.error({ err }, "Persona discovery: Claude validation error");
  }
}

// ── Phase 3: Research character via Firecrawl + Claude ───────────────────────

async function researchCharacter(name: string, role: string, gender: "male" | "female"): Promise<boolean> {
  if (!getAnthropicKey()) {
    logger.warn("ANTHROPIC_API_KEY not set — skipping persona research");
    return false;
  }

  logger.info({ name, role }, "Persona discovery: researching character appearance");

  // Step 1: Firecrawl search for visual references (optional — skipped if no key)
  let searchResults: Array<{ url: string; title: string; markdown: string }> = [];
  if (getFirecrawlKey()) {
    try {
      const searchRes = await fetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getFirecrawlKey()}`,
        },
        body: JSON.stringify({
          query: `${name} Srimad Bhagavatam appearance description Hindu mythology iconography`,
          limit: 5,
          scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
        }),
      });

      if (searchRes.ok) {
        const data: any = await searchRes.json();
        searchResults = (data.data || []).map((r: any) => ({
          url: r.url || "",
          title: r.title || r.metadata?.title || "",
          markdown: (r.markdown || "").substring(0, 3000),
        }));
      }
    } catch (err) {
      logger.warn({ name, err }, "Firecrawl search failed for character");
    }
  } else {
    logger.info({ name }, "No FIRECRAWL_API_KEY — generating persona from Claude knowledge only");
  }

  // Combine content for Claude
  const webContent = searchResults.length > 0
    ? searchResults.map(r => `### ${r.title}\n${r.markdown}`).join("\n\n---\n\n")
    : `No web content found. Use your knowledge of ${name} from Srimad Bhagavatam.`;

  // Step 2: Generate persona via Claude
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": getAnthropicKey(),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        messages: [{
          role: "user",
          content: `You are creating a character persona for an AI image generation system (FLUX.2-pro) that generates classical Indian devotional oil paintings of scenes from the Srimad Bhagavatam.

Character: ${name}
Role: ${role}
Gender: ${gender}

Web research content about this character:
${webContent.substring(0, 8000)}

Create a detailed visual description for this character following this exact format. The description must be specific enough for consistent AI image generation across multiple scenes.

RULES:
- Start with "${name}:" followed by description
- Include: age range, complexion (with hex color estimate), face shape, eye details, hair style, clothing, ornaments, weapons/items
- For MALE characters: emphasize masculine features, strong jawline, NO flowers in hair (unless Krishna)
- For FEMALE characters: add "NO beard NO facial hair" explicitly, emphasize feminine features, kajal-lined eyes
- Include their key attributes, weapons, or symbolic items from the Bhagavatam
- Keep fullDescription under 250 words
- Keep shortDescription under 80 words
- patterns should include the canonical name and any common alternate spellings/epithets, using \\b word boundaries

Return ONLY valid JSON (no markdown):
{
  "fullDescription": "${name}: ...",
  "shortDescription": "${name}: ...",
  "patterns": ["\\\\b${name}\\\\b", ...],
  "gender": "${gender}"
}`,
        }],
      }),
    });

    if (!res.ok) {
      logger.error({ status: res.status, name }, "Claude persona generation failed");
      return false;
    }

    const data: any = await res.json();
    const text = data.content?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error({ name, text: text.substring(0, 200) }, "No JSON in Claude persona response");
      return false;
    }

    const persona = JSON.parse(jsonMatch[0]);
    if (!persona.fullDescription || !persona.shortDescription || !persona.patterns) {
      logger.error({ name, persona }, "Invalid persona structure from Claude");
      return false;
    }

    // Upsert into the persona system
    const key = name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const result = upsertCustomPersona({
      key,
      name,
      fullDescription: persona.fullDescription,
      shortDescription: persona.shortDescription,
      patterns: persona.patterns,
      gender: persona.gender || gender,
      source: `Auto-discovered from Bhagavatam text. ${searchResults.length > 0 ? "Researched via " + searchResults.map(r => r.url).slice(0, 2).join(", ") : "Generated from mythology knowledge."}`,
      addedAt: new Date().toISOString(),
    });

    logger.info({ name, key, isNew: result.isNew }, "Persona discovery: character persona created");
    return true;
  } catch (err) {
    logger.error({ name, err }, "Persona discovery: research failed");
    return false;
  }
}

// ── Main tick function ──────────────────────────────────────────────────────

export async function personaDiscoveryTick(): Promise<{
  phase: string;
  details: string;
}> {
  const state = readState();
  state.lastRunAt = new Date().toISOString();

  // Phase 3: Research (priority — process queue first if non-empty)
  if (state.researchQueue.length > 0) {
    state.status = "researching";
    const name = state.researchQueue[0];
    const validated = state.validatedNames.find(v => v.name === name);

    if (validated && !validated.researched) {
      const success = await researchCharacter(name, validated.role, validated.gender);
      if (success) {
        validated.researched = true;
        state.totalPersonasCreated++;
      }
    }

    // Remove from queue regardless (don't retry failed ones indefinitely)
    state.researchQueue.shift();
    writeState(state);
    return {
      phase: "research",
      details: `Researched "${name}". Queue: ${state.researchQueue.length} remaining. Total personas created: ${state.totalPersonasCreated}`,
    };
  }

  // Phase 1: Scan batches
  const didScan = scanBatches(state);

  if (didScan) {
    state.status = "scanning";

    // Check if it's time to validate (every VALIDATE_EVERY_N_BATCHES)
    const batchesSinceLastValidation = state.lastProcessedBatch - state.lastValidationBatch;
    if (batchesSinceLastValidation >= VALIDATE_EVERY_N_BATCHES || state.lastProcessedBatch >= state.totalBatchesAvailable) {
      // Phase 2: Validate accumulated names
      state.status = "validating";
      await validateNames(state);
    }

    writeState(state);
    return {
      phase: "scan",
      details: `Scanned batches ${state.lastProcessedBatch - BATCHES_PER_TICK + 1}-${state.lastProcessedBatch} of ${state.totalBatchesAvailable}. ${state.totalNamesDiscovered} unique names found.`,
    };
  }

  // All done
  if (state.researchQueue.length === 0 && state.lastProcessedBatch >= state.totalBatchesAvailable) {
    state.status = "completed";
    writeState(state);
    return {
      phase: "completed",
      details: `Discovery complete. ${state.totalPersonasCreated} personas created from ${state.totalNamesDiscovered} candidate names across ${state.totalBatchesAvailable} batches.`,
    };
  }

  writeState(state);
  return { phase: "idle", details: "Nothing to do" };
}

/** Get current discovery status for the admin dashboard */
export function getDiscoveryStatus(): DiscoveryState & { knownPersonaCount: number } {
  const state = readState();
  const { builtIn, custom } = getAllPersonas();
  return {
    ...state,
    knownPersonaCount: Object.keys(builtIn).length + custom.length,
  };
}

/** Reset discovery state (for re-running) */
export function resetDiscovery(): void {
  if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
  logger.info("Persona discovery state reset");
}
