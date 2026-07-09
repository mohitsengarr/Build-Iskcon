// ── Community temples data layer (Supabase, device-identity, no auth) ──────────
// Backs the "Design Your Temple" builder + per-temple community pages. Uses the
// shared browser Supabase client; identity is an anonymous device_id in
// localStorage (same key convention as the Bhaktigram web chat).

import { supabase } from "./supabase";

const DEVICE_KEY = "in.iskcon.device_id";
const AUTHOR_KEY = "in.iskcon.author";

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = "web_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "web_anon";
  }
}

export function getAuthorName(): string {
  try {
    return localStorage.getItem(AUTHOR_KEY) || "Devotee";
  } catch {
    return "Devotee";
  }
}

export function setAuthorName(name: string): void {
  try {
    localStorage.setItem(AUTHOR_KEY, name.trim() || "Devotee");
  } catch {
    /* ignore */
  }
}

export type TempleStyle = "tovp-dome" | "north-shikhara" | "south-gopuram" | "modern-vedic";
export type PostKind = "update" | "requirement" | "photo" | "milestone";

/** Style catalogue (kept here, three-free, so importing it never pulls in three.js). */
export const TEMPLE_STYLES: { key: TempleStyle; label: string; blurb: string }[] = [
  { key: "tovp-dome", label: "Vedic Planetarium Dome", blurb: "TOVP-inspired grand dome on a drum" },
  { key: "north-shikhara", label: "North-Indian Shikhara", blurb: "Tall curvilinear Nagara tower" },
  { key: "south-gopuram", label: "South-Indian Gopuram", blurb: "Stepped Dravidian gateway tower" },
  { key: "modern-vedic", label: "Modern Vedic", blurb: "Clean faceted contemporary dome" },
];

export interface CommunityTemple {
  id: number;
  slug: string;
  name: string;
  deity: string | null;
  style: TempleStyle | null;
  state: string | null;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  cover_image: string | null;
  description: string | null;
  status: string;
  phase: string | null;
  construction_progress: number;
  fundraising_goal: number;
  fundraising_raised: number;
  created_by: string | null;
  creator_name: string | null;
  created_at: string;
}

export interface TemplePost {
  id: number;
  temple_id: number;
  device_id: string | null;
  author_name: string | null;
  body: string | null;
  media_urls: string[];
  kind: PostKind;
  created_at: string;
}

export interface TempleMember {
  temple_id: number;
  device_id: string;
  name: string | null;
  role: "supporter" | "organizer";
  joined_at: string;
}

export interface TempleMessage {
  id: number;
  temple_id: number;
  device_id: string | null;
  author_name: string | null;
  body: string | null;
  created_at: string;
}

// ── Temples ────────────────────────────────────────────────────────────────────

export async function createTemple(input: {
  name: string;
  deity?: string;
  style?: TempleStyle;
  state?: string;
  city?: string;
  lat?: number | null;
  lng?: number | null;
  description?: string;
}): Promise<CommunityTemple> {
  const { data, error } = await supabase.rpc("create_community_temple", {
    p_name: input.name,
    p_deity: input.deity ?? null,
    p_style: input.style ?? null,
    p_state: input.state ?? null,
    p_city: input.city ?? null,
    p_lat: input.lat ?? null,
    p_lng: input.lng ?? null,
    p_description: input.description ?? null,
    p_device_id: getDeviceId(),
    p_creator_name: getAuthorName(),
  });
  if (error) throw error;
  return data as CommunityTemple;
}

export async function getTempleBySlug(slug: string): Promise<CommunityTemple | null> {
  const { data, error } = await supabase
    .from("community_temples")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data as CommunityTemple) ?? null;
}

export async function listTemples(limit = 60): Promise<CommunityTemple[]> {
  const { data, error } = await supabase
    .from("community_temples")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data as CommunityTemple[]) ?? [];
}

// ── Posts (activity feed) ───────────────────────────────────────────────────────

export async function listPosts(templeId: number, limit = 100): Promise<TemplePost[]> {
  const { data, error } = await supabase
    .from("temple_posts")
    .select("*")
    .eq("temple_id", templeId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return ((data as TemplePost[]) ?? []).map((p) => ({ ...p, media_urls: p.media_urls ?? [] }));
}

export async function createPost(
  templeId: number,
  input: { body?: string; kind?: PostKind; media_urls?: string[] },
): Promise<TemplePost | null> {
  const { data, error } = await supabase
    .from("temple_posts")
    .insert({
      temple_id: templeId,
      device_id: getDeviceId(),
      author_name: getAuthorName(),
      body: input.body ?? null,
      kind: input.kind ?? "update",
      media_urls: input.media_urls ?? [],
    })
    .select()
    .single();
  if (error) throw error;
  const post = data as TemplePost;
  // Fire-and-forget: email subscribers via the temple-notify Edge Function.
  // No-ops gracefully until a RESEND_API_KEY is set in Edge Function secrets.
  supabase.functions.invoke("temple-notify", { body: { temple_id: templeId, post_id: post.id } }).catch(() => {});
  return post;
}

// ── Members / supporters ────────────────────────────────────────────────────────

export async function joinTemple(templeId: number, role: "supporter" | "organizer" = "supporter"): Promise<void> {
  const { error } = await supabase.from("temple_members").upsert(
    { temple_id: templeId, device_id: getDeviceId(), name: getAuthorName(), role },
    { onConflict: "temple_id,device_id" },
  );
  if (error) throw error;
}

export async function listMembers(templeId: number): Promise<TempleMember[]> {
  const { data, error } = await supabase
    .from("temple_members")
    .select("*")
    .eq("temple_id", templeId)
    .order("joined_at", { ascending: true });
  if (error) return [];
  return (data as TempleMember[]) ?? [];
}

export async function isMember(templeId: number): Promise<boolean> {
  const { data } = await supabase
    .from("temple_members")
    .select("device_id")
    .eq("temple_id", templeId)
    .eq("device_id", getDeviceId())
    .maybeSingle();
  return !!data;
}

// ── Email subscribers ───────────────────────────────────────────────────────────

export async function subscribeEmail(templeId: number, email: string): Promise<void> {
  const { error } = await supabase.from("temple_subscribers").upsert(
    { temple_id: templeId, email: email.trim().toLowerCase(), device_id: getDeviceId() },
    { onConflict: "temple_id,email" },
  );
  if (error) throw error;
}

// ── Live chat ───────────────────────────────────────────────────────────────────

export async function listMessages(templeId: number, limit = 100): Promise<TempleMessage[]> {
  const { data, error } = await supabase
    .from("temple_messages")
    .select("*")
    .eq("temple_id", templeId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) return [];
  return (data as TempleMessage[]) ?? [];
}

export async function sendMessage(templeId: number, body: string): Promise<void> {
  const { error } = await supabase.from("temple_messages").insert({
    temple_id: templeId,
    device_id: getDeviceId(),
    author_name: getAuthorName(),
    body,
  });
  if (error) throw error;
}

// ── Realtime (feed + chat) ──────────────────────────────────────────────────────

export function subscribeTempleRealtime(
  templeId: number,
  handlers: { onPost?: (p: TemplePost) => void; onMessage?: (m: TempleMessage) => void },
): () => void {
  const channel = supabase
    .channel(`temple_${templeId}_${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "temple_posts", filter: `temple_id=eq.${templeId}` },
      (payload) => handlers.onPost?.({ ...(payload.new as TemplePost), media_urls: (payload.new as TemplePost).media_urls ?? [] }),
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "temple_messages", filter: `temple_id=eq.${templeId}` },
      (payload) => handlers.onMessage?.(payload.new as TempleMessage),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// ── Storage (temple photos) ─────────────────────────────────────────────────────

export async function uploadTempleMedia(file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${getDeviceId()}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from("temple-media").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("temple-media").getPublicUrl(path);
  return data.publicUrl;
}

/** meet.jit.si room for a temple's community call (mirrors the mobile group-call pattern). */
export function templeCallUrl(slug: string): string {
  return `https://meet.jit.si/buildiskcon-temple-${slug}`;
}
