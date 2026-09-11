// Supabase Edge Function: bhagavatam-extract-scenes (v2)
//
// v2 changes vs v1:
// - Image prompts MUST gender-label every background / crowd reference
//   (attendants, courtiers, ministers, soldiers, devotees, mourners,
//   citizens). Bare "attendants" or "courtiers" without MALE/FEMALE leads
//   FLUX to produce androgynous figures dressed half-male / half-female.
// - Explicit guidance to split mixed groups into separate MALE and FEMALE
//   sub-clusters when the chapter doesn't pin down a specific gender.
// - Added anachronism guard so scene prompts never request glasses,
//   modern clothing, or post-Vedic objects.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ExtractRequest {
  chapter_global_number: number;
  chapter_canto: number;
  chapter_in_canto: number;
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
    ? `\n\nCANONICAL PERSONA LIBRARY (use these EXACT visual details if the character appears in the chapter — do NOT default sages to "elder bearded man", follow these descriptions exactly):\n${body.persona_library.map(p => `• ${p.key}: ${p.short_description}`).join("\n")}\n`
    : "";

  const systemPrompt = `You are an expert on the Srimad Bhagavatam (Bhagavata Purana). You read Hindi + Sanskrit + Devanagari fluently and understand the narrative structure of each chapter. Your job is to identify the most visually-depictable, narratively-important moments in a chapter so they can be turned into devotional paintings.`;

  const userPrompt = `Canto ${body.chapter_canto}, Chapter ${body.chapter_in_canto} — ${body.chapter_title}

INPUT (chapter text, Devanagari + Hindi commentary):
${truncated}
${personaBlock}
EXTRACT 3 to 5 visually distinct, narratively important scenes from THIS chapter. Each scene must be:
  • a specific moment with concrete characters and action (not a generic devotional pose)
  • ranked by importance (rank 1 = most central to the chapter's story)
  • paintable — has visible elements, location, mood

For each scene, write an image_prompt suitable for FLUX.2-pro that:
  • starts with "A wide establishing shot of" or "A medium-close group composition of"
  • names each character with explicit MALE/FEMALE and the persona details from above (if matched)
  • describes the setting (forest, palace, riverbank, battlefield, etc.)
  • names the action (teaching, praying, blessing, discussing, departing, etc.)
  • ends with "Classical Indian devotional oil painting, warm saffron tones, NOT photorealistic."
  • stays under 250 words

ABSOLUTE GENDER RULES (these MUST appear in every image_prompt):
  ① NAMED characters: prefix with MALE or FEMALE. Women have completely smooth feminine faces (NO beard/mustache/stubble), kajal eyes, long braided hair with flowers, sari + choli, bangles, nose-ring optional. Men have masculine faces — some sages clean-shaven (Narada, Shukadeva, Uddhava), some bearded (Vyasa, Suta Goswami, Bhishma) per persona descriptions; dhoti, bare chest or angavastram, NO sari, NO bangles. Men NEVER wear flowers in hair (only Krishna's peacock feather).
  ② BACKGROUND / CROWD figures (attendants, courtiers, ministers, soldiers, devotees, mourners, citizens, ascetics): NEVER write bare "attendants" or "courtiers" — every group must be GENDER-LABELLED. Acceptable forms:
       - "five MALE courtiers in dhoti and turban standing weeping behind him"
       - "a cluster of FEMALE maidservants in saris kneeling on the right"
       - "a MIXED CROWD: ten MALE ministers in dhotis to the left and ten FEMALE devotees in saris to the right (rendered as two clearly separate clusters, never overlapping)"
  ③ Androgynous, ambiguous, or unspecified-gender figures are FORBIDDEN. If you cannot decide, default to MALE for ministers/soldiers/courtiers and FEMALE for maidservants/devotee crowds.

ABSOLUTE ANACHRONISM RULES (also MUST appear in image_prompt):
  - NO eyewear (spectacles, glasses, monocles) on any character including elderly sages
  - NO modern clothing (shirts, trousers, buttons, zippers)
  - NO modern technology (watches, paper books, pens, electricals)
  - NO post-Vedic objects (firearms, glass windows, brick walls)
  - Only dhotis, saris, palm-leaf manuscripts, brass vessels, oil lamps, conches, wooden / stone hermitage settings

Return ONLY raw JSON (no markdown):
{
  "scenes": [
    {
      "title": "<short scene name, under 80 chars>",
      "summary": "<2-3 sentence what happens, in English>",
      "characters": ["Name1", "Name2"],
      "setting": "<specific location>",
      "mood": "<emotional tone, e.g. 'tense and confrontational' or 'peaceful and instructional'>",
      "image_prompt": "A wide establishing shot of ... Classical Indian devotional oil painting, warm saffron tones, NOT photorealistic.",
      "rank": 1
    },
    ...
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
