// Corrected re-renders: what a failed visual check feeds back into the next
// prompt, which research facts belong to a scene at all, and the storage side of
// swapping a corrected image onto a review row (_shared/rowRedo.ts).
// Offline: no network, no keys. The visual-check loops run against the Claude
// SDK stub (tests/helpers), and rowRedo against an in-memory fake.
// Run: node --experimental-strip-types --test tests/
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { factFitsScene, factsForScene } from "../supabase/functions/_shared/sceneResearchCore.ts";
import { MAX_CORRECTION_CHARS, correctionLead, mergeFailed } from "../supabase/functions/_shared/visualCheckCore.ts";
import { rowRedoHandlers } from "../supabase/functions/_shared/rowRedo.ts";

register("./helpers/npm-stub-hooks.mjs", import.meta.url);
// deno-lint-ignore no-explicit-any
const io: any = await import("../supabase/functions/_shared/visualCheck.ts");
// deno-lint-ignore no-explicit-any
const g = globalThis as any;
// deno-lint-ignore no-explicit-any
type Json = any;

const BOW = "Arjuna holding Gandiva, a divine bow of Arjuna";
const HORSES = "Arjuna's chariot is drawn by exactly four white horses, no more and no fewer";
const KRISHNA = "Krishna has blue skin, a peacock feather in his crown and yellow silk pitambara";
const YOGI = "A solitary MALE yogi in white cloth seated in lotus posture on kusa grass in a mountain cave. No other figures present.";
const CHARIOT = "Krishna holds the reins of Arjuna's chariot on the plain of Kurukshetra";
const POND = "A villager sweeps temple steps beside a still lotus pond at daybreak";

describe("factFitsScene", () => {
  test("a fact about a person the scene does not name is left out", () => {
    assert.equal(factFitsScene(BOW, YOGI), false);
    assert.equal(factFitsScene(KRISHNA, YOGI), false);
  });

  test("a fact about a person the scene names is kept, by any of their names", () => {
    assert.equal(factFitsScene(BOW, CHARIOT), true);
    assert.equal(factFitsScene(BOW, "Partha stands ready with his bow"), true, "an alias counts");
  });

  test("the scene's character list counts as naming them", () => {
    assert.equal(factFitsScene(BOW, "A warrior prince listens on the battlefield", ["Arjuna"]), true);
  });

  test("a chariot fact is left out of a scene with no chariot, even with no one named", () => {
    assert.equal(factFitsScene("chariot drawn by four white horses", POND), false);
    assert.equal(factFitsScene("chariot drawn by four white horses", CHARIOT), true);
  });

  test("a fact naming nobody and no chariot is kept: nothing says it is out of place", () => {
    assert.equal(factFitsScene("the sky is lit with a golden dawn", YOGI), true);
  });

  test("with no scene text to judge by, a fact is kept", () => {
    assert.equal(factFitsScene(BOW, ""), true);
    assert.equal(factFitsScene(BOW, null), true);
  });

  test("an empty or non-string fact never fits", () => {
    assert.equal(factFitsScene("", CHARIOT), false);
    assert.equal(factFitsScene(42, CHARIOT), false);
  });
});

describe("factsForScene", () => {
  test("keeps the facts that fit, in their order", () => {
    assert.deepEqual(factsForScene([KRISHNA, BOW, HORSES], CHARIOT), [KRISHNA, BOW, HORSES]);
  });

  test("chapter 6's yogi alone in a cave gets none of the chapter's Krishna and Arjuna facts", () => {
    assert.deepEqual(factsForScene([KRISHNA, BOW, HORSES], YOGI), []);
  });

  test("anything but an array is no facts", () => {
    assert.deepEqual(factsForScene("not a list", CHARIOT), []);
  });
});

describe("correctionLead", () => {
  test("names what must be shown and what was wrong", () => {
    const lead = correctionLead([{ fact: HORSES, observed: "3 horses counted" }]);
    assert.equal(lead, `CORRECTION — the painting must clearly show: ${HORSES}. The previous attempt was wrong: 3 horses counted.`);
  });

  test("lists several wrong details together", () => {
    const lead = correctionLead([{ fact: HORSES, observed: "3 horses" }, { fact: KRISHNA, observed: "no crown" }]);
    assert.match(lead, /must clearly show: Arjuna's chariot .*; Krishna has blue skin/);
    assert.match(lead, /was wrong: 3 horses; no crown\./);
  });

  test("is empty when nothing failed, so the prompt is left exactly as it was", () => {
    assert.equal(correctionLead([]), "");
    assert.equal(correctionLead(undefined), "");
    assert.equal(correctionLead([{ fact: "", observed: "x" }]), "");
  });

  test("never runs past its limit, however long the details", () => {
    const long = Array.from({ length: 12 }, (_, i) => ({ fact: `${HORSES} ${i}`, observed: "a very long description of what was seen instead ".repeat(3) }));
    const lead = correctionLead(long);
    assert.ok(lead.length <= MAX_CORRECTION_CHARS, String(lead.length));
    assert.ok(lead.startsWith("CORRECTION — the painting must clearly show:"));
    assert.ok(lead.endsWith("."));
  });

  test("leaves out an empty observation rather than saying nothing was seen", () => {
    assert.equal(correctionLead([{ fact: HORSES, observed: "" }]), `CORRECTION — the painting must clearly show: ${HORSES}.`);
  });
});

describe("mergeFailed", () => {
  test("keeps each fact once, with its most recent observation", () => {
    const merged = mergeFailed([{ fact: HORSES, observed: "3 horses" }], [{ fact: HORSES, observed: "5 horses" }, { fact: BOW, observed: "no bow" }]);
    assert.deepEqual(merged, [{ fact: HORSES, observed: "5 horses" }, { fact: BOW, observed: "no bow" }]);
  });

  test("a fact fixed by a later attempt is still remembered, so it does not come back", () => {
    assert.deepEqual(mergeFailed([{ fact: BOW, observed: "no bow" }], []), [{ fact: BOW, observed: "no bow" }]);
  });

  test("ignores anything that is not a failed fact", () => {
    assert.deepEqual(mergeFailed(null, [null, { observed: "x" }, { fact: HORSES }]), [{ fact: HORSES, observed: "" }]);
  });
});

// ── The loops hand the correction to every re-render ─────────────────────────

const png = (n: number) => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, n]).toString("base64");

describe("re-renders are corrected", () => {
  const ENV: Record<string, string> = { ANTHROPIC_API_KEY: "test" };
  let saved: { deno: unknown; create: unknown; hadDeno: boolean };
  before(() => {
    saved = { deno: g.Deno, create: g.__anthropicCreate, hadDeno: "Deno" in g };
    g.Deno = { env: { get: (k: string) => ENV[k] } };
  });
  after(() => {
    if (saved.hadDeno) g.Deno = saved.deno;
    else delete g.Deno;
    g.__anthropicCreate = saved.create;
  });

  /** Vision answers: each entry is how many of the facts are clearly wrong on that check. */
  function vision(plan: number[]) {
    let calls = 0;
    g.__anthropicCreate = async (params: Json) => {
      const text: string = params.messages[0].content[1].text;
      const n = [...text.matchAll(/^\d+\. /gm)].length;
      const wrong = plan[Math.min(calls, plan.length - 1)];
      calls++;
      const checks = Array.from({ length: n }, (_, i) => ({
        fact_index: i + 1,
        verdict: i < wrong ? "no" : "yes",
        observed: i < wrong ? `wrong ${calls}` : "shown",
      }));
      return { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t", name: "record_visual_check", input: { checks } }] };
    };
  }

  test("renderWithVisualCheck: the first render gets no correction, the re-render gets what the check found", async () => {
    vision([1, 0]);
    const corrections: unknown[] = [];
    const out = await io.renderWithVisualCheck({
      facts: [HORSES, BOW],
      maxAttempts: 3,
      deadlineAt: Date.now() + 300_000,
      log: () => {},
      render: async (i: number, _signal?: AbortSignal, correction?: unknown) => {
        corrections.push(correction);
        return { b64: png(i), model: "m" };
      },
    });
    assert.equal(out.record.status, "pass");
    assert.equal(corrections.length, 2);
    assert.equal(corrections[0], undefined);
    assert.deepEqual(corrections[1], [{ fact: HORSES, observed: "wrong 1" }]);
  });

  test("redoInBackground: each re-render gets every fact any attempt got wrong", async () => {
    // The stored image misses the horses; re-render 1 gets both wrong; re-render 2 passes.
    vision([1, 2, 0]);
    const corrections: Json[] = [];
    let stored = "first";
    const record = await io.redoInBackground({
      first: { b64: png(0), model: "m" },
      facts: [HORSES, BOW],
      maxAttempts: 3,
      deadlineAt: Date.now() + 300_000,
      log: () => {},
      render: async (i: number, _signal?: AbortSignal, correction?: unknown) => {
        corrections.push(correction);
        return { b64: png(i), model: "m" };
      },
      swap: async (attempt: Json) => ((stored = `r${attempt.index}`), true),
      writeRecord: async () => true,
    });
    assert.equal(record.status, "pass");
    assert.equal(stored, "r2");
    assert.deepEqual(corrections[0], [{ fact: HORSES, observed: "wrong 1" }]);
    assert.deepEqual(corrections[1], [{ fact: HORSES, observed: "wrong 2" }, { fact: BOW, observed: "wrong 2" }]);
  });
});

// ── rowRedoHandlers ──────────────────────────────────────────────────────────

/** An in-memory review table plus storage, enough of supabase-js for rowRedo. */
function fakeSupabase(row: Json, o: { updateError?: { message: string } } = {}) {
  const uploads: string[] = [];
  const removed: string[] = [];
  const updates: Array<{ values: Json; filters: Array<[string, unknown]> }> = [];
  return {
    uploads,
    removed,
    updates,
    from(_table: string) {
      const filters: Array<[string, unknown]> = [];
      let op = "select";
      let values: Json = null;
      let single = false;
      const b: Json = {
        select: () => b,
        update: (v: Json) => ((op = "update"), (values = v), b),
        eq: (c: string, v: unknown) => (filters.push([c, v]), b),
        is: (c: string, v: unknown) => (filters.push([c, v]), b),
        not: () => b,
        maybeSingle: () => ((single = true), b),
        then(res: Json, rej: Json) {
          const hit = filters.every(([c, v]) => row[c] === v);
          if (op === "update") {
            updates.push({ values, filters: [...filters] });
            if (o.updateError) return Promise.resolve({ data: null, error: o.updateError }).then(res, rej);
            if (hit) Object.assign(row, values);
            return Promise.resolve({ data: hit ? [{ id: row.id }] : [], error: null }).then(res, rej);
          }
          const data = single ? (hit ? { ...row } : null) : hit ? [{ ...row }] : [];
          return Promise.resolve({ data, error: null }).then(res, rej);
        },
      };
      return b;
    },
    storage: {
      from: () => ({
        upload: async (path: string) => (uploads.push(path), { error: null }),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/${path}` } }),
        remove: async (paths: string[]) => (removed.push(...paths), { error: null }),
      }),
    },
  };
}

describe("rowRedoHandlers", () => {
  const target = (supabase: Json, extra: Json = {}) => ({
    supabase,
    table: "gita_chapter_art_review",
    id: 9,
    bucket: "instagram-images",
    stored: { url: "https://storage.test/first.jpg", path: "first.jpg" },
    fileName: (i: number) => `next-r${i}.jpg`,
    tag: "test",
    log: () => {},
    ...extra,
  });

  test("swap stores a new file and points a still-pending row at it", async () => {
    const row = { id: 9, status: "pending", image_path: "first.jpg", image_url: "https://storage.test/first.jpg" };
    const sb = fakeSupabase(row);
    const h = rowRedoHandlers(target(sb));
    assert.equal(await h.swap({ b64: png(1), index: 1 }, { status: "pass" }), true);
    assert.equal(row.image_path, "next-r1.jpg");
    assert.deepEqual(sb.updates[0].filters, [["id", 9], ["image_path", "first.jpg"], ["status", "pending"]]);
    assert.deepEqual(h.current(), { url: "https://storage.test/next-r1.jpg", path: "next-r1.jpg" });
    assert.deepEqual(sb.removed, [], "the replaced file is kept");
  });

  test("a row the reviewer has decided keeps its image, and the new file is deleted", async () => {
    const row = { id: 9, status: "approved", image_path: "first.jpg" };
    const sb = fakeSupabase(row);
    const h = rowRedoHandlers(target(sb));
    assert.equal(await h.swap({ b64: png(1), index: 1 }, { status: "pass" }), false);
    assert.equal(row.image_path, "first.jpg");
    assert.deepEqual(sb.removed, ["next-r1.jpg"]);
    assert.equal(await h.stillCurrent(), false);
  });

  test("a row whose image was replaced meanwhile is not current, and keeps its image", async () => {
    const row = { id: 9, status: "pending", image_path: "someone-else.jpg" };
    const sb = fakeSupabase(row);
    const h = rowRedoHandlers(target(sb));
    assert.equal(await h.stillCurrent(), false);
    assert.equal(await h.swap({ b64: png(1), index: 1 }, { status: "pass" }), false);
    assert.equal(row.image_path, "someone-else.jpg");
  });

  test("a failed update whose row turns out to hold the new file counts as swapped, and nothing is deleted", async () => {
    // The write landed but its response was lost.
    const row: Json = { id: 9, status: "pending", image_path: "next-r1.jpg" };
    const sb = fakeSupabase(row, { updateError: { message: "connection reset" } });
    const h = rowRedoHandlers(target(sb));
    assert.equal(await h.swap({ b64: png(1), index: 1 }, { status: "pass" }), true);
    assert.deepEqual(sb.removed, []);
  });

  test("keyed by image_url for a table without image_path, and only the url is written", async () => {
    const row: Json = { id: 9, image_url: "https://storage.test/first.jpg", approved: false };
    const sb = fakeSupabase(row);
    const h = rowRedoHandlers(target(sb, { table: "reader_scenes", casColumn: "image_url", requirePending: false }));
    assert.equal(await h.stillCurrent(), true);
    assert.equal(await h.swap({ b64: png(1), index: 1 }, { status: "pass" }), true);
    assert.equal(row.image_url, "https://storage.test/next-r1.jpg");
    assert.equal("image_path" in sb.updates[0].values, false);
    assert.deepEqual(sb.updates[0].filters, [["id", 9], ["image_url", "https://storage.test/first.jpg"]]);
  });

  test("writeRecord stamps the record on whichever image the row holds now", async () => {
    const row: Json = { id: 9, status: "pending", image_path: "first.jpg" };
    const sb = fakeSupabase(row);
    const h = rowRedoHandlers(target(sb, { recordValue: (r: Json) => ({ ...r, safe_fallback: false }) }));
    await h.swap({ b64: png(1), index: 1 }, { status: "fail" });
    assert.equal(await h.writeRecord({ status: "pass" }), true);
    assert.deepEqual(row.visual_check, { status: "pass", safe_fallback: false });
    assert.deepEqual(sb.updates.at(-1)!.filters, [["id", 9], ["image_path", "next-r1.jpg"]]);
  });

  test("an extra guard, such as an unclaimed post, is part of every compare-and-swap", async () => {
    const row: Json = { id: 9, status: "pending", image_path: "first.jpg", reviewed_at: "2026-10-18T10:00:00Z" };
    const sb = fakeSupabase(row);
    const h = rowRedoHandlers(target(sb, { guard: (q: Json) => q.is("reviewed_at", null) }));
    assert.equal(await h.stillCurrent(), false);
    assert.equal(await h.swap({ b64: png(1), index: 1 }, { status: "pass" }), false);
  });
});
