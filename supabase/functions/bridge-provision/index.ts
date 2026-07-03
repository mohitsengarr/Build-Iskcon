// Supabase Edge Function: bridge-provision (Bhaktigram <-> Matrix identity bridge)
//
// Phone + OTP login -> Matrix access token. The client first verifies its phone
// via Supabase Auth Phone OTP (signInWithOtp -> verifyOtp), then calls this with
// the resulting Supabase session JWT. We:
//   1. verify the Supabase JWT and require a CONFIRMED phone,
//   2. map phone -> a Matrix user (1:1, keyed by a salted hash; no raw PII stored),
//      provisioning one on first login via Synapse's shared-secret admin register,
//   3. join the user to the 4 sangha rooms,
//   4. return ONLY { base_url, user_id, access_token, device_id, rooms }.
//
// SECURITY: MATRIX_REG_SHARED_SECRET (mints admin accounts if leaked) and the
// service-role key live ONLY here. Never shipped to the client.
//
// Required secrets (set after the homeserver + rooms exist):
//   MATRIX_BASE_URL           e.g. https://chat.buildiskcon.com
//   MATRIX_REG_SHARED_SECRET  = Synapse registration_shared_secret
//   BHAKTIGRAM_PHONE_PEPPER   = a long random server-side salt
//   MATRIX_ROOM_IDS           = JSON {"sangha":"!..","bhagavatam":"!..","chaitanya":"!..","kirtan":"!.."}
//   (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are provided by the platform)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MATRIX_BASE_URL = (Deno.env.get("MATRIX_BASE_URL") || "").replace(/\/$/, "");
const REG_SECRET = Deno.env.get("MATRIX_REG_SHARED_SECRET") || "";
const PEPPER = Deno.env.get("BHAKTIGRAM_PHONE_PEPPER") || "";
const ROOM_IDS: Record<string, string> = JSON.parse(Deno.env.get("MATRIX_ROOM_IDS") || "{}");

const admin = createClient(SUPABASE_URL, SERVICE_KEY);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const toHex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");

async function sha256Hex(s: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

// Synapse mac = HMAC-SHA1(secret, nonce \x00 user \x00 password \x00 'notadmin')
async function registerMac(nonce: string, user: string, pass: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(REG_SECRET), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const enc = new TextEncoder();
  const parts = [nonce, user, pass, "notadmin"];
  const bytes: number[] = [];
  parts.forEach((p, i) => { if (i) bytes.push(0); bytes.push(...enc.encode(p)); });
  return toHex(await crypto.subtle.sign("HMAC", key, new Uint8Array(bytes)));
}

function randHex(n: number): string {
  const a = new Uint8Array(n); crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function provisionMatrixUser(username: string): Promise<{ user_id: string; access_token: string; device_id: string }> {
  const nonceRes = await fetch(`${MATRIX_BASE_URL}/_synapse/admin/v1/register`);
  if (!nonceRes.ok) throw new Error(`nonce ${nonceRes.status}`);
  const { nonce } = await nonceRes.json();
  const password = randHex(24);
  const mac = await registerMac(nonce, username, password);
  const res = await fetch(`${MATRIX_BASE_URL}/_synapse/admin/v1/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nonce, username, password, admin: false, mac }),
  });
  if (!res.ok) throw new Error(`register ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const d = await res.json();
  return { user_id: d.user_id, access_token: d.access_token, device_id: d.device_id };
}

async function joinRooms(token: string): Promise<void> {
  for (const roomId of Object.values(ROOM_IDS)) {
    if (!roomId) continue;
    await fetch(`${MATRIX_BASE_URL}/_matrix/client/v3/join/${encodeURIComponent(roomId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: "{}",
    }).catch(() => { /* best effort; already-joined is fine */ });
  }
}

async function setDisplayName(userId: string, token: string, name: string): Promise<void> {
  await fetch(`${MATRIX_BASE_URL}/_matrix/client/v3/profile/${encodeURIComponent(userId)}/displayname`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ displayname: name }),
  }).catch(() => { /* cosmetic */ });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!MATRIX_BASE_URL || !REG_SECRET || !PEPPER) {
      return new Response(JSON.stringify({ error: "bridge not configured (set MATRIX_BASE_URL / MATRIX_REG_SHARED_SECRET / BHAKTIGRAM_PHONE_PEPPER)" }), { status: 503, headers: cors });
    }
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return new Response(JSON.stringify({ error: "missing session token" }), { status: 401, headers: cors });

    const { data: { user }, error } = await admin.auth.getUser(jwt);
    if (error || !user) return new Response(JSON.stringify({ error: "invalid session" }), { status: 401, headers: cors });
    if (!user.phone || !user.phone_confirmed_at) {
      return new Response(JSON.stringify({ error: "phone not verified" }), { status: 403, headers: cors });
    }

    const body = await req.json().catch(() => ({}));
    const displayName = (body?.display_name ? String(body.display_name) : "").slice(0, 60) || null;
    const phoneHash = await sha256Hex(user.phone + PEPPER);

    const { data: existing } = await admin
      .from("bhaktigram_matrix_identity")
      .select("*")
      .eq("phone_hash", phoneHash)
      .maybeSingle();

    let identity = existing as null | { matrix_user_id: string; matrix_access_token: string; matrix_device_id: string; display_name: string | null };

    if (!identity) {
      // localpart from the hash — lowercase hex, no PII, deterministic.
      const username = "bg_" + phoneHash.slice(0, 40);
      const minted = await provisionMatrixUser(username);
      await admin.from("bhaktigram_matrix_identity").insert({
        phone_hash: phoneHash,
        matrix_user_id: minted.user_id,
        matrix_access_token: minted.access_token,
        matrix_device_id: minted.device_id,
        display_name: displayName,
        last_seen_at: new Date().toISOString(),
      });
      identity = { matrix_user_id: minted.user_id, matrix_access_token: minted.access_token, matrix_device_id: minted.device_id, display_name: displayName };
    } else {
      await admin.from("bhaktigram_matrix_identity").update({ last_seen_at: new Date().toISOString() }).eq("phone_hash", phoneHash);
    }

    await joinRooms(identity.matrix_access_token);
    if (displayName && displayName !== identity.display_name) {
      await setDisplayName(identity.matrix_user_id, identity.matrix_access_token, displayName);
      await admin.from("bhaktigram_matrix_identity").update({ display_name: displayName }).eq("phone_hash", phoneHash);
    }

    return new Response(JSON.stringify({
      base_url: MATRIX_BASE_URL,
      user_id: identity.matrix_user_id,
      access_token: identity.matrix_access_token,
      device_id: identity.matrix_device_id,
      rooms: ROOM_IDS,
    }), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
