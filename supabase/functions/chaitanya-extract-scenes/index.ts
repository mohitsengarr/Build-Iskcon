// Supabase Edge Function: chaitanya-extract-scenes (v1)
//
// Sister of bhagavatam-extract-scenes, adapted for Chaitanya Charitamrit:
//
// - Setting is 16th-century Bengal / Odisha (1486–1534 CE), NOT Vedic times.
//   Chaitanya Mahaprabhu lived ~500 years ago, so the visual world is
//   different: medieval Bengali villages with thatched huts and clay courtyards,
//   the Ganga shoreline at Nabadwip, the Jagannath temple at Puri, palm-leaf
//   manuscripts (still no paper books), sankirtan processions with mridangas
//   and karatalas, cotton dhotis dyed with natural pigments.
// - Many scenes are ecstatic group kirtan / dancing — call that out in the
//   prompt rather than defaulting to "elder sage teaching disciple".
// - Same hard gender labelling + anachronism rules as bhagavatam scenes:
//   no glasses, watches, modern fabric, firearms, etc.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ExtractRequest {
  chapter_global_number: number;
  chapter_part: string;        // "Adi-lila" | "Madhya-lila" | "Antya-lila"
  chapter_in_part: number;     // 0 for intro, 1..N for chapters
  chapter_title: string;
  chapter_text: string;
  persona_library?: Array<{ key: string; short_description: string }>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let body: ExtractRequest;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }); }

  if (!body.chapter_text || body.chapter_text.length < 100) {
    return new Response(JSON.stringify({ error: "chapter_text required (min 100 chars)" }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }

  const truncated = body.chapter_text.substring(0, 40_000);

  const personaBlock = body.persona_library && body.persona_library.length > 0
    ? `\n\nCANONICAL PERSONA LIBRARY (use these EXACT visual details if the character appears in the chapter):\n${body.persona_library.map(p => `• ${p.key}: ${p.short_description}`).join("\n")}\n`
    : "";

  const systemPrompt = `You are an expert on Sri Chaitanya Charitamrit (Krishnadas Kaviraja Goswami's biography of Sri Chaitanya Mahaprabhu, ~1486-1534 CE Bengal). You read Hindi + Bengali transliterations + Devanagari fluently and understand the lila (sacred narrative) of each chapter. Your job is to identify the most visually-depictable, narratively-important moments so they can be turned into devotional paintings of medieval Bengali sankirtan culture.`;

  const userPrompt = `${body.chapter_part}, Chapter ${body.chapter_in_part} — ${body.chapter_title}

INPUT (chapter text, Devanagari + Hindi commentary):
${truncated}
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
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Claude request failed", detail: String(err) }), { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }

  if (!claudeRes.ok) {
    const t = await claudeRes.text();
    return new Response(JSON.stringify({ error: "Claude error", status: claudeRes.status, detail: t.substring(0, 400) }), { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }

  const claudeData = await claudeRes.json();
  const text = claudeData?.content?.[0]?.text ?? "";
  const usage = claudeData?.usage || {};

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return new Response(JSON.stringify({ error: "No JSON in Claude response", raw: text.substring(0, 400) }), { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }

  let parsed: { scenes?: Array<Record<string, unknown>> };
  try { parsed = JSON.parse(jsonMatch[0]); }
  catch (err) {
    return new Response(JSON.stringify({ error: "JSON parse failed", detail: String(err), raw: jsonMatch[0].substring(0, 400) }), { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }

  const scenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];

  return new Response(JSON.stringify({
    chapter_global_number: body.chapter_global_number,
    scenes,
    model: "claude-haiku-4-5",
    input_tokens: usage.input_tokens || null,
    output_tokens: usage.output_tokens || null,
  }), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
