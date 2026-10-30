// The Krishna check (owner, 2026-10-23): no picture goes to Instagram or Threads
// unless Lord Krishna Himself is clearly shown in it. krishnaCheckCore.ts decides
// what is asked and what is allowed; krishnaCheck.ts asks Claude, stores the
// record for the exact image it judged, and fails closed.
// Run: node --experimental-strip-types --test tests/
import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./helpers/npm-stub-hooks.mjs", import.meta.url);
const core = await import("../supabase/functions/_shared/krishnaCheckCore.ts");
const io = await import("../supabase/functions/_shared/krishnaCheck.ts");

// deno-lint-ignore no-explicit-any
const g = globalThis as any;
const PATH = "candidate-41-1792498089640-ab12cd34-wm.jpg";
const URL_ = `https://sb.test/storage/v1/object/public/instagram-images/${PATH}`;
const AT = new Date("2026-10-23T12:00:00.000Z");
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

const answer = (extra: Record<string, unknown> = {}) => ({
  krishna_visible: true, form: "krishna", prominence: "main", observed: "Krishna plays the flute among cows.", ...extra,
});
const record = (extra: Record<string, unknown> = {}) => core.krishnaRecord(answer(extra) as never, PATH, "claude-opus-5", AT);
const toolReply = (input: unknown) => ({ stop_reason: "end_turn", content: [{ type: "tool_use", name: core.KRISHNA_TOOL_NAME, input }] });

describe("krishnaAllowed", () => {
  test("a current check showing Krishna as a main or secondary figure lets the picture go out", () => {
    assert.equal(core.krishnaAllowed(record(), PATH).allowed, true);
    assert.equal(core.krishnaAllowed(record({ form: "radha_krishna", prominence: "secondary" }), PATH).allowed, true);
    assert.equal(core.krishnaAllowed(record({ form: "child_krishna" }), PATH).allowed, true);
    assert.equal(core.krishnaAllowed(record({ form: "krishna_deity" }), PATH).allowed, true);
  });

  test("no Krishna in the picture holds it back, and says what the picture shows", () => {
    const out = core.krishnaAllowed(record({ krishna_visible: false, form: "none", prominence: "none", observed: "Sages bathe in the Ganga." }), PATH);
    assert.deepEqual(out, { allowed: false, reason: "no Krishna in the picture (Sages bathe in the Ganga.)" });
  });

  test("Vishnu, Rama and other avatars do not count", () => {
    for (const form of ["vishnu_or_narayana", "rama", "other_deity_or_avatar"]) {
      const out = core.krishnaAllowed(record({ form }), PATH);
      assert.equal(out.allowed, false, form);
      assert.match(out.reason, /not shown in His own form/);
    }
  });

  test("Lord Jagannath and Sri Chaitanya count as Krishna (owner, 2026-10-31), as the check records them: Krishna Himself not shown, no prominence", () => {
    for (const form of ["jagannath", "chaitanya"]) {
      const out = core.krishnaAllowed(record({ krishna_visible: false, form, prominence: "none", observed: "x" }), PATH);
      assert.equal(out.allowed, true, form);
      assert.match(out.reason, /counts as Krishna/);
    }
    assert.match(core.krishnaAllowed(record({ krishna_visible: false, form: "chaitanya", prominence: "none" }), PATH).reason, /Sri Chaitanya Mahaprabhu/);
    assert.match(core.krishnaAllowed(record({ krishna_visible: false, form: "jagannath", prominence: "none" }), PATH).reason, /Lord Jagannath/);
    assert.deepEqual([...core.POSTABLE_FORMS], ["krishna", "child_krishna", "radha_krishna", "krishna_deity", "jagannath", "chaitanya"]);
  });

  test("a Chaitanya record is still only good for the image it judged", () => {
    assert.equal(core.krishnaAllowed(record({ krishna_visible: false, form: "chaitanya", prominence: "none" }), "another.jpg").allowed, false);
  });

  test("a Chaitanya or Jagannath answer is consistent as the model gives it: no second opinion", () => {
    assert.equal(core.krishnaInconsistent({ krishna_visible: false, form: "chaitanya", prominence: "none", observed: "" }), false);
    assert.equal(core.krishnaNeedsSecondOpinion({ krishna_visible: false, form: "jagannath", prominence: "none", observed: "", sure: true }), false);
  });

  test("Krishna only in the background is held back", () => {
    assert.deepEqual(core.krishnaAllowed(record({ prominence: "background" }), PATH), { allowed: false, reason: "Krishna is only in the background" });
  });

  test("no check, a check of another image, or an old version of the check is never enough", () => {
    assert.equal(core.krishnaAllowed(null, PATH).allowed, false);
    assert.equal(core.krishnaAllowed(record(), "another.jpg").allowed, false, "the image changed since the check");
    assert.equal(core.krishnaAllowed({ ...record(), version: 0 }, PATH).allowed, false);
    assert.equal(core.krishnaAllowed(record(), null).allowed, false);
  });
});

describe("the question and the answer", () => {
  test("the request sends the image first, then the question, with the strict tool", () => {
    const p = core.buildKrishnaParams({ imageB64: "AAAA", mediaType: "image/jpeg" });
    assert.equal(p.messages[0].content[0].type, "image");
    assert.equal(p.messages[0].content[0].source.data, "AAAA");
    assert.match(p.messages[0].content[1].text, /Lord Jagannath, Sri Chaitanya Mahaprabhu/);
    assert.equal(p.tools[0].name, core.KRISHNA_TOOL_NAME);
    assert.equal(p.tools[0].strict, true);
  });

  test("a well-formed answer is read, and its note is tidied and cut", () => {
    const out = core.parseKrishnaCheck(toolReply(answer({ observed: "  Krishna\n with   Arjuna  " + "x".repeat(400) })));
    assert.equal(out.outcome, "ok");
    assert.equal((out as { answer: { observed: string } }).answer.observed.startsWith("Krishna with Arjuna x"), true);
    assert.equal((out as { answer: { observed: string } }).answer.observed.length, core.MAX_OBSERVED_CHARS);
  });

  test("a refusal, a reply without the tool, or an unknown form is not an answer", () => {
    assert.equal(core.parseKrishnaCheck({ stop_reason: "refusal", content: [] }).outcome, "refusal");
    assert.equal(core.parseKrishnaCheck({ content: [{ type: "text", text: "yes" }] }).outcome, "no_tool");
    assert.equal(core.parseKrishnaCheck(toolReply(answer({ form: "shiva" }))).outcome, "invalid");
    assert.equal(core.parseKrishnaCheck(toolReply(answer({ krishna_visible: "yes" }))).outcome, "invalid");
    assert.equal(core.parseKrishnaCheck(null).outcome, "no_tool");
  });

  test("bytesToBase64 encodes large images in chunks", () => {
    const big = new Uint8Array(100_000).map((_, i) => i % 256);
    assert.equal(core.bytesToBase64(big), Buffer.from(big).toString("base64"));
  });
});

// ── IO ──────────────────────────────────────────────────────────────────────

function fakeDb(row: Record<string, unknown>, o: { updateError?: string } = {}) {
  const updates: Array<{ values: Record<string, unknown>; eq: Array<[string, unknown]> }> = [];
  return {
    updates,
    from: () => {
      const eq: Array<[string, unknown]> = [];
      let values: Record<string, unknown> | null = null;
      const q: Record<string, unknown> = {
        update: (v: Record<string, unknown>) => ((values = v), q),
        eq: (c: string, v: unknown) => (eq.push([c, v]), q),
        select: () => q,
        then: (res: (v: unknown) => unknown) => {
          updates.push({ values: values!, eq: [...eq] });
          if (o.updateError) return Promise.resolve({ data: null, error: { message: o.updateError } }).then(res);
          const hit = eq.every(([c, v]) => row[c] === v);
          if (hit) Object.assign(row, values);
          return Promise.resolve({ data: hit ? [{ id: row.id }] : [], error: null }).then(res);
        },
      };
      return q;
    },
  };
}
const row = (extra: Record<string, unknown> = {}) => ({ id: 41, image_path: PATH, image_url: URL_, krishna_check: null, ...extra });
const quiet = () => {};

describe("ensureKrishnaCheck and krishnaGate", () => {
  test("a picture not yet checked is checked once, and the record is stored on the row for that image", async () => {
    // Arrange
    const r = row();
    const db = fakeDb(r);
    const asked: string[] = [];
    // Act
    const out = await io.krishnaGate({ supabase: db, table: "ig_pending_review", row: r, ask: async (u) => (asked.push(u), { ok: true, answer: answer() as never }), now: () => AT, log: quiet });
    // Assert
    assert.equal(out.allowed, true);
    assert.deepEqual(asked, [URL_]);
    assert.deepEqual(db.updates[0].eq, [["id", 41], ["image_path", PATH]], "stored only while the row holds the image it judged");
    assert.deepEqual(r.krishna_check, { ...record(), model: core.KRISHNA_CHECK_MODEL });
  });

  test("a picture already checked for its current image is not checked again", async () => {
    const r = row({ krishna_check: record() });
    const db = fakeDb(r);
    let asked = 0;
    const out = await io.krishnaGate({ supabase: db, table: "ig_pending_review", row: r, ask: async () => (asked++, { ok: true, answer: answer() as never }), log: quiet });
    assert.equal(out.allowed, true);
    assert.deepEqual([asked, db.updates.length], [0, 0]);
  });

  test("a check of an earlier image is redone for the image the row holds now", async () => {
    const r = row({ krishna_check: { ...record(), image_path: "older.jpg" } });
    const db = fakeDb(r);
    let asked = 0;
    await io.krishnaGate({ supabase: db, table: "ig_pending_review", row: r, ask: async () => (asked++, { ok: true, answer: answer({ krishna_visible: false, form: "none", prominence: "none" }) as never }), log: quiet });
    assert.equal(asked, 1);
    assert.equal((r.krishna_check as { image_path: string }).image_path, PATH);
  });

  test("a picture without Krishna is held back with the reason", async () => {
    const r = row();
    const out = await io.krishnaGate({ supabase: fakeDb(r), table: "gita_chapter_art_review", row: r, ask: async () => ({ ok: true, answer: answer({ krishna_visible: false, form: "vishnu_or_narayana", prominence: "none", observed: "Lord Vishnu rests on Ananta." }) as never }), log: quiet });
    assert.equal(out.allowed, false);
    assert.match(out.reason, /no Krishna in the picture/);
  });

  test("a picture of Sri Chaitanya passes the gate (owner, 2026-10-31), its check stored as the model gave it", async () => {
    const r = row();
    const db = fakeDb(r);
    const out = await io.krishnaGate({ supabase: db, table: "chaitanya_chapter_art_review", row: r, ask: async () => ({ ok: true, answer: answer({ krishna_visible: false, form: "chaitanya", prominence: "none", observed: "Lord Chaitanya dances in kirtan." }) as never }), log: quiet });
    assert.equal(out.allowed, true);
    assert.match(out.reason, /Sri Chaitanya Mahaprabhu/);
    assert.equal((r.krishna_check as { form: string }).form, "chaitanya");
  });

  test("a failed check holds the picture back and stores nothing, so the next run asks again", async () => {
    const r = row();
    const db = fakeDb(r);
    const out = await io.krishnaGate({ supabase: db, table: "ig_pending_review", row: r, ask: async () => ({ ok: false, reason: "api_error_529" }), log: quiet });
    assert.deepEqual([out.allowed, out.check], [false, null]);
    assert.equal(db.updates.length, 0);
  });

  test("an image swapped in while it was checked: the record is not stored and nothing is allowed", async () => {
    const r = row();
    const db = fakeDb(r);
    const out = await io.krishnaGate({
      supabase: db, table: "ig_pending_review", row: { ...r },
      ask: async () => { r.image_path = "new-render.jpg"; return { ok: true, answer: answer() as never }; }, log: quiet,
    });
    assert.equal(out.allowed, false);
    assert.equal(r.krishna_check, null);
  });

  test("a store that fails holds the picture back", async () => {
    const r = row();
    const out = await io.krishnaGate({ supabase: fakeDb(r, { updateError: "timeout" }), table: "ig_pending_review", row: r, ask: async () => ({ ok: true, answer: answer() as never }), log: quiet });
    assert.equal(out.allowed, false);
  });

  test("mayCheck false: a picture not checked yet is held back without asking Claude", async () => {
    const r = row();
    let asked = 0;
    const out = await io.krishnaGate({ supabase: fakeDb(r), table: "ig_pending_review", row: r, mayCheck: false, ask: async () => (asked++, { ok: true, answer: answer() as never }), log: quiet });
    assert.deepEqual([out.allowed, out.checked, asked], [false, false, 0]);
    assert.match(out.reason, /not checked yet/);
  });

  test("mayCheck false still answers from a stored check of the current image", async () => {
    const r = row({ krishna_check: record() });
    const out = await io.krishnaGate({ supabase: fakeDb(r), table: "ig_pending_review", row: r, mayCheck: false, ask: async () => { throw new Error("must not ask"); }, log: quiet });
    assert.deepEqual([out.allowed, out.checked], [true, false]);
  });

  test("checked says whether this call started a new check, failed or not", async () => {
    const r = row();
    const fresh = await io.krishnaGate({ supabase: fakeDb(r), table: "ig_pending_review", row: r, ask: async () => ({ ok: true, answer: answer() as never }), log: quiet });
    const failed = await io.krishnaGate({ supabase: fakeDb(row()), table: "ig_pending_review", row: row(), ask: async () => ({ ok: false, reason: "x" }), log: quiet });
    assert.deepEqual([fresh.checked, failed.checked], [true, true]);
  });

  test("a row with no image is never allowed", async () => {
    const out = await io.krishnaGate({ supabase: fakeDb(row()), table: "ig_pending_review", row: { id: 1, image_path: null, image_url: null }, ask: async () => ({ ok: true, answer: answer() as never }), log: quiet });
    assert.equal(out.allowed, false);
  });
});

describe("askKrishna", () => {
  afterEach(() => { delete g.__anthropicCreate; });
  const okFetch = (async () => new Response(JPEG)) as unknown as typeof fetch;

  test("sends the image to Claude and reads its answer", async () => {
    // Arrange
    let sent: { messages: Array<{ content: Array<{ source?: { media_type: string; data: string } }> }> } | null = null;
    g.__anthropicCreate = async (params: never) => { sent = params; return toolReply(answer()); };
    // Act
    const out = await io.askKrishna(URL_, { apiKey: "test", fetchImpl: okFetch });
    // Assert
    assert.equal(out.ok, true);
    assert.equal(sent!.messages[0].content[0].source!.media_type, "image/jpeg");
    assert.equal(sent!.messages[0].content[0].source!.data, Buffer.from(JPEG).toString("base64"));
  });

  test("fails closed: no key, an unreadable image, an API error or a refusal", async () => {
    g.__anthropicCreate = async () => ({ stop_reason: "refusal", content: [] });
    assert.deepEqual(await io.askKrishna(URL_, { apiKey: "", fetchImpl: okFetch }), { ok: false, reason: "no_api_key" });
    assert.deepEqual(await io.askKrishna(URL_, { apiKey: "k", fetchImpl: (async () => new Response("", { status: 404 })) as unknown as typeof fetch }), { ok: false, reason: "image_http_404" });
    assert.deepEqual(await io.askKrishna(URL_, { apiKey: "k", fetchImpl: (async () => new Response("not an image")) as unknown as typeof fetch }), { ok: false, reason: "unknown_media_type" });
    assert.deepEqual(await io.askKrishna(URL_, { apiKey: "k", fetchImpl: okFetch }), { ok: false, reason: "refusal" });
    g.__anthropicCreate = async () => { throw Object.assign(new Error("overloaded"), { status: 529 }); };
    assert.deepEqual(await io.askKrishna(URL_, { apiKey: "k", fetchImpl: okFetch }), { ok: false, reason: "api_error_529" });
  });
});
