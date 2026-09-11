// Read-only diagnostic: ask Buffer what actually happened to posts we created.
//
// approve-instagram-post records the Buffer post ids it gets back, but nothing
// ever checked whether Buffer went on to PUBLISH them. When posts stop appearing
// on Instagram while our own rows look healthy, this is the missing half of the
// picture. Publishes nothing; only reads status.
//
// POST { post_ids: ["6a97a56e...", ...] }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const BUFFER_API = "https://api.buffer.com";
const BUFFER_KEY = Deno.env.get("BUFFER_API_KEY") || "";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

async function gql(query: string, variables?: Record<string, unknown>) {
  const r = await fetch(BUFFER_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${BUFFER_KEY}` },
    body: JSON.stringify({ query, variables }),
  });
  const body = await r.text();
  try { return { ok: r.ok, status: r.status, json: JSON.parse(body) }; }
  catch { return { ok: false, status: r.status, json: { raw: body.slice(0, 400) } }; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!BUFFER_KEY) return new Response(JSON.stringify({ error: "BUFFER_API_KEY not configured" }), { status: 500, headers: CORS });

  try {
    const { post_ids } = await req.json() as { post_ids: string[] };
    if (!Array.isArray(post_ids) || post_ids.length === 0) {
      return new Response(JSON.stringify({ error: "post_ids array required" }), { status: 400, headers: CORS });
    }

    const out: unknown[] = [];
    for (const id of post_ids.slice(0, 10)) {
      const r = await gql(
        `query P($input: PostInput!) { post(input: $input) { id status createdAt dueAt sentAt error { message } channel { id service name } } }`,
        { input: { id } },
      );
      out.push({
        id,
        httpStatus: r.status,
        post: r.json?.data?.post ?? null,
        errors: (r.json?.errors || []).map((e: { message?: string }) => e.message),
      });
    }
    return new Response(JSON.stringify({ ok: true, results: out }, null, 1), { headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS });
  }
});
