import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRoute, Link } from "wouter";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft, Search, MoreVertical, Send, Smile, Paperclip, Camera, Mic,
  CheckCheck, MessageSquarePlus, Grid3x3, MessagesSquare, X,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Bhaktigram Chat — WhatsApp-style community "sangha" rooms.
//
// There are no user accounts in this app: Bhaktigram likes/comments are
// anonymous (a localStorage device_id + a saved display name). True 1:1 DMs
// would need auth + a user directory, so this is GROUP chat — a set of fixed
// community rooms devotees join anonymously, exactly mirroring how comments
// already work. Talks straight to Supabase (public anon key, same as the feed)
// so it works on the static production site with no api-server.
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = "https://etfmndcrchundvgtvmot.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0Zm1uZGNyY2h1bmR2Z3R2bW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc2NDE1MTIsImV4cCI6MjA2MzIxNzUxMn0.7GXS820xSFcUy2TRdbspN7s-NP3sgKFFtUP-Zw0Qbrs";

function sbFetch(path: string, opts?: RequestInit) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      ...(opts?.headers || {}),
    },
  });
}

// Anonymous identity — SAME localStorage keys as the Bhaktigram feed's
// comments, so a devotee who already set a name when commenting keeps it here.
function getDeviceId(): string {
  try {
    let id = localStorage.getItem("bhaktigram_device_id");
    if (!id) {
      id = "dev_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("bhaktigram_device_id", id);
    }
    return id;
  } catch {
    return "dev_anon";
  }
}
function getAuthor(): string {
  try { return localStorage.getItem("bhaktigram_author") || ""; } catch { return ""; }
}
function setAuthorLS(name: string) {
  try { localStorage.setItem("bhaktigram_author", name); } catch { /* quota */ }
}

interface Room {
  slug: string;
  name: string;
  subtitle: string;
  emoji: string;
  accent: string; // avatar background
}

const ROOMS: Room[] = [
  { slug: "sangha",     name: "भक्ति संग · Bhakti Sangha",     subtitle: "General devotee community", emoji: "🪷", accent: "#c2410c" },
  { slug: "bhagavatam", name: "श्रीमद्भागवत चर्चा",            subtitle: "Discuss verses & purports",  emoji: "📖", accent: "#1d4ed8" },
  { slug: "chaitanya",  name: "चैतन्य चरितामृत",               subtitle: "Glorify Mahaprabhu's lila",  emoji: "🌟", accent: "#b45309" },
  { slug: "kirtan",     name: "कीर्तन व सेवा · Kirtan & Seva",  subtitle: "Festivals, kirtan, seva",    emoji: "🎵", accent: "#15803d" },
];
const ROOM_BY_SLUG = new Map(ROOMS.map(r => [r.slug, r]));

interface ChatMessage {
  id: number;
  room: string;
  device_id: string;
  author_name: string;
  body: string;
  created_at: string;
}

// WhatsApp gives each speaker a distinct name color — hash the name into a
// fixed devotional-toned palette.
const NAME_COLORS = ["#c2410c", "#1d4ed8", "#15803d", "#7c3aed", "#be185d", "#0f766e", "#a16207", "#b91c1c"];
function nameColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return NAME_COLORS[h % NAME_COLORS.length];
}

function clockTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch { return ""; }
}
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yest)) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}
function listTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return clockTime(iso);
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "2-digit", month: "2-digit" });
}

// Faint devotional doodle wallpaper (lotus + om), classic WhatsApp cream base.
const WALLPAPER_SVG = encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'>
   <g fill='none' stroke='#b59b7d' stroke-width='1.4' opacity='0.5'>
   <text x='26' y='44' font-size='26' fill='#b59b7d' stroke='none' opacity='0.55'>ॐ</text>
   <circle cx='118' cy='34' r='3'/>
   <path d='M104 116 q12 -22 24 0 q-12 10 -24 0 z'/>
   <path d='M116 116 q12 -26 0 -40 q-12 14 0 40 z'/>
   <text x='60' y='130' font-size='22' fill='#b59b7d' stroke='none' opacity='0.5'>🪷</text>
   <circle cx='34' cy='96' r='2.5'/>
   </g></svg>`,
);
const wallpaperStyle: React.CSSProperties = {
  backgroundColor: "#ece5dd",
  backgroundImage: `url("data:image/svg+xml,${WALLPAPER_SVG}")`,
  backgroundRepeat: "repeat",
  backgroundSize: "160px",
};

const SEEN_KEY = "bhaktigram_chat_seen";
function readSeen(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}"); } catch { return {}; }
}
function writeSeen(map: Record<string, number>) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(map)); } catch { /* quota */ }
}

const WA_GREEN = "#25D366";
const WA_SENT = "#dcf8c6";
const WA_HEADER = "#008069";

// ── Bottom nav shared between feed + chat (Posts ↔ Chat) ─────────────────────
function ChatBottomNav({ active }: { active: "chat" | "posts" }) {
  return (
    <nav className="fixed bottom-0 left-0 w-full z-40 bg-white/85 backdrop-blur-xl border-t border-stone-200 flex justify-around items-center h-16">
      <Link href="/bhaktigram" className={`flex flex-col items-center justify-center gap-0.5 ${active === "posts" ? "text-[#c2410c] font-bold" : "text-stone-500"}`}>
        <Grid3x3 className="w-6 h-6" />
        <span className="text-[11px] font-semibold tracking-wide">Posts</span>
      </Link>
      <Link href="/bhaktigram/chat" className={`flex flex-col items-center justify-center gap-0.5 ${active === "chat" ? "font-bold" : "text-stone-500"}`} style={active === "chat" ? { color: WA_GREEN } : undefined}>
        <MessagesSquare className="w-6 h-6" />
        <span className="text-[11px] font-semibold tracking-wide">Chat</span>
      </Link>
    </nav>
  );
}

// ── Name prompt modal (first send only) ──────────────────────────────────────
function NameModal({ initial, onSave, onClose }: { initial: string; onSave: (n: string) => void; onClose: () => void }) {
  const [val, setVal] = useState(initial);
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-stone-900 text-lg mb-1">अपना नाम चुनें</h3>
        <p className="text-stone-500 text-sm mb-4">Pick a display name so the sangha knows who's speaking. (You can use any name.)</p>
        <input
          autoFocus
          value={val}
          onChange={e => setVal(e.target.value.slice(0, 40))}
          placeholder="e.g. Radha Dasi"
          className="w-full border border-stone-300 rounded-xl px-3 py-2.5 text-stone-900 focus:ring-2 focus:ring-orange-300 outline-none"
          onKeyDown={e => { if (e.key === "Enter" && val.trim()) onSave(val.trim()); }}
        />
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-stone-100 text-stone-600 font-semibold text-sm">Cancel</button>
          <button
            onClick={() => val.trim() && onSave(val.trim())}
            disabled={!val.trim()}
            className="flex-1 py-2.5 rounded-xl text-white font-semibold text-sm disabled:opacity-40"
            style={{ backgroundColor: WA_GREEN }}
          >Save & Send</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST VIEW
// ─────────────────────────────────────────────────────────────────────────────
function ChatList() {
  const [latest, setLatest] = useState<Record<string, ChatMessage>>({});
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const fetchOverview = useCallback(async () => {
    try {
      const r = await sbFetch("bhaktigram_chat_messages?select=*&order=created_at.desc&limit=300");
      if (!r.ok) { setLoading(false); return; }
      const rows = (await r.json()) as ChatMessage[];
      const seen = readSeen();
      const last: Record<string, ChatMessage> = {};
      const counts: Record<string, number> = {};
      for (const m of rows) {
        if (!last[m.room]) last[m.room] = m; // first seen = newest (desc order)
        const seenId = seen[m.room] || 0;
        if (m.id > seenId && m.device_id !== getDeviceId()) {
          counts[m.room] = (counts[m.room] || 0) + 1;
        }
      }
      setLatest(last);
      setUnread(counts);
    } catch { /* offline */ }
    setLoading(false);
  }, []);

  // Realtime: any INSERT into any room bumps the list instantly. A 45s poll
  // is kept purely as a fallback in case the socket silently drops between
  // supabase-js's own reconnects.
  useEffect(() => {
    fetchOverview();
    const channel = supabase
      .channel("chat-overview")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bhaktigram_chat_messages" },
        () => fetchOverview(),
      )
      .subscribe((status) => { if (status === "SUBSCRIBED") fetchOverview(); });
    const t = setInterval(fetchOverview, 45000);
    return () => { clearInterval(t); supabase.removeChannel(channel); };
  }, [fetchOverview]);

  return (
    <div className="min-h-screen bg-[#f7f9fb]">
      {/* Header */}
      <header className="fixed top-0 w-full z-40 bg-white border-b border-stone-200 flex justify-between items-center h-16 px-4">
        <div className="flex items-center gap-2">
          <Link href="/bhaktigram" className="text-stone-500 -ml-1 p-1"><ArrowLeft className="w-5 h-5" /></Link>
          <span className="text-[20px] font-extrabold tracking-tight" style={{ color: WA_GREEN }}>Bhaktigram</span>
          <span className="text-stone-400 font-semibold text-[20px]">Chat</span>
        </div>
        <div className="flex items-center gap-4 text-stone-500">
          <Search className="w-5 h-5" />
          <MoreVertical className="w-5 h-5" />
        </div>
      </header>

      <main className="pt-20 pb-24">
        <div className="px-4 pb-2">
          <p className="text-[12px] text-stone-400 font-medium">Community sangha rooms · anyone can join</p>
        </div>
        <section>
          {ROOMS.map(room => {
            const m = latest[room.slug];
            const count = unread[room.slug] || 0;
            const preview = m
              ? (m.device_id === "system" ? m.body : `${m.author_name.split(" ")[0]}: ${m.body}`)
              : "Tap to start the conversation";
            return (
              <Link key={room.slug} href={`/bhaktigram/chat/${room.slug}`}
                className="flex items-center gap-3 px-4 py-3 active:bg-stone-100 cursor-pointer">
                <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl shrink-0 shadow-sm"
                  style={{ backgroundColor: room.accent + "22" }}>
                  <span>{room.emoji}</span>
                </div>
                <div className="flex-1 min-w-0 border-b border-stone-100 pb-3">
                  <div className="flex justify-between items-baseline gap-2">
                    <h3 className="font-bold text-[15px] text-stone-900 truncate">{room.name}</h3>
                    {m && <span className={`text-[12px] shrink-0 ${count > 0 ? "font-bold" : "text-stone-400"}`} style={count > 0 ? { color: WA_GREEN } : undefined}>{listTime(m.created_at)}</span>}
                  </div>
                  <div className="flex justify-between items-center gap-2 mt-0.5">
                    <p className="text-[13px] text-stone-500 truncate">{preview}</p>
                    {count > 0 && (
                      <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 text-white text-[11px] font-bold rounded-full shrink-0" style={{ backgroundColor: WA_GREEN }}>{count}</span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </section>
        {loading && <p className="text-center text-stone-400 text-sm mt-6">Loading sangha…</p>}
      </main>

      <Link href="/bhaktigram/chat/sangha"
        className="fixed right-5 bottom-24 w-14 h-14 rounded-full shadow-xl flex items-center justify-center text-white z-40 active:scale-90 transition-transform"
        style={{ backgroundColor: WA_GREEN }}>
        <MessageSquarePlus className="w-6 h-6" />
      </Link>

      <ChatBottomNav active="chat" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVERSATION VIEW
// ─────────────────────────────────────────────────────────────────────────────
function ChatRoom({ room }: { room: Room }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [memberHint, setMemberHint] = useState(0);
  const deviceId = useMemo(getDeviceId, []);
  const endRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const lastIdRef = useRef(0);

  const scrollToBottom = useCallback((smooth = false) => {
    endRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" });
  }, []);

  const fetchMessages = useCallback(async () => {
    try {
      const r = await sbFetch(`bhaktigram_chat_messages?room=eq.${encodeURIComponent(room.slug)}&order=created_at.asc&limit=500`);
      if (!r.ok) return;
      const rows = (await r.json()) as ChatMessage[];
      setMessages(prev => {
        // Only re-render / scroll if something actually changed.
        if (prev.length === rows.length && prev[prev.length - 1]?.id === rows[rows.length - 1]?.id) return prev;
        return rows;
      });
      // distinct non-system devices = a soft "members" count
      setMemberHint(new Set(rows.filter(m => m.device_id !== "system").map(m => m.device_id)).size);
      const maxId = rows.length ? rows[rows.length - 1].id : 0;
      if (maxId) {
        const seen = readSeen(); seen[room.slug] = maxId; writeSeen(seen);
      }
    } catch { /* offline */ }
  }, [room.slug]);

  // Merge one socket-delivered INSERT into state, de-duping against rows we
  // already have and against our own optimistic bubble (matched by
  // device_id + body, since the optimistic row carries a temp id, not the
  // real serial one).
  const mergeIncoming = useCallback((row: ChatMessage) => {
    setMessages(prev => {
      if (prev.some(m => m.id === row.id)) return prev; // already have the real row
      if (row.device_id === getDeviceId()) {
        const pendingIdx = prev.findIndex(m => m.device_id === row.device_id && m.body === row.body && m.id > 1e12);
        if (pendingIdx >= 0) {
          const next = prev.slice();
          next[pendingIdx] = row; // promote optimistic → real
          return next;
        }
      }
      return [...prev, row];
    });
  }, []);

  // Initial history load + Realtime socket for this room. supabase-js manages
  // the websocket, heartbeats and reconnects; on every (re)subscribe we
  // re-pull history to catch anything missed while connecting. A 45s poll
  // remains as a last-resort fallback.
  useEffect(() => {
    setMessages([]);
    lastIdRef.current = 0;
    fetchMessages();
    const channel = supabase
      .channel(`chat:${room.slug}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bhaktigram_chat_messages", filter: `room=eq.${room.slug}` },
        (payload) => mergeIncoming(payload.new as ChatMessage),
      )
      .subscribe((status) => { if (status === "SUBSCRIBED") fetchMessages(); });
    const t = setInterval(fetchMessages, 45000);
    return () => { clearInterval(t); supabase.removeChannel(channel); };
  }, [fetchMessages, mergeIncoming, room.slug]);

  // Keep pinned to the newest message as messages arrive.
  useEffect(() => {
    const newest = messages[messages.length - 1]?.id || 0;
    if (newest !== lastIdRef.current) {
      lastIdRef.current = newest;
      requestAnimationFrame(() => scrollToBottom(false));
    }
  }, [messages, scrollToBottom]);

  const doSend = useCallback(async (name: string) => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft("");
    // Optimistic bubble
    const optimistic: ChatMessage = {
      id: Date.now(), room: room.slug, device_id: deviceId,
      author_name: name, body, created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    try {
      const r = await sbFetch("bhaktigram_chat_messages", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ room: room.slug, device_id: deviceId, author_name: name, body }),
      });
      if (!r.ok) {
        const detail = await r.text().catch(() => "");
        alert(`Message not sent: ${detail || r.statusText || `HTTP ${r.status}`}`);
        setMessages(prev => prev.filter(m => m.id !== optimistic.id)); // roll back
        setDraft(body);
      } else {
        await fetchMessages(); // reconcile with the real row id
      }
    } catch (err) {
      alert(`Message not sent — network error.\n${String(err)}`);
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      setDraft(body);
    } finally {
      setSending(false);
    }
  }, [draft, sending, room.slug, deviceId, fetchMessages]);

  const onSendClick = useCallback(() => {
    if (!draft.trim()) return;
    const name = getAuthor();
    if (!name) { setShowNameModal(true); return; }
    void doSend(name);
  }, [draft, doSend]);

  // Build render rows with day dividers + sender-name grouping.
  const rendered = useMemo(() => {
    const out: Array<{ kind: "day"; key: string; label: string } | { kind: "msg"; key: string; m: ChatMessage; showName: boolean }> = [];
    let lastDay = "";
    let lastSender = "";
    for (const m of messages) {
      const dl = dayLabel(m.created_at);
      if (dl !== lastDay) { out.push({ kind: "day", key: `d-${dl}-${m.id}`, label: dl }); lastDay = dl; lastSender = ""; }
      const mine = m.device_id === deviceId;
      const isSystem = m.device_id === "system";
      const showName = !mine && !isSystem && m.author_name !== lastSender;
      out.push({ kind: "msg", key: `m-${m.id}`, m, showName });
      lastSender = isSystem ? "" : m.author_name;
    }
    return out;
  }, [messages, deviceId]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-2 px-2 h-14 shrink-0 z-20 text-white" style={{ backgroundColor: WA_HEADER }}>
        <Link href="/bhaktigram/chat" className="w-10 h-10 flex items-center justify-center active:scale-95"><ArrowLeft className="w-5 h-5" /></Link>
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0" style={{ backgroundColor: "#ffffff22" }}>{room.emoji}</div>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-[15px] truncate leading-tight">{room.name}</h1>
          <span className="text-[12px] text-white/80 truncate block leading-tight">
            {memberHint > 0 ? `${memberHint} ${memberHint === 1 ? "voice" : "voices"} · ${room.subtitle}` : room.subtitle}
          </span>
        </div>
        <button className="w-10 h-10 flex items-center justify-center active:scale-95"><MoreVertical className="w-5 h-5" /></button>
      </header>

      {/* Canvas */}
      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-1" style={wallpaperStyle}>
        {rendered.map(row => {
          if (row.kind === "day") {
            return (
              <div key={row.key} className="flex justify-center my-2">
                <span className="bg-white/85 text-stone-500 px-3 py-1 rounded-lg text-[11.5px] font-medium shadow-sm">{row.label}</span>
              </div>
            );
          }
          const { m, showName } = row;
          if (m.device_id === "system") {
            return (
              <div key={row.key} className="flex justify-center my-1.5">
                <span className="bg-[#ffeeca] text-[#7a5b1e] px-3 py-1.5 rounded-lg text-[12px] text-center max-w-[85%] shadow-sm">{m.body}</span>
              </div>
            );
          }
          const mine = m.device_id === deviceId;
          return (
            <div key={row.key} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`relative max-w-[82%] px-2.5 py-1.5 rounded-lg shadow-sm ${mine ? "rounded-tr-none" : "rounded-tl-none"}`}
                style={{ backgroundColor: mine ? WA_SENT : "#ffffff" }}>
                {showName && (
                  <p className="text-[12.5px] font-bold mb-0.5" style={{ color: nameColor(m.author_name) }}>{m.author_name}</p>
                )}
                <p className="text-[14.5px] text-stone-800 whitespace-pre-wrap break-words leading-snug">
                  {m.body}
                  {/* spacer so the timestamp never overlaps the last word */}
                  <span className="inline-block w-14 h-0 align-bottom" />
                </p>
                <span className="absolute bottom-1 right-2 flex items-center gap-0.5 text-[10.5px] text-stone-400">
                  {clockTime(m.created_at)}
                  {mine && <CheckCheck className="w-3.5 h-3.5" style={{ color: "#53bdeb" }} />}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Input bar */}
      <footer className="shrink-0 flex items-end gap-2 px-2 py-2" style={{ backgroundColor: "#f0f2f5" }}>
        <div className="flex-1 bg-white rounded-3xl flex items-end px-2 min-h-[46px] shadow-sm">
          <button className="p-2.5 text-stone-400 shrink-0" tabIndex={-1}><Smile className="w-5 h-5" /></button>
          <textarea
            rows={1}
            value={draft}
            onChange={e => setDraft(e.target.value.slice(0, 2000))}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey && !(e.nativeEvent as { isComposing?: boolean }).isComposing) {
                e.preventDefault(); onSendClick();
              }
            }}
            placeholder="Message"
            className="flex-1 bg-transparent border-none focus:ring-0 outline-none resize-none text-stone-900 text-[15px] py-3 max-h-28"
            style={{ fontFamily: /[ऀ-ॿ]/.test(draft) ? "var(--font-devanagari)" : undefined }}
          />
          <button className="p-2.5 text-stone-400 shrink-0" tabIndex={-1}><Paperclip className="w-5 h-5 -rotate-45" /></button>
          {!draft.trim() && <button className="p-2.5 text-stone-400 shrink-0" tabIndex={-1}><Camera className="w-5 h-5" /></button>}
        </div>
        <button
          onClick={onSendClick}
          disabled={sending}
          aria-label={draft.trim() ? "Send" : "Voice (coming soon)"}
          className="w-12 h-12 rounded-full flex items-center justify-center text-white shadow-md active:scale-90 transition-transform shrink-0 disabled:opacity-60"
          style={{ backgroundColor: WA_GREEN }}
        >
          {draft.trim() ? <Send className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>
      </footer>

      {showNameModal && (
        <NameModal
          initial={getAuthor()}
          onClose={() => setShowNameModal(false)}
          onSave={(n) => { setAuthorLS(n); setShowNameModal(false); void doSend(n); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function BhaktigramChat() {
  const [, params] = useRoute("/bhaktigram/chat/:room");
  const slug = params?.room;
  const room = slug ? ROOM_BY_SLUG.get(slug) : undefined;

  // Unknown room slug → fall back to the list.
  if (slug && !room) {
    return (
      <div className="min-h-screen bg-[#f7f9fb] flex flex-col items-center justify-center gap-3 p-6 text-center">
        <X className="w-10 h-10 text-stone-300" />
        <p className="text-stone-500">That sangha room doesn't exist.</p>
        <Link href="/bhaktigram/chat" className="text-white font-semibold px-5 py-2.5 rounded-xl" style={{ backgroundColor: WA_GREEN }}>Back to chats</Link>
      </div>
    );
  }
  return room ? <ChatRoom room={room} /> : <ChatList />;
}
