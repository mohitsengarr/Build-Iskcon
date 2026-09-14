// approve-instagram-post acts only on the image the reviewer saw, marks a post
// before it publishes it, and marks a post rejected before it deletes its image
// (v12).
//
// instagram-post re-renders a wrong image in the background after it responds
// and swaps a better render into a pending post only while reviewed_at is null.
// Approve and reject stamp reviewed_at on a pending, unclaimed row in one
// compare-and-swap (the claim) and then work from the row that claim returns.
// - The gallery sends the image_path its card shows and both claims require it: a
//   render swapped in after the reviewer looked gets 409 image_changed with the
//   new image. A request without image_path claims whatever the row holds (legacy).
// - When no claim matches, the row is read again and the 409 says why:
//   already_<status>, image_changed, claimed or publish_unknown.
// - Approve sets publish_started_at on its own claim before any Meta or channel
//   call; a stale claim with that marker is never taken over (publish_unknown). A
//   marker update that errors releases the claim and clears the marker: nothing
//   was published. The final approve update is retried once, then answers 500
//   saying the post was published and must not be approved again.
// - Reject marks the row rejected on its claim before it deletes the image, and a
//   failed update releases the claim and deletes nothing.
//
// The handler is imported under node with its Deno-only specifiers stubbed
// (helpers/edge-function-hooks.mjs). The database, storage, fetch (the Meta Graph
// API and instagram-post) and EdgeRuntime.waitUntil are fakes. No network.
// Run: node --experimental-strip-types --test tests/
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./helpers/edge-function-hooks.mjs", import.meta.url);

// deno-lint-ignore no-explicit-any
const g = globalThis as any;
// deno-lint-ignore no-explicit-any
type Json = any;

const GRAPH = "https://graph.facebook.com/v21.0";
const ENV: Record<string, string> = {
  SUPABASE_URL: "https://sb.test",
  SUPABASE_SERVICE_ROLE_KEY: "service-test",
  IG_USER_ID: "ig-user",
  META_ACCESS_TOKEN: "meta-test",
};
const OLD = { path: "ig-canto11-ch1-1.jpg", url: "https://storage.test/ig-canto11-ch1-1.jpg" };
const NEW = { path: "ig-canto11-ch1-1-r1.jpg", url: "https://storage.test/ig-canto11-ch1-1-r1.jpg" };
const REREAD_COLUMNS = "id,status,reviewed_at,image_url,image_path,publish_started_at,visual_check";
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const MINUTE = 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
// A claim stamped by another request.
const OTHER_CLAIM = "2026-09-14T09:00:00.000Z";

/** What an ig_pending_review query is, from its operation and the values it writes. */
type Kind = "read" | "reread" | "claim" | "release" | "marker" | "approve" | "reject" | "other";

interface Query {
  table: string;
  op: "select" | "update" | "insert";
  kind: Kind;
  eq: Array<[string, unknown]>;
  is: Array<[string, unknown]>;
  lt: Array<[string, unknown]>;
  selected: string | null;
  values: Json;
}

function kindOf(q: Query): Kind {
  if (q.table !== "ig_pending_review") return "other";
  if (q.op === "select") return q.selected === "*" ? "read" : "reread";
  const values = q.values ?? {};
  const keys = Object.keys(values);
  if ("reviewed_at" in values && values.reviewed_at === null) return "release";
  if (keys.length === 1 && keys[0] === "reviewed_at") return "claim";
  if (keys.includes("publish_started_at")) return "marker";
  if (values.status === "approved") return "approve";
  if (values.status === "rejected") return "reject";
  return "other";
}

interface DbOptions {
  /** Runs before the nth ig_pending_review query of a kind (1-based) is answered. */
  before?: (kind: Kind, n: number) => void;
  /** The error message for the nth ig_pending_review query of a kind, or null to answer it. */
  fail?: (kind: Kind, n: number) => string | null;
  /** Like fail, but the update is applied first: the change lands and its answer is lost. */
  failAfterApply?: (kind: Kind, n: number) => string | null;
}

/**
 * One ig_pending_review row. Updates honour eq / is(null) / lt filters the way
 * PostgREST applies them and, with .select(), return the rows they changed; reads
 * return the selected columns. events: "<op>:<kind>" per review-table query,
 * "insert:<table>" for the channel post and "remove:<paths>" per storage delete.
 */
function makeDb(row: Json, o: DbOptions = {}) {
  const queries: Query[] = [];
  const removed: string[] = [];
  const events: string[] = [];
  const counts = new Map<Kind, number>();
  const matches = (q: Query) =>
    q.eq.every(([c, v]) => row[c] === v) &&
    q.is.every(([c, v]) => (row[c] ?? null) === v) &&
    q.lt.every(([c, v]) => row[c] != null && String(row[c]) < String(v));
  const answer = (q: Query) => {
    if (q.table !== "ig_pending_review") return { data: null, error: null };
    const n = (counts.get(q.kind) ?? 0) + 1;
    counts.set(q.kind, n);
    o.before?.(q.kind, n);
    const failure = o.fail?.(q.kind, n) ?? null;
    if (failure) return { data: null, error: { message: failure } };
    if (q.op === "select") {
      if (q.selected === "*") return { data: { ...row }, error: null };
      return { data: Object.fromEntries(String(q.selected).split(",").map((c) => [c, row[c] ?? null])), error: null };
    }
    const hit = matches(q);
    if (hit) Object.assign(row, q.values);
    const lost = o.failAfterApply?.(q.kind, n) ?? null;
    if (lost) return { data: null, error: { message: lost } };
    return { data: q.selected === null ? null : hit ? [{ ...row }] : [], error: null };
  };
  return {
    queries,
    removed,
    events,
    /** The ig_pending_review queries of one kind, in order. */
    of: (kind: Kind) => queries.filter((q) => q.kind === kind),
    from(table: string) {
      const q: Query = { table, op: "select", kind: "other", eq: [], is: [], lt: [], selected: null, values: null };
      const b: Json = {
        select: (c?: string) => ((q.selected = c ?? "*"), b),
        eq: (c: string, v: unknown) => (q.eq.push([c, v]), b),
        is: (c: string, v: unknown) => (q.is.push([c, v]), b),
        lt: (c: string, v: unknown) => (q.lt.push([c, v]), b),
        single: () => b,
        maybeSingle: () => b,
        update: (v: Json) => ((q.op = "update"), (q.values = v), b),
        insert: (v: Json) => ((q.op = "insert"), (q.values = v), b),
        then(res: Json, rej: Json) {
          q.kind = kindOf(q);
          queries.push(q);
          events.push(table === "ig_pending_review" ? `${q.op}:${q.kind}` : `${q.op}:${table}`);
          return Promise.resolve(answer(q)).then(res, rej);
        },
      };
      return b;
    },
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          removed.push(...paths);
          events.push(`remove:${paths.join(",")}`);
          return { data: [], error: null };
        },
      }),
    },
  };
}

function makeNet(events: string[]) {
  /** The body of each Meta media-container request. */
  const media: Json[] = [];
  /** The body of each Meta media_publish request. */
  const publishes: Json[] = [];
  const functionCalls: Json[] = [];
  const fn = async (url: string | URL, init: RequestInit = {}) => {
    const u = String(url);
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200, headers: { "content-type": "application/json" } });
    if (u === `${GRAPH}/ig-user/media`) {
      events.push("graph:media");
      media.push(body);
      return json({ id: "container-1" });
    }
    if (u.startsWith(`${GRAPH}/container-1?`)) return json({ status_code: "FINISHED" });
    if (u === `${GRAPH}/ig-user/media_publish`) {
      events.push("graph:publish");
      publishes.push(body);
      return json({ id: "media-1" });
    }
    if (u === "https://sb.test/functions/v1/instagram-post") {
      functionCalls.push(body);
      return json({ success: true, pendingReviewId: 78 });
    }
    return new Response("unexpected " + u, { status: 404 });
  };
  return { fn, media, publishes, functionCalls };
}

/** Each expected event occurs, in this order (other events may come between). */
function assertInOrder(events: string[], expected: string[]) {
  let at = -1;
  for (const e of expected) {
    const i = events.indexOf(e, at + 1);
    assert.ok(i > at, `expected ${e} after position ${at} in: ${events.join(" ")}`);
    at = i;
  }
}

describe("approve-instagram-post claims the image the reviewer saw", () => {
  const saved: Record<string, unknown> = {};
  const SAVED = ["Deno", "EdgeRuntime", "fetch", "__sb"];
  let handler: (req: Request) => Promise<Response>;
  let waits: Promise<unknown>[] = [];
  const realError = console.error;

  before(async () => {
    for (const k of SAVED) saved[k] = g[k];
    g.Deno = { env: { get: (k: string) => ENV[k] }, serve: (h: typeof handler) => { handler = h; } };
    g.EdgeRuntime = { waitUntil: (p: Promise<unknown>) => { waits.push(Promise.resolve(p)); } };
    g.__sb = makeDb({});
    await import("../supabase/functions/approve-instagram-post/index.ts?claim-tests");
    assert.equal(typeof handler, "function");
  });

  after(() => {
    console.error = realError;
    for (const k of SAVED) g[k] = saved[k];
  });

  beforeEach(() => {
    waits = [];
    console.error = () => {};
  });

  const pendingRow = (extra: Json = {}) => ({
    id: 77,
    status: "pending",
    chapter_global_number: 293,
    chapter_title: "Chapter",
    image_url: OLD.url,
    image_path: OLD.path,
    caption: "caption",
    hashtags: "#tags",
    mahajan_key: null,
    reviewed_at: null,
    ...extra,
  });

  function setup(row: Json, o: DbOptions = {}) {
    const db = makeDb(row, o);
    const net = makeNet(db.events);
    g.__sb = db;
    g.fetch = net.fn;
    return { db, net };
  }

  async function post(body: unknown) {
    const res = await handler(new Request("http://functions.test/", { method: "POST", body: JSON.stringify(body) }));
    const json = await res.json();
    await Promise.all(waits.splice(0));
    return { status: res.status, json };
  }

  // ── Approve ────────────────────────────────────────────────────────────────

  test("approve with the image the reviewer saw claims that image, marks publishing on its own claim, then publishes it", async () => {
    // Arrange
    const row = pendingRow();
    const { db, net } = setup(row);
    // Act
    const { status, json } = await post({ id: 77, action: "approve", image_path: OLD.path });
    // Assert
    assert.equal(status, 200, JSON.stringify(json));
    const [claim] = db.of("claim");
    assert.deepEqual(claim.eq, [["id", 77], ["status", "pending"], ["image_path", OLD.path]]);
    assert.deepEqual(claim.is, [["reviewed_at", null]]);
    assert.equal(claim.selected, "*");
    const [marker] = db.of("marker");
    assert.deepEqual(Object.keys(marker.values), ["publish_started_at"]);
    assert.match(marker.values.publish_started_at, ISO);
    assert.deepEqual(marker.eq, [["id", 77], ["reviewed_at", claim.values.reviewed_at]], "the marker is set on this request's own claim");
    assert.equal(marker.selected, "id");
    assertInOrder(db.events, ["update:claim", "update:marker", "graph:media", "graph:publish", "insert:bhaktigram_group_messages", "update:approve"]);
    assert.equal(net.media[0].image_url, OLD.url);
    assert.equal(net.publishes.length, 1);
    assert.equal(row.status, "approved");
    assert.equal(db.of("reread").length, 0, "a claim that matched needs no re-read");
  });

  test("an image swapped in after the reviewer saw the post is never published: 409 image_changed carries the new image, and nothing is claimed, published or posted", async () => {
    // Arrange: instagram-post's background redo swaps a better render in between the read and the claim
    const check = { status: "fail", attempts: 2, chosen_attempt: 1, failed: [], unclear: 0, reason: null };
    const row = pendingRow();
    const { db, net } = setup(row, {
      before: (kind, n) => {
        if (kind === "claim" && n === 1) Object.assign(row, { image_url: NEW.url, image_path: NEW.path, visual_check: check });
      },
    });
    // Act
    const { status, json } = await post({ id: 77, action: "approve", image_path: OLD.path });
    // Assert
    assert.equal(status, 409, JSON.stringify(json));
    assert.equal(json.status, "image_changed");
    assert.equal(json.image_url, NEW.url);
    assert.equal(json.image_path, NEW.path);
    assert.deepEqual(json.visual_check, check);
    const claims = db.of("claim");
    assert.equal(claims.length, 2, "the fresh claim, then the stale-claim takeover");
    for (const c of claims) assert.deepEqual(c.eq, [["id", 77], ["status", "pending"], ["image_path", OLD.path]]);
    assert.deepEqual(claims[0].is, [["reviewed_at", null]]);
    assert.deepEqual(db.of("reread").map((q) => [q.selected, q.eq]), [[REREAD_COLUMNS, [["id", 77]]]]);
    assert.equal(row.reviewed_at, null, "no claim was stamped");
    assert.equal(row.status, "pending");
    assert.equal(db.of("marker").length, 0);
    assert.equal(net.media.length, 0);
    assert.equal(db.events.includes("insert:bhaktigram_group_messages"), false);
  });

  test("a legacy request without image_path claims whatever image the row holds and publishes the image the claim returned", async () => {
    // Arrange: the redo swaps before the claim; an older gallery names no image
    const row = pendingRow();
    const { db, net } = setup(row, {
      before: (kind, n) => {
        if (kind === "claim" && n === 1) Object.assign(row, { image_url: NEW.url, image_path: NEW.path });
      },
    });
    // Act
    const { status, json } = await post({ id: 77, action: "approve" });
    // Assert
    assert.equal(status, 200, JSON.stringify(json));
    const [claim] = db.of("claim");
    assert.deepEqual(claim.eq, [["id", 77], ["status", "pending"]]);
    assert.deepEqual(claim.is, [["reviewed_at", null]]);
    assert.equal(db.of("marker").length, 1);
    assert.equal(net.media[0].image_url, NEW.url, "Meta gets the claimed row's image");
    assert.equal(row.status, "approved");
  });

  test("a post another request has freshly claimed is not published twice: 409 claimed says to try again in a few minutes, and nothing is sent", async () => {
    // Arrange
    const row = pendingRow({ reviewed_at: new Date().toISOString() });
    const claimedAt = row.reviewed_at;
    const { db, net } = setup(row);
    // Act
    const { status, json } = await post({ id: 77, action: "approve", image_path: OLD.path });
    // Assert
    assert.equal(status, 409, JSON.stringify(json));
    assert.equal(json.status, "claimed");
    assert.match(json.error, /try again in a few minutes/i);
    assert.equal(net.media.length, 0);
    assert.equal(row.status, "pending");
    assert.equal(row.reviewed_at, claimedAt, "the other request's claim is left alone");
    assert.equal(db.of("claim").length, 2, "the fresh claim, then the stale-claim takeover, both find no row");
    assert.deepEqual(db.of("reread").map((q) => q.selected), [REREAD_COLUMNS]);
  });

  test("a claim 9 minutes old still blocks a second approval", async () => {
    // Arrange
    const row = pendingRow({ reviewed_at: ago(9 * MINUTE) });
    const { net } = setup(row);
    // Act
    const { status, json } = await post({ id: 77, action: "approve", image_path: OLD.path });
    // Assert
    assert.equal(status, 409);
    assert.equal(json.status, "claimed");
    assert.equal(net.media.length, 0);
  });

  test("a stale claim with no publish marker is taken over: the request that left it died before it started publishing", async () => {
    // Arrange
    const row = pendingRow({ reviewed_at: ago(11 * MINUTE) });
    const { db, net } = setup(row);
    // Act
    const { status, json } = await post({ id: 77, action: "approve", image_path: OLD.path });
    // Assert
    assert.equal(status, 200, JSON.stringify(json));
    const [, stale] = db.of("claim");
    assert.deepEqual(stale.eq, [["id", 77], ["status", "pending"], ["image_path", OLD.path]]);
    assert.deepEqual(stale.lt.map(([c]) => c), ["reviewed_at"]);
    assert.deepEqual(stale.is, [["publish_started_at", null]]);
    assert.equal(db.of("marker").length, 1);
    assert.equal(net.publishes.length, 1);
    assert.equal(row.status, "approved");
  });

  test("a stale claim whose approval started publishing is never taken over: 409 publish_unknown names the time, with no Graph call", async () => {
    // Arrange: an approval set the marker 11 minutes ago, then died
    const startedAt = ago(11 * MINUTE);
    const row = pendingRow({ reviewed_at: startedAt, publish_started_at: startedAt });
    const { db, net } = setup(row);
    // Act
    const { status, json } = await post({ id: 77, action: "approve", image_path: OLD.path });
    // Assert
    assert.equal(status, 409, JSON.stringify(json));
    assert.equal(json.status, "publish_unknown");
    assert.equal(json.publish_started_at, startedAt);
    assert.ok(json.error.includes(`started publishing at ${startedAt}`), json.error);
    assert.match(json.error, /Check Instagram before approving again/);
    const [, stale] = db.of("claim");
    assert.deepEqual(stale.is, [["publish_started_at", null]]);
    assert.equal(row.reviewed_at, startedAt, "the stale claim is not taken over");
    assert.equal(db.of("marker").length, 0);
    assert.equal(net.media.length, 0);
    assert.equal(net.publishes.length, 0);
    assert.equal(db.events.includes("insert:bhaktigram_group_messages"), false);
  });

  test("a stale claim with no marker on a different image than the reviewer saw is not taken over: 409 image_changed", async () => {
    // Arrange: the card still shows the old image
    const row = pendingRow({ reviewed_at: ago(11 * MINUTE), image_url: NEW.url, image_path: NEW.path });
    const { db, net } = setup(row);
    // Act
    const { status, json } = await post({ id: 77, action: "approve", image_path: OLD.path });
    // Assert
    assert.equal(status, 409, JSON.stringify(json));
    assert.equal(json.status, "image_changed");
    assert.equal(json.image_path, NEW.path);
    assert.equal(db.of("marker").length, 0);
    assert.equal(net.media.length, 0);
  });

  test("an approval whose claim is taken over before it marks publishing publishes nothing: 409, no Graph call and no channel post", async () => {
    // Arrange: another request re-stamps the claim between this claim and the marker
    const row = pendingRow();
    const { db, net } = setup(row, {
      before: (kind) => {
        if (kind === "marker") row.reviewed_at = OTHER_CLAIM;
      },
    });
    // Act
    const { status, json } = await post({ id: 77, action: "approve", image_path: OLD.path });
    // Assert
    assert.equal(status, 409, JSON.stringify(json));
    assert.equal(json.status, "claimed");
    assert.match(json.error, /Nothing was published/);
    assert.equal(net.media.length, 0);
    assert.equal(db.events.includes("insert:bhaktigram_group_messages"), false);
    assert.equal(row.publish_started_at, undefined);
    assert.equal(row.reviewed_at, OTHER_CLAIM, "the other request's claim is left alone");
    assert.equal(db.of("approve").length, 0);
    assert.equal(db.of("release").length, 0);
  });

  test("a publish marker update that errors publishes nothing and releases this request's own claim: 503, and the post can be approved again at once", async () => {
    // Arrange
    const row = pendingRow();
    const { db, net } = setup(row, { fail: (kind, n) => (kind === "marker" && n === 1 ? "timeout" : null) });
    // Act
    const first = await post({ id: 77, action: "approve", image_path: OLD.path });
    // Assert
    assert.equal(first.status, 503, JSON.stringify(first.json));
    assert.match(first.json.error, /timeout/);
    assert.match(first.json.error, /Nothing was published/);
    assert.equal(net.media.length, 0);
    assert.equal(db.events.includes("insert:bhaktigram_group_messages"), false);
    assert.equal(row.status, "pending");
    const [claim] = db.of("claim");
    const releases = db.of("release");
    assert.equal(releases.length, 1, "the claim is released: nothing was published under it");
    assert.deepEqual(releases[0].eq, [["id", 77], ["reviewed_at", claim.values.reviewed_at]], "only this request's own claim");
    assert.deepEqual(releases[0].values, { reviewed_at: null, publish_started_at: null });
    assertInOrder(db.events, ["update:claim", "update:marker", "update:release"]);
    assert.equal(row.reviewed_at, null);
    // Act: approve again at once, as a reviewer does after the 503
    const second = await post({ id: 77, action: "approve", image_path: OLD.path });
    // Assert
    assert.equal(second.status, 200, JSON.stringify(second.json));
    assert.equal(net.publishes.length, 1, "published once");
    assert.equal(row.status, "approved");
  });

  test("a publish marker update that was applied but answered with an error leaves no marker behind, so a later claim that dies before its own marker is still taken over, not answered publish_unknown", async () => {
    // Arrange: the marker is written, and its answer is lost
    const row = pendingRow();
    const { db, net } = setup(row, { failAfterApply: (kind, n) => (kind === "marker" && n === 1 ? "connection reset" : null) });
    // Act
    const first = await post({ id: 77, action: "approve", image_path: OLD.path });
    // Assert
    assert.equal(first.status, 503, JSON.stringify(first.json));
    assert.equal(net.media.length, 0);
    assert.equal(row.reviewed_at, null, "the claim is released");
    assert.equal(row.publish_started_at, null, "the marker the failed update wrote is cleared: nothing was published");
    // Arrange: a later approval claims the post and dies before it writes its own marker
    row.reviewed_at = ago(11 * MINUTE);
    // Act
    const second = await post({ id: 77, action: "approve", image_path: OLD.path });
    // Assert
    assert.equal(second.status, 200, JSON.stringify(second.json));
    assert.equal(db.of("reread").length, 0, "the stale claim was taken over, with no publish_unknown re-read");
    assert.equal(net.publishes.length, 1, "published once");
    assert.equal(row.status, "approved");
  });

  test("the final approve update is retried once: a retry that succeeds approves the post, published once", async () => {
    // Arrange
    const row = pendingRow();
    const { db, net } = setup(row, { fail: (kind, n) => (kind === "approve" && n === 1 ? "connection reset" : null) });
    // Act
    const { status, json } = await post({ id: 77, action: "approve", image_path: OLD.path });
    // Assert
    assert.equal(status, 200, JSON.stringify(json));
    const approves = db.of("approve");
    assert.equal(approves.length, 2);
    assert.deepEqual(approves[1].values, approves[0].values, "the retry writes the same values");
    assert.equal(row.status, "approved");
    assert.equal(net.publishes.length, 1);
  });

  test("a final approve update that fails twice answers 500 saying the post was published and must not be approved again, and no later approval publishes it twice", async () => {
    // Arrange
    const row = pendingRow();
    const { db, net } = setup(row, { fail: (kind) => (kind === "approve" ? "connection reset" : null) });
    // Act
    const first = await post({ id: 77, action: "approve", image_path: OLD.path });
    // Assert: published, the update retried once, and the answer says so
    assert.equal(first.status, 500, JSON.stringify(first.json));
    assert.equal(db.of("approve").length, 2, "the approve update is retried once");
    assert.equal(first.json.published, true);
    assert.equal(first.json.via, "meta");
    assert.deepEqual(first.json.buffer, [{ service: "instagram", postId: "media-1" }]);
    assert.equal(first.json.publishNote, null);
    assert.equal(first.json.doNotRepeat, true);
    assert.match(first.json.error, /connection reset/);
    assert.match(first.json.error, /published to Instagram/);
    assert.match(first.json.error, /Do not approve it again/);
    assert.equal(row.status, "pending");
    assert.equal(row.reviewed_at, db.of("claim")[0].values.reviewed_at, "the claim is kept");
    assert.match(row.publish_started_at, ISO, "the marker is kept");
    assert.equal(db.of("release").length, 0);
    // Act: a retry at once, then one after the claim went stale
    const second = await post({ id: 77, action: "approve", image_path: OLD.path });
    row.reviewed_at = ago(11 * MINUTE);
    const third = await post({ id: 77, action: "approve", image_path: OLD.path });
    // Assert
    assert.equal(second.status, 409);
    assert.equal(second.json.status, "claimed");
    assert.equal(third.status, 409);
    assert.equal(third.json.status, "publish_unknown");
    assert.equal(net.media.length, 1, "one media container");
    assert.equal(net.publishes.length, 1, "published once");
  });

  test("a post that is no longer pending gets the old 409 and no claim is attempted", async () => {
    // Arrange
    const row = pendingRow({ status: "approved" });
    const { db } = setup(row);
    // Act
    const { status, json } = await post({ id: 77, action: "approve", image_path: OLD.path });
    // Assert
    assert.equal(status, 409);
    assert.equal(json.error, "Already approved");
    assert.equal(db.of("claim").length, 0);
  });

  test("a post approved between the read and the claim: the re-read answers 409 already_approved with the old text", async () => {
    // Arrange
    const row = pendingRow();
    const { db, net } = setup(row, {
      before: (kind, n) => {
        if (kind === "claim" && n === 1) Object.assign(row, { status: "approved", reviewed_at: new Date().toISOString() });
      },
    });
    // Act
    const { status, json } = await post({ id: 77, action: "approve", image_path: OLD.path });
    // Assert
    assert.equal(status, 409, JSON.stringify(json));
    assert.equal(json.status, "already_approved");
    assert.equal(json.error, "Already approved");
    assert.equal(db.of("reread").length, 1);
    assert.equal(net.media.length, 0);
  });

  test("a claim whose update errors returns 503 and publishes nothing", async () => {
    // Arrange
    const row = pendingRow();
    const { net } = setup(row, { fail: (kind) => (kind === "claim" ? "timeout" : null) });
    // Act
    const { status, json } = await post({ id: 77, action: "approve", image_path: OLD.path });
    // Assert
    assert.equal(status, 503);
    assert.match(json.error, /Could not claim post 77: timeout/);
    assert.equal(net.media.length, 0);
    assert.equal(row.status, "pending");
  });

  test("a re-read that errors after both claims missed returns 503 and publishes nothing", async () => {
    // Arrange
    const row = pendingRow({ reviewed_at: new Date().toISOString() });
    const { net } = setup(row, { fail: (kind) => (kind === "reread" ? "timeout" : null) });
    // Act
    const { status, json } = await post({ id: 77, action: "approve", image_path: OLD.path });
    // Assert
    assert.equal(status, 503, JSON.stringify(json));
    assert.match(json.error, /Could not read post 77/);
    assert.match(json.error, /timeout/);
    assert.equal(net.media.length, 0);
  });

  // ── Reject ─────────────────────────────────────────────────────────────────

  test("reject marks the row rejected on its own claim before it deletes the image, then queues the regeneration", async () => {
    // Arrange
    const row = pendingRow();
    const { db, net } = setup(row);
    // Act
    const { status, json } = await post({ id: 77, action: "reject", image_path: OLD.path });
    // Assert
    assert.equal(status, 200, JSON.stringify(json));
    assertInOrder(db.events, ["update:claim", "update:reject", `remove:${OLD.path}`]);
    const [claim] = db.of("claim");
    const [reject] = db.of("reject");
    assert.deepEqual(reject.eq, [["id", 77], ["reviewed_at", claim.values.reviewed_at]]);
    assert.equal(reject.selected, "id");
    assert.match(reject.values.reviewed_at, ISO);
    assert.deepEqual(db.removed, [OLD.path]);
    assert.equal(row.status, "rejected");
    assert.deepEqual(net.functionCalls, [{ chapter_global_number: 293 }]);
    assert.equal(db.of("marker").length, 0, "a reject never marks publishing");
  });

  test("reject of an image swapped in after the reviewer saw it deletes nothing: 409 image_changed, and no regeneration", async () => {
    // Arrange
    const row = pendingRow();
    const { db, net } = setup(row, {
      before: (kind, n) => {
        if (kind === "claim" && n === 1) Object.assign(row, { image_url: NEW.url, image_path: NEW.path });
      },
    });
    // Act
    const { status, json } = await post({ id: 77, action: "reject", image_path: OLD.path });
    // Assert
    assert.equal(status, 409, JSON.stringify(json));
    assert.equal(json.status, "image_changed");
    assert.equal(json.image_url, NEW.url);
    assert.deepEqual(db.removed, []);
    assert.deepEqual(net.functionCalls, []);
    assert.equal(row.status, "pending");
    assert.equal(db.of("reject").length, 0);
  });

  test("a reject update that errors releases the claim and deletes nothing: 500, and the post can be rejected again at once", async () => {
    // Arrange
    const row = pendingRow();
    const { db, net } = setup(row, { fail: (kind, n) => (kind === "reject" && n === 1 ? "connection reset" : null) });
    // Act
    const first = await post({ id: 77, action: "reject", image_path: OLD.path });
    // Assert
    assert.equal(first.status, 500, JSON.stringify(first.json));
    assert.match(first.json.error, /Reject update: connection reset/);
    assert.match(first.json.error, /Nothing was deleted/);
    assert.deepEqual(db.removed, []);
    assert.deepEqual(net.functionCalls, []);
    assert.equal(row.status, "pending");
    assert.equal(row.reviewed_at, null, "the claim is released");
    const [release] = db.of("release");
    assert.deepEqual(release.eq, [["id", 77], ["reviewed_at", db.of("claim")[0].values.reviewed_at]]);
    // Act
    const second = await post({ id: 77, action: "reject", image_path: OLD.path });
    // Assert
    assert.equal(second.status, 200, JSON.stringify(second.json));
    assert.deepEqual(db.removed, [OLD.path]);
    assert.equal(row.status, "rejected");
    assert.deepEqual(net.functionCalls, [{ chapter_global_number: 293 }]);
  });

  test("a reject update that matches no row (the claim was taken over) deletes nothing: 409, and the other claim stays", async () => {
    // Arrange
    const row = pendingRow();
    const { db, net } = setup(row, {
      before: (kind) => {
        if (kind === "reject") row.reviewed_at = OTHER_CLAIM;
      },
    });
    // Act
    const { status, json } = await post({ id: 77, action: "reject", image_path: OLD.path });
    // Assert
    assert.equal(status, 409, JSON.stringify(json));
    assert.equal(json.status, "claimed");
    assert.deepEqual(db.removed, []);
    assert.deepEqual(net.functionCalls, []);
    assert.equal(row.status, "pending");
    assert.equal(row.reviewed_at, OTHER_CLAIM, "the release only touches this request's own claim");
  });

  test("reject on a stale claim whose approval started publishing deletes nothing: 409 publish_unknown, and no regeneration", async () => {
    // Arrange
    const startedAt = ago(11 * MINUTE);
    const row = pendingRow({ reviewed_at: startedAt, publish_started_at: startedAt });
    const { db, net } = setup(row);
    // Act
    const { status, json } = await post({ id: 77, action: "reject", image_path: OLD.path });
    // Assert
    assert.equal(status, 409, JSON.stringify(json));
    assert.equal(json.status, "publish_unknown");
    assert.deepEqual(db.removed, []);
    assert.deepEqual(net.functionCalls, []);
    assert.equal(row.status, "pending");
    assert.equal(db.of("reject").length, 0);
  });
});
