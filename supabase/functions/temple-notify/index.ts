// Supabase Edge Function: temple-notify
// Emails a temple's subscribers when a new post/milestone lands, via Resend.
// Invoked fire-and-forget from the web client after a post is created:
//   supabase.functions.invoke("temple-notify", { body: { temple_id, post_id } })
//
// Env (set in Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY   — required to actually send; missing = graceful no-op
//   NOTIFY_FROM      — optional, defaults to "BuildIskcon <updates@buildiskcon.com>"
//                      (the domain must be verified in Resend)
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SITE = "https://buildiskcon.com";

function esc(s: string): string {
  return (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

  try {
    const { temple_id, post_id } = await req.json().catch(() => ({}));
    if (!temple_id) {
      return new Response(JSON.stringify({ error: "temple_id required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const [{ data: temple }, { data: post }, { data: subs }] = await Promise.all([
      supabase.from("community_temples").select("name,slug,city,state").eq("id", temple_id).maybeSingle(),
      post_id
        ? supabase.from("temple_posts").select("author_name,body,kind").eq("id", post_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("temple_subscribers").select("email,unsub_token").eq("temple_id", temple_id),
    ]);

    if (!temple) {
      return new Response(JSON.stringify({ error: "temple not found" }), { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const subscribers = (subs ?? []) as Array<{ email: string; unsub_token: string }>;
    const RESEND = Deno.env.get("RESEND_API_KEY");

    // Not configured yet — accept the request but send nothing (keeps the app happy).
    if (!RESEND) {
      return new Response(JSON.stringify({ sent: 0, subscribers: subscribers.length, note: "RESEND_API_KEY not set — queued, no mail sent" }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const from = Deno.env.get("NOTIFY_FROM") || "BuildIskcon <updates@buildiskcon.com>";
    const templeUrl = `${SITE}/temple/${temple.slug}`;
    const kindLabel = post?.kind ? post.kind.charAt(0).toUpperCase() + post.kind.slice(1) : "Update";
    const subject = post
      ? `${kindLabel}: ${temple.name}`
      : `New update from ${temple.name}`;

    let sent = 0;
    const results = await Promise.allSettled(
      subscribers.map(async (s) => {
        const unsub = `${SITE}/api/unsubscribe?token=${s.unsub_token}`;
        const html = `
          <div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:560px;margin:auto;color:#1c1917">
            <h2 style="color:#c2410c;margin:0 0 4px">${esc(temple.name)}</h2>
            <div style="color:#78716c;font-size:13px;margin-bottom:16px">${esc(temple.city || "")}${temple.state ? ", " + esc(temple.state) : ""}</div>
            ${post ? `<div style="display:inline-block;background:#fdf1e7;color:#9a3412;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600;margin-bottom:10px">${esc(kindLabel)}</div>` : ""}
            ${post?.body ? `<p style="font-size:15px;line-height:1.55;white-space:pre-wrap">${esc(post.body)}</p>` : `<p style="font-size:15px">There's a new update on this temple's community page.</p>`}
            ${post?.author_name ? `<div style="color:#78716c;font-size:13px">— ${esc(post.author_name)}</div>` : ""}
            <div style="margin:22px 0">
              <a href="${templeUrl}" style="background:#c2410c;color:#fff;text-decoration:none;border-radius:10px;padding:11px 18px;font-weight:600;font-size:14px">View the temple community →</a>
            </div>
            <hr style="border:none;border-top:1px solid #e7e5e4;margin:20px 0">
            <div style="color:#a8a29e;font-size:12px">
              You're subscribed to updates for ${esc(temple.name)} on BuildIskcon.
              <a href="${unsub}" style="color:#a8a29e">Unsubscribe</a>.
            </div>
          </div>`;
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: s.email, subject, html }),
        });
        if (resp.ok) sent++;
        else throw new Error(`resend ${resp.status}: ${(await resp.text()).slice(0, 120)}`);
      }),
    );

    const failed = results.filter((r) => r.status === "rejected").length;
    return new Response(JSON.stringify({ sent, failed, subscribers: subscribers.length }), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
