// Bhaktigram chat data layer on matrix-js-sdk (React Native / Expo build).
//
// Headless: this module replaces the Supabase Realtime calls; the existing
// WhatsApp-style UI keeps its exact render contract. Live messages map into the
// same shape the components already consume (see ChatMsg below, which extends
// the current ChatMessage with `event_id` for dedupe).
//
// RN specifics (validated by the integration research):
//   - default MemoryStore (IndexedDB is unavailable in RN) — cold start re-syncs.
//   - NO initRustCrypto(): E2EE is OFF (the Rust crypto WASM cannot bind to
//     Hermes). Rooms are unencrypted server-side, so this is correct, not a
//     downgrade. Keep a SINGLE client instance per app.

import {
  createClient,
  ClientEvent,
  RoomEvent,
  type MatrixClient,
  type MatrixEvent,
  type Room,
} from "matrix-js-sdk";
import { ROOM_IDS, setRoomIds, slugForRoomId } from "./rooms";

// Custom (reverse-DNS) content fields so the existing "mine vs others" and the
// `device_id === 'system'` system-bubble convention keep working unchanged.
const AUTHOR_KEY = "in.iskcon.author";
const DEVICE_KEY = "in.iskcon.device_id";

export interface ChatMsg {
  id: number;        // origin_server_ts (ms) — preserves the existing >/seen/optimistic math
  event_id: string;  // real Matrix event id — the dedupe key
  room: string;      // slug
  device_id: string; // from content (mine/system detection)
  author_name: string;
  body: string;
  created_at: string;
}

export function toChatMsg(ev: MatrixEvent): ChatMsg | null {
  if (ev.getType() !== "m.room.message") return null;
  const c = ev.getContent() as Record<string, unknown>;
  const ts = ev.getTs();
  return {
    id: ts,
    event_id: ev.getId() || String(ts),
    room: slugForRoomId(ev.getRoomId() || ""),
    device_id: (c[DEVICE_KEY] as string) || ev.getSender() || "",
    author_name: (c[AUTHOR_KEY] as string) || "Devotee",
    body: (c.body as string) || "",
    created_at: new Date(ts).toISOString(),
  };
}

export interface Provisioned {
  base_url: string;
  user_id: string;
  access_token: string;
  device_id: string;
  rooms: Record<string, string>;
}

let client: MatrixClient | null = null;
let myDeviceId = "";

/**
 * Exchange a phone-OTP-verified Supabase session JWT for a Matrix token via the
 * bridge Edge Function. The client never holds any admin/shared secret.
 */
export async function provision(
  bridgeUrl: string,
  supabaseJwt: string,
  anonKey: string,
  displayName?: string,
): Promise<Provisioned> {
  const res = await fetch(`${bridgeUrl}/functions/v1/bridge-provision`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseJwt}`,
      apikey: anonKey,
    },
    body: JSON.stringify({ display_name: displayName }),
  });
  if (!res.ok) throw new Error(`bridge ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<Provisioned>;
}

/** Start the Matrix client and wait for the first sync (PREPARED). */
export async function connect(p: Provisioned, deviceIdForAuthorship: string): Promise<MatrixClient> {
  if (client) return client;
  setRoomIds(p.rooms);
  myDeviceId = deviceIdForAuthorship;
  // MemoryStore (default) + NO crypto — see header note.
  client = createClient({
    baseUrl: p.base_url,
    accessToken: p.access_token,
    userId: p.user_id,
    deviceId: p.device_id,
  });
  await new Promise<void>((resolve) => {
    client!.once(ClientEvent.Sync, (state: string) => {
      if (state === "PREPARED") resolve();
    });
    client!.startClient({ initialSyncLimit: 30 });
  });
  return client;
}

/** Live messages for a room slug. Returns an unsubscribe fn. */
export function subscribe(slug: string, onMsg: (m: ChatMsg) => void): () => void {
  const c = client;
  if (!c) return () => {};
  const roomId = ROOM_IDS[slug];
  const handler = (ev: MatrixEvent, _room?: Room, toStartOfTimeline?: boolean) => {
    if (toStartOfTimeline) return;           // backfill/scrollback — not a new message
    if (ev.getRoomId() !== roomId) return;
    const m = toChatMsg(ev);
    if (m) onMsg(m);
  };
  c.on(RoomEvent.Timeline, handler);
  return () => c.off(RoomEvent.Timeline, handler);
}

/** Optimistic send — the SDK does local echo + retry; echo reconciles in the UI. */
export async function sendText(slug: string, body: string, authorName: string): Promise<void> {
  const c = client;
  if (!c) throw new Error("matrix client not connected");
  await c.sendEvent(
    ROOM_IDS[slug],
    "m.room.message" as never,
    { msgtype: "m.text", body, [AUTHOR_KEY]: authorName, [DEVICE_KEY]: myDeviceId } as never,
    "",
  );
}

/** Cached timeline for a room, oldest -> newest, mapped to ChatMsg. */
export function loadHistory(slug: string): ChatMsg[] {
  const c = client;
  if (!c) return [];
  const room = c.getRoom(ROOM_IDS[slug]);
  if (!room) return [];
  return room.timeline.map(toChatMsg).filter((m): m is ChatMsg => m !== null);
}

/** Page older messages; they arrive via subscribe()'s handler (toStartOfTimeline). */
export async function loadOlder(slug: string, limit = 30): Promise<void> {
  const c = client;
  if (!c) return;
  const room = c.getRoom(ROOM_IDS[slug]);
  if (room) await c.scrollback(room, limit);
}

export function disconnect(): void {
  client?.stopClient();
  client = null;
}
