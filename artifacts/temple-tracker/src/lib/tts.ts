// Spoken Hindi for a selected line, via the sarvam-tts edge function (the API key
// stays server-side), with a localStorage cache so a verse heard twice is fetched
// once. Shared by the readers' correction toolbar and the verse speaker button.

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/sbRest";

// ── Sarvam TTS (via Supabase Edge Function proxy — keeps the API key server-side) ──

const TTS_CACHE_PREFIX = "tts_v2_";
const TTS_CACHE_INDEX_KEY = "tts_v2_index";

function ttsTextHash(text: string): string {
  const norm = text.normalize("NFC").trim().replace(/\s+/g, " ").slice(0, 400);
  try { return btoa(unescape(encodeURIComponent(norm))); }
  catch { return norm.length + "_" + norm.charCodeAt(0) + "_" + norm.charCodeAt(norm.length - 1); }
}

function ttsCacheRead(key: string): Blob | null {
  try {
    const b64 = localStorage.getItem(TTS_CACHE_PREFIX + key);
    if (!b64) return null;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    ttsCacheTouch(key);
    return new Blob([bytes], { type: "audio/mpeg" });
  } catch { return null; }
}

function ttsCacheTouch(key: string): void {
  try {
    const idxRaw = localStorage.getItem(TTS_CACHE_INDEX_KEY);
    const idx: Record<string, number> = idxRaw ? JSON.parse(idxRaw) : {};
    idx[key] = Date.now();
    localStorage.setItem(TTS_CACHE_INDEX_KEY, JSON.stringify(idx));
  } catch { /* */ }
}

function ttsCacheWrite(key: string, buffer: ArrayBuffer): void {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const b64 = btoa(binary);
  // Update the index FIRST, then write the blob. If the blob write fails we
  // roll the index entry back. This guarantees a blob never exists without an
  // index entry — orphaned blobs would be invisible to eviction forever.
  // (An index entry without a blob is harmless: reads miss, eviction cleans it.)
  const addToIndex = () => {
    const idxRaw = localStorage.getItem(TTS_CACHE_INDEX_KEY);
    const idx: Record<string, number> = idxRaw ? JSON.parse(idxRaw) : {};
    idx[key] = Date.now();
    localStorage.setItem(TTS_CACHE_INDEX_KEY, JSON.stringify(idx));
  };
  const removeFromIndex = () => {
    try {
      const idxRaw = localStorage.getItem(TTS_CACHE_INDEX_KEY);
      const idx: Record<string, number> = idxRaw ? JSON.parse(idxRaw) : {};
      if (key in idx) {
        delete idx[key];
        localStorage.setItem(TTS_CACHE_INDEX_KEY, JSON.stringify(idx));
      }
    } catch { /* */ }
  };
  const trySet = () => localStorage.setItem(TTS_CACHE_PREFIX + key, b64);
  try {
    addToIndex();
    trySet();
  } catch {
    // Quota exceeded — evict oldest 25% of entries (never our fresh key) and retry
    try {
      const idxRaw = localStorage.getItem(TTS_CACHE_INDEX_KEY);
      const idx: Record<string, number> = idxRaw ? JSON.parse(idxRaw) : {};
      const entries = Object.entries(idx).filter(([k]) => k !== key).sort((a, b) => a[1] - b[1]);
      const drop = Math.max(1, Math.floor(entries.length * 0.25));
      for (let i = 0; i < drop; i++) {
        const [k] = entries[i];
        try { localStorage.removeItem(TTS_CACHE_PREFIX + k); } catch { /* */ }
        delete idx[k];
      }
      idx[key] = Date.now();
      localStorage.setItem(TTS_CACHE_INDEX_KEY, JSON.stringify(idx));
      trySet();
    } catch {
      removeFromIndex(); // blob write still failed — don't leave a dangling index entry
    }
  }
}

export async function sarvamStreamPlay(text: string): Promise<HTMLAudioElement> {
  const hash = ttsTextHash(text);

  const cached = ttsCacheRead(hash);
  if (cached) {
    const audio = new Audio(URL.createObjectURL(cached));
    const p = audio.play();
    if (p && typeof p.then === "function") {
      p.catch((err) => console.error("[TTS] cached play rejected:", err?.name || err));
    }
    return audio;
  }

  // Proxied through a Supabase Edge Function so the Sarvam key stays
  // server-side. The proxy streams back the same response format.
  const response = await fetch(`${SUPABASE_URL}/functions/v1/sarvam-tts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      text,
      target_language_code: "hi-IN",
      speaker: "gokul",
      model: "bulbul:v3",
      pace: 1,
      speech_sample_rate: 24000,
      output_audio_codec: "mp3",
      enable_preprocessing: true,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`TTS HTTP ${response.status}: ${errText.substring(0, 200)}`);
  }

  const buffer = await response.arrayBuffer();
  const blob = new Blob([buffer], { type: "audio/mpeg" });
  const audio = new Audio(URL.createObjectURL(blob));
  const playResult = audio.play();
  if (playResult && typeof playResult.then === "function") {
    playResult.catch((err) => {
      console.error("[TTS] audio.play() rejected:", err?.name || err);
    });
  }
  try { ttsCacheWrite(hash, buffer); } catch { /* */ }
  return audio;
}

