import AsyncStorage from "@react-native-async-storage/async-storage";

// ── Anonymous identity (mirrors the web Bhaktigram: device_id + display name) ─
const DEVICE_KEY = "bhaktigram_device_id";
const AUTHOR_KEY = "bhaktigram_author";

let _deviceId: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (_deviceId) return _deviceId;
  try {
    let id = await AsyncStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = "dev_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      await AsyncStorage.setItem(DEVICE_KEY, id);
    }
    _deviceId = id;
    return id;
  } catch {
    _deviceId = "dev_anon";
    return _deviceId;
  }
}

export async function getAuthor(): Promise<string> {
  try { return (await AsyncStorage.getItem(AUTHOR_KEY)) || ""; } catch { return ""; }
}
export async function setAuthor(name: string): Promise<void> {
  try { await AsyncStorage.setItem(AUTHOR_KEY, name); } catch { /* ignore */ }
}

// ── Chat rooms (same slugs as the web app, so messages are shared) ────────────
export interface Room {
  slug: string;
  name: string;
  subtitle: string;
  emoji: string;
  accent: string;
}
export const ROOMS: Room[] = [
  { slug: "sangha", name: "Bhakti Sangha", subtitle: "General devotee community", emoji: "🪷", accent: "#c2410c" },
  { slug: "bhagavatam", name: "श्रीमद्भागवत चर्चा", subtitle: "Discuss verses & purports", emoji: "📖", accent: "#1d4ed8" },
  { slug: "chaitanya", name: "चैतन्य चरितामृत", subtitle: "Glorify Mahaprabhu's lila", emoji: "🌟", accent: "#b45309" },
  { slug: "kirtan", name: "Kirtan & Seva", subtitle: "Festivals, kirtan, seva", emoji: "🎵", accent: "#15803d" },
];

export interface ChatMessage {
  id: number;
  room: string;
  device_id: string;
  author_name: string;
  body: string;
  created_at: string;
}

export interface FeedPost {
  id: number;
  image_url: string;
  caption: string;
  chapter_canto: number | null;
  chapter_in_canto: number | null;
  created_at: string;
}

// ── Formatting + colors ───────────────────────────────────────────────────────
const NAME_COLORS = ["#c2410c", "#1d4ed8", "#15803d", "#7c3aed", "#be185d", "#0f766e", "#a16207", "#b91c1c"];
export function nameColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return NAME_COLORS[h % NAME_COLORS.length];
}

export function clockTime(iso: string): string {
  try {
    const d = new Date(iso);
    let h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, "0");
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${m} ${ap}`;
  } catch { return ""; }
}

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, yest)) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function listTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return clockTime(iso);
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit" });
}

export const COLORS = {
  waGreen: "#25D366",
  waHeader: "#008069",
  waSent: "#dcf8c6",
  wallpaper: "#ece5dd",
  saffron: "#c2410c",
  bg: "#f7f9fb",
  ink: "#191c1e",
  muted: "#78716c",
};
