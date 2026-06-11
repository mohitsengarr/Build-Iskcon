// Supabase Edge Function: chaitanya-extract-scenes (v2)
//
// v2 changes vs v1 (correctness review fixes):
// - AUTH: requires header `x-cc-secret` matching private_config.cc_extract_secret.
//   v1 accepted any project JWT — the public anon key qualified, so anyone
//   could burn Anthropic credits. The secret lives server-side only (DB row
//   readable by service role; api-server reads it from .env).
// - SAMPLING: v1 silently truncated to the first 40k chars — 60 of 61 real
//   chapters exceed that (median ~120k), so "rank 1 scene" came from the
//   opening third only. v2 samples head+middle+tail with explicit elision
//   markers and reports `truncated` + char counts in the response.
// - JSON ROBUSTNESS: v1 used one greedy /\{[\s\S]*\}/ and never checked
//   stop_reason — a preamble brace or max_tokens truncation produced an
//   opaque 502 that wedged the caller. v2 strips code fences, anchors on
//   '{"scenes"', balance-scans braces, and surfaces stop_reason.
// - CORS: removed. No browser calls this function; server-to-server only.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

interface ExtractRequest {
  chapter_global_number: number;
  chapter_part: string;        // "adi" | "madhya" | "antya" (lowercase codes)
  chapter_in_part: number;     // 0 for intro, 1..N for chapters
  chapter_title: string;
  chapter_text: string;
  persona_library?: Array<{ key: string; short_description: string }>;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

// ── Secret check (cached per isolate) ────────────────────────────────────────
let cachedSecret: string | null = null;
async function getExpectedSecret(): Promise<string | null> {
  if (cachedSecret) return cachedSecret;
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return null;
  const r = await fetch(
    `${url}/rest/v1/private_config?key=eq.cc_extract_secret&select=value`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  if (!r.ok) return null;
  const rows = await r.json() as Array<{ value: string }>;
  cachedSecret = rows[0]?.value || null;
  return cachedSecret;
}

// ── Sampling ─────────────────────────────────────────────────────────────────
// Keep total ≤ ~100k chars: 40k head + 30k middle + 30k tail. Hindi/Devanagari
// is token-dense, so 100k chars stays comfortably inside Haiku's context while
// covering the chapter's beginning, core, and climax.
const HEAD = 40_000, MID = 30_000, TAIL = 30_000;
function sampleChapterText(text: string): { sampled: string; truncated: boolean } {
  if (text.length <= HEAD + MID + TAIL) return { sampled: text, truncated: false };
  const midStart = Math.floor(text.length / 2 - MID / 2);
  const head = text.substring(0, HEAD);
  const middle = text.substring(midStart, midStart + MID);
  const tail = text.substring(text.length - TAIL);
  const marker = "\n\n[... मध्य भाग छोड़ा गया / SECTION ELIDED ...]\n\n";
  return { sampled: head + marker + middle + marker + tail, truncated: true };
}

// ── Robust JSON extraction ───────────────────────────────────────────────────
function extractScenesJson(text: string): { ok: true; parsed: { scenes?: unknown[] } } | { ok: false; reason: string } {
  let t = text.trim();
  // Strip markdown code fences if present
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  // Anchor on the scenes object if findable, else first brace
  let start = t.indexOf('{"scenes"');
  if (start === -1) start = t.indexOf("{");
  if (start === -1) return { ok: false, reason: "no opening brace in response" };
  // Balanced-brace scan (string-aware)
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) return { ok: false, reason: "unbalanced braces (likely max_tokens truncation)" };
  try {
    return { ok: true, parsed: JSON.parse(t.substring(start, end + 1)) };
  } catch (err) {
    return { ok: false, reason: `JSON.parse failed: ${String(err).substring(0, 120)}` };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: JSON_HEADERS });
  }

  // Shared-secret gate — a valid project JWT alone is NOT enough.
  const expected = await getExpectedSecret();
  if (!expected || req.headers.get("x-cc-secret") !== expected) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: JSON_HEADERS });
  }

  let body: ExtractRequest;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: JSON_HEADERS }); }

  if (!body.chapter_text || body.chapter_text.length < 100) {
    return new Response(JSON.stringify({ error: "chapter_text required (min 100 chars)" }), { status: 400, headers: JSON_HEADERS });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }), { status: 500, headers: JSON_HEADERS });
  }

  const { sampled, truncated } = sampleChapterText(body.chapter_text);

  const personaBlock = body.persona_library && body.persona_library.length > 0
    ? `\n\nCANONICAL PERSONA LIBRARY (use these EXACT visual details if the character appears in the chapter):\n${body.persona_library.map(p => `• ${p.key}: ${p.short_description}`).join("\n")}\n`
    : "";

  const systemPrompt = `You are an expert on Sri Chaitanya Charitamrit (Krishnadas Kaviraja Goswami's biography of Sri Chaitanya Mahaprabhu, ~1486-1534 CE Bengal). You read Hindi + Bengali transliterations + Devanagari fluently and understand the lila (sacred narrative) of each chapter. Your job is to identify the most visually-depictable, narratively-important moments so they can be turned into devotional paintings of medieval Bengali sankirtan culture.`;

  const userPrompt = `${body.chapter_part}, Chapter ${body.chapter_in_part} — ${body.chapter_title}

INPUT (chapter text, Devanagari + Hindi commentary${truncated ? "; long chapter — beginning, middle and end sections are provided with elision markers" : ""}):
${sampled}
${personaBlock}
EXTRACT 3 to 5 visually distinct, narratively important scenes from THIS chapter. Each scene must be:
  • a specific moment with concrete characters and action (not generic devotional pose)
  • ranked by importance (rank 1 = most central to the chapter's story)
  • paintable — visible elements, location, mood

For each scene, write an image_prompt suitable for FLUX.2-pro that:
  • starts with "A wide establishing shot of" or "A medium-close group composition of"
  • names each character with explicit MALE/FEMALE and persona details from above
  • describes the setting (Nabadwip Ganga shore, Mayapur courtyard, Jagannath temple precinct, Vrindavan grove, etc.)
  • names the action (kirtan dancing, prabhu embracing devotee, taking sannyasa, debating pandits, etc.)
  • ends with "Classical Indian devotional oil painting, warm saffron tones, NOT photorealistic."
  • stays under 250 words

ABSOLUTE GENDER RULES (these MUST appear in every image_prompt):
  ① NAMED characters: prefix with MALE or FEMALE.
     - Sri Chaitanya Mahaprabhu (Gauranga/Nimai) — MALE, golden-fair complexion, tall slender frame, long arms, long curly black hair tied up or shaved (post-sannyasa), large lotus-petal eyes, no facial hair, wears saffron dhoti as sannyasi or white dhoti as householder, holds japa-mala and karatalas
     - Nityananda Prabhu — MALE, fair complexion, robust build, blissful expression, wears red-tinted dhoti, sometimes carries a danda
     - Advaita Acharya — MALE, elderly, fair, slight beard, dignified scholar in white dhoti
     - Haridas Thakur — MALE, dark complexion, peaceful, gaunt from chanting japa
     - Srivasa Pandit / Gadadhara / Murari Gupta etc. — MALE Bengali brahmanas in white dhoti and white sacred thread
     - Female devotees (Vishnupriya, Sachi Mata, Lakshmi-priya, women of Nabadwip) — FEMALE, smooth feminine faces (NO beard/mustache/stubble), kajal eyes, hair tied back or in braid with flowers, white-bordered red Bengali sari with anchal over head, conch bangles + red coral bangles, bindi on forehead, sometimes carrying brass lamps for arati
  ② BACKGROUND / CROWD figures: NEVER write bare "devotees" or "pandits" — every group must be GENDER-LABELLED. Acceptable forms:
       - "fifteen MALE devotees in white cotton dhoti dancing with arms raised, mridanga drums slung on shoulders"
       - "a cluster of FEMALE Bengali housewives in red-bordered white saris kneeling on the right, brass lamps in hand"
       - "a MIXED CROWD: twelve MALE brahmana pandits on the left and ten FEMALE devotees on the right (rendered as two clearly separate clusters, never overlapping)"
  ③ Androgynous, ambiguous, or unspecified-gender figures are FORBIDDEN. Default to MALE for pandits/brahmanas/officials and FEMALE for housewives/maidservants.

ABSOLUTE ANACHRONISM RULES (also MUST appear in image_prompt) — this is 1486-1534 CE medieval Bengal / Odisha, NOT 21st century, NOT Vedic-times either:
  - NO eyewear (spectacles, glasses, monocles) on any character including elderly pandits
  - NO modern clothing (shirts, trousers, buttons, zippers, blazers)
  - NO modern technology (watches, paper books, pens, electricals, plastic, cars, bicycles)
  - NO firearms, no glass windows, no concrete buildings, no electric lights
  - NO modern beards (no goatees, no fade beards, no manicured stubble) — only natural full beards on Advaita Acharya, or fully clean shaven on younger devotees
  - ALL WRISTS bare or with traditional bangles/sacred thread only. A watch on a wrist is FORBIDDEN.
  - Acceptable items: cotton/silk dhotis dyed with natural pigments, white sacred thread, tulasi-bead necklaces, palm-leaf manuscripts bound with string, brass kalash water-pots, copper diyas, conch-shells, mridanga clay drums, karatala brass cymbals, jhampa palanquins, thatched-roof huts, terracotta-tiled temple roofs, Jagannath wheel-temple architecture for Puri scenes

Return ONLY raw JSON (no markdown):
{
  "scenes": [
    {
      "title": "<short scene name, under 80 chars>",
      "summary": "<2-3 sentence what happens, in English>",
      "characters": ["Name1", "Name2"],
      "setting": "<specific location>",
      "mood": "<emotional tone, e.g. 'ecstatic kirtan' or 'tender renunciation'>",
      "image_prompt": "A wide establishing shot of ... Classical Indian devotional oil painting, warm saffron tones, NOT photorealistic.",
      "rank": 1
    }
  ]
}

If the chapter is purely philosophical with no depictable scenes, return {"scenes": []}.`;

  let claudeRes: Response;
  try {
    claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 6000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Claude request failed", detail: String(err) }), { status: 502, headers: JSON_HEADERS });
  }

  if (!claudeRes.ok) {
    const t = await claudeRes.text();
    return new Response(JSON.stringify({ error: "Claude error", status: claudeRes.status, detail: t.substring(0, 400) }), { status: 502, headers: JSON_HEADERS });
  }

  const claudeData = await claudeRes.json();
  const text = claudeData?.content?.[0]?.text ?? "";
  const usage = claudeData?.usage || {};
  const stopReason = claudeData?.stop_reason || null;

  if (stopReason === "max_tokens") {
    return new Response(JSON.stringify({ error: "Claude response truncated at max_tokens", stop_reason: stopReason, raw_tail: text.substring(Math.max(0, text.length - 200)) }), { status: 502, headers: JSON_HEADERS });
  }

  const extracted = extractScenesJson(text);
  if (!extracted.ok) {
    return new Response(JSON.stringify({ error: "Scene JSON extraction failed", reason: extracted.reason, stop_reason: stopReason, raw_head: text.substring(0, 300) }), { status: 502, headers: JSON_HEADERS });
  }

  const scenes = Array.isArray(extracted.parsed.scenes) ? extracted.parsed.scenes : [];

  return new Response(JSON.stringify({
    chapter_global_number: body.chapter_global_number,
    scenes,
    model: "claude-haiku-4-5",
    truncated,
    chars_received: body.chapter_text.length,
    chars_used: sampled.length,
    input_tokens: usage.input_tokens || null,
    output_tokens: usage.output_tokens || null,
  }), { headers: JSON_HEADERS });
});
