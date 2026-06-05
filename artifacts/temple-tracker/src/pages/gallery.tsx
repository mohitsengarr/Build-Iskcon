import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { Loader2, Download, Share2, X, Search, ImageIcon, Filter, ChevronDown, ChevronUp, ChevronLeft, Trash2, Maximize2, Minimize2, RefreshCw, Users, Crown, Sparkles, Shield, CheckSquare, Square, Check, Heart, MessageCircle, Send, Bookmark, MoreHorizontal, BadgeCheck } from "lucide-react";
import { fadeInUp, staggerContainer } from "@/lib/animations";

// ── Types ───────────────────────────────────────────────────────────────────

interface GalleryItem {
  id: string;
  chapterNumber: number;
  chapterTitle: string;
  cantoNumber: number;
  sceneIndex: number;
  url: string;
  description: string;
  // Full Instagram caption (multi-line, with mantra + hashtags). For chapter
  // art this is unset — `description` already carries the full prompt.
  fullCaption?: string;
  generatedAt: string;
  type: "chapter" | "instagram";
}

interface PersonaItem {
  key: string;
  name: string;
  shortDescription: string;
  fullDescription: string;
  gender: "male" | "female";
  type: "built-in" | "custom";
  source?: string;
}

// ── Constants ───────────────────────────────────────────────────────────────

// Read-only endpoints (manifests, images) are served as static files from the
// same origin on Vercel. Mutations (DELETE, POST) need to reach the live API
// server — set VITE_PUBLIC_API_URL in Vercel to the ngrok/Cloudflare tunnel URL.
const READ_API_BASE = "/api/bhagwatham";
const MUTATION_API_BASE = `${import.meta.env.VITE_PUBLIC_API_URL || ""}/api/bhagwatham`;

// Supabase direct access — works on the live site without any tunnel.
// Deletions queue here; local cron flushes them into the manifest and disk.
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
const API_BASE = READ_API_BASE; // keep backward compat for read calls

function isMutationApiConfigured(): boolean {
  return Boolean(import.meta.env.VITE_PUBLIC_API_URL);
}

const CANTO_NAMES: Record<number, string> = {
  0: "General",
  1: "Canto 1 — Creation",
  2: "Canto 2 — Cosmic Manifestation",
  3: "Canto 3 — Status Quo",
  4: "Canto 4 — Creation of the Fourth Order",
  5: "Canto 5 — Creative Impetus",
  6: "Canto 6 — Prescribed Duties",
  7: "Canto 7 — Science of God",
  8: "Canto 8 — Withdrawal of Cosmic Creations",
  9: "Canto 9 — Liberation",
  10: "Canto 10 — Summum Bonum",
  11: "Canto 11 — General History",
  12: "Canto 12 — Age of Deterioration",
};

// ── Instagram-style post card ───────────────────────────────────────────────
//
// Renders one GalleryItem the way a real Instagram post looks: profile header
// with @buildiskcon, square image, action row (♥ 💬 ↪ ⋯ ⊞), like count,
// caption with "more" toggle, comment count placeholder, time-ago timestamp.
// Click the image to open the existing Lightbox at full size.

function timeAgo(iso: string | undefined): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 4) return `${w}w`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(d / 365)}y`;
}

// Deterministic "fake but stable" like/comment counts per post id so the
// numbers don't change on each render. Pure visual UX — doesn't claim real engagement.
function fakeEngagement(seed: string): { likes: number; comments: number } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  const likes = 40 + (Math.abs(h) % 380);
  const comments = 1 + (Math.abs(h >> 4) % 18);
  return { likes, comments };
}

function InstagramPostCard({ item, onOpenLightbox }: { item: GalleryItem; onOpenLightbox: () => void }) {
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { likes: baseLikes, comments } = fakeEngagement(item.id);
  const likes = liked ? baseLikes + 1 : baseLikes;
  // First-line preview when collapsed; full multi-line caption when expanded
  const fullCaption = (item.fullCaption || item.description || "").trim();
  const previewCaption = (item.description || fullCaption.split("\n")[0] || "").trim();
  const isLong = fullCaption.length > previewCaption.length || previewCaption.length > 110;

  return (
    <article className="bg-white border border-stone-200 rounded-md overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-3 px-3 py-2.5">
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 p-[2px] shrink-0">
          <div className="w-full h-full rounded-full bg-white flex items-center justify-center overflow-hidden">
            <span className="text-[10px] font-bold text-orange-600">BI</span>
          </div>
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-1">
          <span className="text-[13px] font-semibold text-stone-900 truncate">buildiskcon</span>
          <BadgeCheck className="w-3.5 h-3.5 text-blue-500 fill-blue-500/20 shrink-0" />
          <span className="text-[12px] text-stone-400 px-1">·</span>
          <span className="text-[12px] text-stone-500 shrink-0">{timeAgo(item.generatedAt)}</span>
        </div>
        <button className="text-stone-600 hover:text-stone-900 transition-colors" aria-label="More options">
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </header>

      {/* Image — click to lightbox */}
      <button
        onClick={onOpenLightbox}
        className="block w-full bg-stone-100 aspect-square overflow-hidden"
        aria-label="View full size"
      >
        <img
          src={item.url}
          alt={item.description || item.chapterTitle}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </button>

      {/* Action bar */}
      <div className="flex items-center px-3 py-2">
        <button
          onClick={() => setLiked(!liked)}
          className="p-1.5 -ml-1.5 hover:text-stone-500 transition-colors"
          aria-label={liked ? "Unlike" : "Like"}
        >
          <Heart className={`w-6 h-6 ${liked ? "fill-red-500 text-red-500" : "text-stone-900"}`} />
        </button>
        <button onClick={onOpenLightbox} className="p-1.5 hover:text-stone-500 transition-colors" aria-label="Comments">
          <MessageCircle className="w-6 h-6 text-stone-900 -scale-x-100" />
        </button>
        <button className="p-1.5 hover:text-stone-500 transition-colors" aria-label="Share">
          <Send className="w-6 h-6 text-stone-900" />
        </button>
        <button
          onClick={() => setSaved(!saved)}
          className="ml-auto p-1.5 -mr-1.5 hover:text-stone-500 transition-colors"
          aria-label={saved ? "Unsave" : "Save"}
        >
          <Bookmark className={`w-6 h-6 ${saved ? "fill-stone-900 text-stone-900" : "text-stone-900"}`} />
        </button>
      </div>

      {/* Likes */}
      <div className="px-3 -mt-1 mb-1">
        <span className="text-[13px] font-semibold text-stone-900">{likes.toLocaleString()} likes</span>
      </div>

      {/* Caption — preview first line; expand to full multi-line caption */}
      <div className="px-3 pb-1 text-[13px] text-stone-900 leading-snug">
        <span className="font-semibold">buildiskcon</span>{" "}
        <span
          className={expanded ? "whitespace-pre-wrap" : ""}
          style={{ fontFamily: fullCaption.match(/[ऀ-ॿ]/) ? "var(--font-devanagari)" : undefined }}
        >
          {expanded
            ? fullCaption
            : (previewCaption.length > 110 ? `${previewCaption.slice(0, 110).trim()}…` : previewCaption)}
        </span>
        {isLong && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-stone-500 ml-1 hover:text-stone-700"
          >
            {expanded ? "less" : "more"}
          </button>
        )}
      </div>

      {/* Comments link */}
      <button
        onClick={onOpenLightbox}
        className="block px-3 pt-1 pb-1 text-[13px] text-stone-500 hover:text-stone-700 text-left"
      >
        View all {comments} comments
      </button>

      {/* Chapter ref + time */}
      <div className="px-3 pb-3 text-[10px] uppercase tracking-wider text-stone-400 font-semibold">
        {CANTO_NAMES[item.cantoNumber]?.split("—")[0]?.trim() || `Canto ${item.cantoNumber}`} · Ch. {item.chapterNumber}
      </div>
    </article>
  );
}

// ── Lightbox ────────────────────────────────────────────────────────────────

function Lightbox({ item, items, onClose, onNavigate, onDelete }: {
  item: GalleryItem;
  items: GalleryItem[];
  onClose: () => void;
  onNavigate: (item: GalleryItem) => void;
  onDelete: (item: GalleryItem) => void;
}) {
  const currentIndex = items.findIndex(i => i.id === item.id);
  const [fullscreen, setFullscreen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) onNavigate(items[currentIndex - 1]);
    setConfirmDelete(false);
  }, [currentIndex, items, onNavigate]);

  const goNext = useCallback(() => {
    if (currentIndex < items.length - 1) onNavigate(items[currentIndex + 1]);
    setConfirmDelete(false);
  }, [currentIndex, items, onNavigate]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { if (fullscreen) setFullscreen(false); else onClose(); }
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "f" || e.key === "F") setFullscreen(f => !f);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, goPrev, goNext, fullscreen]);

  const handleDownload = async () => {
    try {
      const res = await fetch(item.url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bhagwatham-ch${item.chapterNumber}-${item.type}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(item.url, "_blank");
    }
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        const res = await fetch(item.url);
        const blob = await res.blob();
        const file = new File([blob], "bhagwatham.jpg", { type: "image/jpeg" });
        await navigator.share({ title: "श्रीमद्भागवतम् — Build ISKCON", text: item.description, files: [file] });
      } else {
        await navigator.clipboard.writeText(window.location.origin + item.url);
        alert("Link copied!");
      }
    } catch { /* cancelled */ }
  };

  // Render via Portal to document.body. The page's <main> has a z-10 stacking
  // context, which clamps the Lightbox's effective z-index below the navbar's
  // z-50 — so without the Portal, the header still bleeds through on top of
  // the photo. Portaling escapes the stacking context entirely.
  if (typeof document === "undefined") return null;
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-md flex items-center justify-center"
      onClick={onClose}
    >
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <p className="text-white/50 text-xs">{currentIndex + 1} / {items.length}</p>
        <div className="flex items-center gap-2">
          <button onClick={() => setFullscreen(f => !f)} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" title="Fullscreen (F)">
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Arrow nav */}
      {currentIndex > 0 && (
        <button onClick={(e) => { e.stopPropagation(); goPrev(); }} className="absolute left-3 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors text-2xl">
          ‹
        </button>
      )}
      {currentIndex < items.length - 1 && (
        <button onClick={(e) => { e.stopPropagation(); goNext(); }} className="absolute right-3 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors text-2xl">
          ›
        </button>
      )}

      {/* Two-column layout (md+): image on the LEFT, metadata + buttons on the
          RIGHT. On mobile (default), stacks vertically with image on top.
          In fullscreen mode the info panel is hidden and the image expands. */}
      <div
        className={`flex w-full items-center justify-center gap-6 px-4 sm:px-12 ${
          fullscreen ? "" : "flex-col md:flex-row max-w-[1600px]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image */}
        <motion.img
          key={item.id}
          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }}
          src={item.url}
          alt={item.description}
          className={`object-contain shadow-2xl transition-all duration-300 cursor-zoom-in ${
            fullscreen
              ? "max-h-screen max-w-full rounded-none"
              : "max-h-[85vh] w-auto md:max-w-[65vw] max-w-[92vw] rounded-2xl"
          }`}
          onClick={(e) => { e.stopPropagation(); setFullscreen(f => !f); }}
        />

        {/* Right-hand info panel — hidden in fullscreen */}
        {!fullscreen && (
          <div className="w-full md:w-[28rem] md:shrink-0 text-left">
            <p className="text-white/90 text-lg font-semibold mb-2 leading-snug" style={{ fontFamily: "var(--font-devanagari)" }}>
              {item.chapterTitle}
            </p>
            {item.description && (
              <p className="text-white/70 text-sm leading-relaxed mb-3" style={{ fontFamily: "var(--font-devanagari)" }}>
                {item.description}
              </p>
            )}
            <p className="text-white/40 text-[11px] mb-5 uppercase tracking-wider">
              {CANTO_NAMES[item.cantoNumber] || `Canto ${item.cantoNumber}`} · Chapter {item.chapterNumber} · Scene {item.sceneIndex}
              {item.type === "instagram" && <span className="ml-2 px-1.5 py-0.5 bg-pink-500/30 text-pink-300 rounded text-[10px] normal-case tracking-normal">Instagram</span>}
            </p>
            <div className="flex flex-col gap-2">
              <button onClick={handleDownload} className="flex items-center gap-2 text-xs text-white/80 hover:text-white px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
                <Download className="w-3.5 h-3.5" /> Download
              </button>
              <button onClick={handleShare} className="flex items-center gap-2 text-xs text-white/80 hover:text-white px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
                <Share2 className="w-3.5 h-3.5" /> Share
              </button>
              {!confirmDelete ? (
                <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-2 text-xs text-red-400/80 hover:text-red-400 px-3 py-2 rounded-lg bg-white/5 hover:bg-red-500/20 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { onDelete(item); setConfirmDelete(false); }}
                    className="flex-1 flex items-center justify-center gap-1 text-xs text-white px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 transition-colors font-semibold"
                  >
                    <RefreshCw className="w-3 h-3" /> Confirm delete
                  </button>
                  <button onClick={() => setConfirmDelete(false)} className="text-xs text-white/60 hover:text-white px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>,
    document.body,
  );
}

// ── Gallery Page ─────────────────────────────────────────────────────────────

export default function Gallery() {
  // /instagram is an alias for /gallery?filter=instagram. We keep filterType
  // in state and mirror it into the URL so the Instagram feed has a stable,
  // shareable URL and the back button works as expected.
  const [location, setLocation] = useLocation();
  const [allItems, setAllItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCanto, setFilterCanto] = useState<number | "all">("all");
  const [filterType, setFilterType] = useState<"all" | "chapter" | "instagram" | "characters">(
    location === "/instagram" ? "instagram" : "all"
  );
  const [searchQuery, setSearchQuery] = useState("");

  // Sync filterType ↔ URL. When the path changes (back/forward, deep link),
  // pull the filter from the path. When filterType changes via the UI, push
  // the new path so the URL bar reflects the current view.
  useEffect(() => {
    const wantInstagram = location === "/instagram";
    if (wantInstagram && filterType !== "instagram") setFilterType("instagram");
    if (!wantInstagram && filterType === "instagram") setFilterType("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  useEffect(() => {
    if (filterType === "instagram" && location !== "/instagram") {
      setLocation("/instagram");
    } else if (filterType !== "instagram" && location === "/instagram") {
      setLocation("/gallery");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType]);
  const [lightboxItem, setLightboxItem] = useState<GalleryItem | null>(null);
  const [collapsedCantos, setCollapsedCantos] = useState<Set<number>>(new Set());
  const [personas, setPersonas] = useState<PersonaItem[]>([]);
  const [personasLoading, setPersonasLoading] = useState(false);
  const [expandedPersona, setExpandedPersona] = useState<string | null>(null);

  // ── Pending Instagram posts awaiting human review ─────────────────────────
  interface PendingPost {
    id: number;
    chapter_global_number: number;
    chapter_canto: number;
    chapter_in_canto: number;
    chapter_title: string;
    image_url: string;
    caption: string;
    hashtags: string;
    status: "pending" | "approved" | "rejected";
    created_at: string;
    error_message: string | null;
  }
  const [pending, setPending] = useState<PendingPost[]>([]);
  const [pendingExpanded, setPendingExpanded] = useState<number | null>(null);
  const [reviewing, setReviewing] = useState<Set<number>>(new Set());
  // Forward-ref to fetchAll so reviewPost (declared earlier in render order)
  // can trigger a manifest refresh after approve. The actual function is
  // assigned in a useEffect below once fetchAll is defined.
  const fetchAllRef = useRef<(() => Promise<void>) | null>(null);

  const fetchPending = useCallback(async () => {
    try {
      const r = await sbFetch("ig_pending_review?status=eq.pending&order=created_at.asc&select=*");
      if (r.ok) setPending(await r.json());
    } catch { /* offline */ }
  }, []);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  // ── Bulk generation for missing chapters ──────────────────────────────────
  interface BulkStatus { missingCount: number; pendingReviewCount: number; firstMissing: Array<{ canto: number; chapter: number; title: string }> }
  const [bulkStatus, setBulkStatus] = useState<BulkStatus | null>(null);
  const [bulkAction, setBulkAction] = useState<"idle" | "sampling" | "running">("idle");
  const [bulkLimit, setBulkLimit] = useState(10);
  const [sampleApproved, setSampleApproved] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  const refreshBulkStatus = useCallback(async () => {
    try {
      const res = await fetch("https://etfmndcrchundvgtvmot.supabase.co/functions/v1/bulk-generate-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "status" }),
      });
      if (res.ok) setBulkStatus(await res.json());
    } catch { /* offline */ }
  }, []);

  useEffect(() => { refreshBulkStatus(); }, [refreshBulkStatus]);

  const generateSample = useCallback(async () => {
    setBulkAction("sampling");
    setBulkMessage(null);
    try {
      const res = await fetch("https://etfmndcrchundvgtvmot.supabase.co/functions/v1/bulk-generate-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "sample" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setBulkMessage(`Sample failed: ${data.error || res.statusText}`);
      } else {
        setBulkMessage(`✓ Sample generated for Canto ${data.chapter?.skandh}, Ch ${data.chapter?.number}. Review it below, then approve the style before bulk-generating.`);
        // Allow bulk-trigger once a sample exists
        fetchPending();
        refreshBulkStatus();
      }
    } catch (err) {
      setBulkMessage(`Network error: ${String(err)}`);
    } finally {
      setBulkAction("idle");
    }
  }, [fetchPending, refreshBulkStatus]);

  const runBulk = useCallback(async () => {
    if (!sampleApproved) {
      const ok = window.confirm(`Generate ${bulkLimit} images in parallel? This uses ~${bulkLimit} FLUX-2 API calls and adds ${bulkLimit} posts to the Pending Review queue for approval.`);
      if (!ok) return;
    }
    setBulkAction("running");
    setBulkMessage(null);
    try {
      const res = await fetch("https://etfmndcrchundvgtvmot.supabase.co/functions/v1/bulk-generate-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "bulk", limit: bulkLimit, concurrency: 4 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBulkMessage(`Bulk failed: ${data.error || res.statusText}`);
      } else {
        setBulkMessage(`🚀 ${data.message || `Queued ${data.queued} chapters for generation.`}`);
        // Pending review banner will populate as each image finishes; poll for updates.
        const poll = setInterval(() => { fetchPending(); refreshBulkStatus(); }, 8000);
        setTimeout(() => clearInterval(poll), 5 * 60 * 1000);
      }
    } catch (err) {
      setBulkMessage(`Network error: ${String(err)}`);
    } finally {
      setBulkAction("idle");
    }
  }, [bulkLimit, sampleApproved, fetchPending, refreshBulkStatus]);

  // ── Chapter-art parallel pipeline ─────────────────────────────────────────
  // Identical workflow to the Instagram pipeline above but writes/reads from
  // bhagavatam_chapter_art_review (landscape 1344x1088 chapter covers) instead
  // of ig_pending_review (square 1088x1344 Instagram posts).
  interface PendingChapterArt {
    id: number;
    chapter_global_number: number;
    chapter_canto: number;
    chapter_in_canto: number;
    chapter_title: string;
    image_url: string;
    image_path: string;
    description_hi: string | null;
    scene_title: string | null;
    status: "pending" | "approved" | "rejected";
    created_at: string;
    error_message: string | null;
  }
  interface ChapterArtBulkStatus {
    missingCount: number;
    pendingReviewCount: number;
    approvedCount: number;
    firstMissing: Array<{ canto: number; chapter: number; title: string }>;
  }
  const [pendingChapterArt, setPendingChapterArt] = useState<PendingChapterArt[]>([]);
  const [reviewingChapterArt, setReviewingChapterArt] = useState<Set<number>>(new Set());
  const [chartBulkStatus, setChartBulkStatus] = useState<ChapterArtBulkStatus | null>(null);
  const [chartBulkAction, setChartBulkAction] = useState<"idle" | "sampling" | "running">("idle");
  const [chartBulkLimit, setChartBulkLimit] = useState(10);
  const [chartSampleApproved, setChartSampleApproved] = useState(false);
  const [chartBulkMessage, setChartBulkMessage] = useState<string | null>(null);

  const fetchPendingChapterArt = useCallback(async () => {
    try {
      const r = await sbFetch("bhagavatam_chapter_art_review?status=eq.pending&order=created_at.asc&select=*");
      if (r.ok) setPendingChapterArt(await r.json());
    } catch { /* offline */ }
  }, []);

  useEffect(() => { fetchPendingChapterArt(); }, [fetchPendingChapterArt]);

  const refreshChartBulkStatus = useCallback(async () => {
    try {
      const res = await fetch("https://etfmndcrchundvgtvmot.supabase.co/functions/v1/bulk-generate-chapter-art", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "status" }),
      });
      if (res.ok) setChartBulkStatus(await res.json());
    } catch { /* offline */ }
  }, []);

  useEffect(() => { refreshChartBulkStatus(); }, [refreshChartBulkStatus]);

  const generateChartSample = useCallback(async () => {
    setChartBulkAction("sampling");
    setChartBulkMessage(null);
    try {
      const res = await fetch("https://etfmndcrchundvgtvmot.supabase.co/functions/v1/bulk-generate-chapter-art", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "sample" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setChartBulkMessage(`Sample failed: ${data.error || res.statusText}`);
      } else {
        setChartBulkMessage(`✓ Chapter-art sample generated for Canto ${data.chapter?.skandh}, Ch ${data.chapter?.number}. Review it below, then approve the style before bulk-generating.`);
        fetchPendingChapterArt();
        refreshChartBulkStatus();
      }
    } catch (err) {
      setChartBulkMessage(`Network error: ${String(err)}`);
    } finally {
      setChartBulkAction("idle");
    }
  }, [fetchPendingChapterArt, refreshChartBulkStatus]);

  const runChartBulk = useCallback(async () => {
    if (!chartSampleApproved) {
      const ok = window.confirm(`Generate ${chartBulkLimit} chapter-art images in parallel? This uses ~${chartBulkLimit} FLUX-2 API calls and queues ${chartBulkLimit} reviews for approval.`);
      if (!ok) return;
    }
    setChartBulkAction("running");
    setChartBulkMessage(null);
    try {
      const res = await fetch("https://etfmndcrchundvgtvmot.supabase.co/functions/v1/bulk-generate-chapter-art", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "bulk", limit: chartBulkLimit, concurrency: 4 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setChartBulkMessage(`Bulk failed: ${data.error || res.statusText}`);
      } else {
        setChartBulkMessage(`🚀 ${data.message || `Queued ${data.queued} chapter-art images for generation.`}`);
        const poll = setInterval(() => { fetchPendingChapterArt(); refreshChartBulkStatus(); }, 8000);
        setTimeout(() => clearInterval(poll), 5 * 60 * 1000);
      }
    } catch (err) {
      setChartBulkMessage(`Network error: ${String(err)}`);
    } finally {
      setChartBulkAction("idle");
    }
  }, [chartBulkLimit, chartSampleApproved, fetchPendingChapterArt, refreshChartBulkStatus]);

  const reviewChapterArt = useCallback(async (id: number, action: "approve" | "reject") => {
    setReviewingChapterArt(prev => new Set(prev).add(id));
    try {
      const res = await fetch("https://etfmndcrchundvgtvmot.supabase.co/functions/v1/approve-chapter-art", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`${action === "approve" ? "Approve" : "Reject"} failed: ${data.error || res.statusText}`);
      } else {
        // Remove the reviewed row from the local pending list immediately.
        setPendingChapterArt(prev => prev.filter(p => p.id !== id));
        if (action === "approve") {
          setChartSampleApproved(true);
          // Approved art should now surface in the gallery; refresh the main
          // manifest so it appears alongside the existing items.
          void fetchAllRef.current?.();
        }
        if (action === "reject" && data?.regeneration?.ok) {
          await fetchPendingChapterArt();
        } else if (action === "reject" && data?.regeneration?.detail) {
          alert(`Rejected — but auto-regeneration didn't queue: ${data.regeneration.detail}`);
        }
        refreshChartBulkStatus();
      }
    } catch (err) {
      alert(`Network error: ${String(err)}`);
    } finally {
      setReviewingChapterArt(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  }, [fetchPendingChapterArt, refreshChartBulkStatus]);

  const reviewPost = useCallback(async (id: number, action: "approve" | "reject") => {
    setReviewing(prev => new Set(prev).add(id));
    try {
      const res = await fetch(`https://etfmndcrchundvgtvmot.supabase.co/functions/v1/approve-instagram-post`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`${action === "approve" ? "Approve" : "Reject"} failed: ${data.error || res.statusText}`);
      } else {
        // Drop the reviewed post from the pending list immediately
        setPending(prev => prev.filter(p => p.id !== id));
        // Once the user approves at least one sample, treat the style as
        // confirmed — bulk-generate button stops asking for confirmation.
        if (action === "approve") {
          setSampleApproved(true);
          // Refresh the Instagram feed so the just-approved post appears at
          // the top of the timeline without requiring a page reload.
          void fetchAllRef.current?.();
        }

        // On reject the backend auto-regenerates for the same chapter and
        // returns the new pending id. Refetch so it appears at the top of
        // the queue without a manual reload.
        if (action === "reject") {
          if (data?.regeneration?.ok) {
            // The new pending row is already in the DB — refresh the list
            await fetchPending();
          } else if (data?.regeneration?.detail) {
            // Capped out or the generator failed — show why so the user
            // can intervene (e.g. adjust prompts, manual override).
            alert(`Rejected — but auto-regeneration didn't queue: ${data.regeneration.detail}`);
          }
        }
      }
    } catch (err) {
      alert(`Network error: ${String(err)}`);
    } finally {
      setReviewing(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  }, [fetchPending]);

  // ── Fetch manifests ───────────────────────────────────────────────────────
  // Stored as a useCallback so reviewPost() can re-trigger after approve to
  // surface the just-approved post in the Instagram feed without a reload.
  const fetchAll = useCallback(async () => {
      // Load Supabase delete queue in parallel — images flagged here are
      // hidden from the gallery immediately (laptop cron will physically
      // delete them when it next runs).
      const deletedKeys = new Set<string>();
      try {
        const dRes = await sbFetch("bhagavatam_image_deletes?select=chapter_number,scene_index");
        if (dRes.ok) {
          const rows: Array<{ chapter_number: number; scene_index: number }> = await dRes.json();
          for (const r of rows) deletedKeys.add(`${r.chapter_number}-${r.scene_index}`);
        }
      } catch { /* offline — keep all */ }

      const items: GalleryItem[] = [];

      try {
        const res = await fetch(`${API_BASE}/image-manifest`);
        const manifest = await res.json();
        if (manifest?.images) {
          manifest.images.forEach((img: { sceneIndex?: number; chapterNumber: number; chapterTitle?: string; cantoNumber?: number; generatedAt: string; imagePath?: string; descriptionHi?: string; prompt?: string }, idx: number) => {
            const scene = img.sceneIndex ?? 0;
            if (deletedKeys.has(`${img.chapterNumber}-${scene}`)) return;
            const cacheBuster = new Date(img.generatedAt).getTime() || Date.now();
            // Disambiguate with imagePath (always unique per image) so two
            // images for the same chapter+scene can't share an id and confuse
            // multi-select / lightbox routing.
            const uniq = img.imagePath || String(idx);
            items.push({
              id: `ch-${img.chapterNumber}-${scene}-${uniq}`,
              chapterNumber: img.chapterNumber,
              chapterTitle: img.chapterTitle || `Chapter ${img.chapterNumber}`,
              cantoNumber: img.cantoNumber ?? 0,
              sceneIndex: scene,
              url: `${API_BASE}/images/${img.imagePath}?v=${cacheBuster}`,
              description: img.descriptionHi || img.chapterTitle || img.prompt?.split(",").slice(0, 2).join(",").trim() || "",
              generatedAt: img.generatedAt,
              type: "chapter",
            });
          });
        }
      } catch { /* manifest not available */ }

      try {
        const igRes = await fetch(`${API_BASE}/instagram/manifest`);
        const igManifest = await igRes.json();
        if (igManifest?.images) {
          igManifest.images.forEach((img: { sceneIndex?: number; chapterNumber: number; chapterTitle?: string; cantoNumber?: number; generatedAt: string; imagePath?: string; publicUrl?: string; caption?: string; prompt?: string }, idx: number) => {
            const scene = img.sceneIndex ?? 0;
            if (deletedKeys.has(`${img.chapterNumber}-${scene}`)) return;
            // Same uniqueness fix as above — fallback chain handles all the
            // manifest schemas we've seen across Edge Function versions.
            const uniq = img.imagePath || img.publicUrl || img.generatedAt || String(idx);
            items.push({
              id: `ig-${img.chapterNumber}-${scene}-${uniq}`,
              chapterNumber: img.chapterNumber,
              chapterTitle: img.chapterTitle || `Chapter ${img.chapterNumber}`,
              cantoNumber: img.cantoNumber ?? 0,
              sceneIndex: scene,
              url: img.publicUrl || `${API_BASE}/instagram/images/${img.imagePath}`,
              description: img.caption?.split("\n")[0] || img.prompt || "",
              fullCaption: img.caption || img.prompt || "",
              generatedAt: img.generatedAt,
              type: "instagram",
            });
          });
        }
      } catch { /* IG manifest not available */ }

      // ALSO pull approved entries from the Supabase review queue — these
      // are the human-approved IG posts (current source of truth, replaced
      // the static instagram/manifest path).
      try {
        const sbRes = await sbFetch(
          "ig_pending_review?status=eq.approved&select=id,chapter_global_number,chapter_canto,chapter_title,image_url,caption,reviewed_at&order=chapter_global_number.asc",
        );
        if (sbRes.ok) {
          const rows: Array<{
            id: number;
            chapter_global_number: number;
            chapter_canto: number;
            chapter_title: string;
            image_url: string;
            caption: string;
            reviewed_at: string;
          }> = await sbRes.json();
          for (const r of rows) {
            const scene = 200 + r.id;
            if (deletedKeys.has(`${r.chapter_global_number}-${scene}`)) continue;
            // Dedupe — skip if the same URL is already in items
            if (items.some(i => i.url === r.image_url)) continue;
            const firstLine = r.caption?.split("\n").find(l => l.trim()) || r.chapter_title || "";
            items.push({
              id: `ig-approved-${r.id}`,
              chapterNumber: r.chapter_global_number,
              chapterTitle: r.chapter_title || `Chapter ${r.chapter_global_number}`,
              cantoNumber: r.chapter_canto ?? 0,
              sceneIndex: scene,
              url: r.image_url,
              description: firstLine.substring(0, 200),
              fullCaption: r.caption || r.chapter_title || "",
              generatedAt: r.reviewed_at,
              type: "instagram",
            });
          }
        }
      } catch { /* offline — fine */ }

      // ── Pull approved chapter-art rows (landscape 1344x1088 hero images)
      // from the new bhagavatam_chapter_art_review pipeline. Mixes into the
      // gallery as type=chapter so they appear in the All / Chapter views.
      try {
        const sbRes = await sbFetch(
          "bhagavatam_chapter_art_review?status=eq.approved&select=id,chapter_global_number,chapter_canto,chapter_title,image_url,description_hi,reviewed_at&order=chapter_global_number.asc",
        );
        if (sbRes.ok) {
          const rows: Array<{
            id: number;
            chapter_global_number: number;
            chapter_canto: number;
            chapter_title: string;
            image_url: string;
            description_hi: string | null;
            reviewed_at: string;
          }> = await sbRes.json();
          for (const r of rows) {
            // sceneIndex 300+ for chapter art so it doesn't collide with
            // legacy chapter-art (0-199) or approved IG (200-299).
            const scene = 300 + r.id;
            if (deletedKeys.has(`${r.chapter_global_number}-${scene}`)) continue;
            if (items.some(i => i.url === r.image_url)) continue;
            items.push({
              id: `chart-approved-${r.id}`,
              chapterNumber: r.chapter_global_number,
              chapterTitle: r.chapter_title || `Chapter ${r.chapter_global_number}`,
              cantoNumber: r.chapter_canto ?? 0,
              sceneIndex: scene,
              url: r.image_url,
              description: (r.description_hi || r.chapter_title || "").substring(0, 200),
              generatedAt: r.reviewed_at,
              type: "chapter",
            });
          }
        }
      } catch { /* offline — fine */ }

      // Sort by canto → chapter → sceneIndex
      items.sort((a, b) => a.cantoNumber - b.cantoNumber || a.chapterNumber - b.chapterNumber || a.sceneIndex - b.sceneIndex);
      setAllItems(items);
      setLoading(false);
  }, []);

  // Initial load + expose fetchAll to earlier callbacks via the forward ref.
  useEffect(() => {
    fetchAllRef.current = fetchAll;
    void fetchAll();
  }, [fetchAll]);

  // ── Fetch personas when Characters tab is selected ──────────────────────
  useEffect(() => {
    if (filterType !== "characters" || personas.length > 0) return;
    setPersonasLoading(true);
    fetch(`${API_BASE}/personas`)
      .then(r => r.json())
      .then((data: { builtIn: Record<string, string>; custom: Array<{ key: string; name: string; fullDescription: string; shortDescription: string; gender: "male" | "female"; source?: string }> }) => {
        const items: PersonaItem[] = [];
        // Built-in personas
        for (const [key, fullDesc] of Object.entries(data.builtIn)) {
          // Skip if this key also appears in custom (custom overrides)
          if (data.custom.some(c => c.key === key)) continue;
          const name = fullDesc.split(":")[0]?.trim() || key.replace(/_/g, " ");
          const shortDesc = fullDesc.split(":").slice(1).join(":").trim();
          const isFemale = /\bFEMALE\b/i.test(fullDesc);
          items.push({
            key,
            name,
            shortDescription: shortDesc.length > 200 ? shortDesc.slice(0, 200) + "…" : shortDesc,
            fullDescription: fullDesc,
            gender: isFemale ? "female" : "male",
            type: "built-in",
          });
        }
        // Custom personas
        for (const cp of data.custom) {
          items.push({
            key: cp.key,
            name: cp.name,
            shortDescription: cp.shortDescription.split(":").slice(1).join(":").trim() || cp.shortDescription,
            fullDescription: cp.fullDescription,
            gender: cp.gender,
            type: "custom",
            source: cp.source,
          });
        }
        // Sort: custom first, then alphabetically
        items.sort((a, b) => {
          if (a.type !== b.type) return a.type === "custom" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        setPersonas(items);
        setPersonasLoading(false);
      })
      .catch(() => setPersonasLoading(false));
  }, [filterType, personas.length]);

  // Filtered personas by search query
  const filteredPersonas = useMemo(() => {
    if (!searchQuery.trim()) return personas;
    const q = searchQuery.toLowerCase();
    return personas.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.shortDescription.toLowerCase().includes(q) ||
      p.key.toLowerCase().includes(q)
    );
  }, [personas, searchQuery]);

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = allItems;
    if (filterCanto !== "all") result = result.filter(i => i.cantoNumber === filterCanto);
    if (filterType !== "all" && filterType !== "characters") result = result.filter(i => i.type === filterType);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(i =>
        i.chapterTitle.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        String(i.chapterNumber).includes(q)
      );
    }
    // Instagram view mimics a real IG timeline — newest approved post on top.
    // The global sort orders by canto/chapter (good for browsing chapter art);
    // override here so the post you just approved sits at the top of the feed.
    if (filterType === "instagram") {
      result = [...result].sort((a, b) => {
        const ta = new Date(a.generatedAt).getTime() || 0;
        const tb = new Date(b.generatedAt).getTime() || 0;
        return tb - ta; // newest first
      });
    }
    return result;
  }, [allItems, filterCanto, filterType, searchQuery]);

  // ── Group by canto ────────────────────────────────────────────────────────
  const groupedByCanto = useMemo(() => {
    const map = new Map<number, GalleryItem[]>();
    for (const item of filtered) {
      const existing = map.get(item.cantoNumber) || [];
      existing.push(item);
      map.set(item.cantoNumber, existing);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [filtered]);

  // Available cantos for filter dropdown
  const availableCantos = useMemo(() => {
    const cantos = new Set(allItems.map(i => i.cantoNumber));
    return Array.from(cantos).sort((a, b) => a - b);
  }, [allItems]);

  const stats = useMemo(() => ({
    total: allItems.length,
    chapter: allItems.filter(i => i.type === "chapter").length,
    instagram: allItems.filter(i => i.type === "instagram").length,
    cantos: new Set(allItems.map(i => i.cantoNumber)).size,
  }), [allItems]);

  // ── Multi-select & bulk delete ────────────────────────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const bulkDelete = useCallback(async () => {
    const items = allItems.filter(i => selectedIds.has(i.id));
    if (items.length === 0) return;
    const ok = window.confirm(
      `Delete ${items.length} image${items.length === 1 ? "" : "s"}?\n\nThis cannot be undone.`,
    );
    if (!ok) return;
    setBulkDeleting(true);
    let failed = 0;
    for (const item of items) {
      try {
        const res = await sbFetch("bhagavatam_image_deletes", {
          method: "POST",
          headers: { Prefer: "return=representation,resolution=merge-duplicates" },
          body: JSON.stringify({
            chapter_number: item.chapterNumber,
            scene_index: item.sceneIndex ?? 0,
            requested_at: new Date().toISOString(),
          }),
        });
        if (!res.ok) failed++;
      } catch { failed++; }
    }
    // Remove successfully-deleted items from UI (we don't know which failed
    // individually — refetch is the safest, but for snappy UX we drop all and
    // surface a warning if any failed).
    setAllItems(prev => prev.filter(i => !selectedIds.has(i.id)));
    exitSelectMode();
    setBulkDeleting(false);
    if (failed > 0) {
      alert(`${failed} of ${items.length} deletes failed — try again or refresh.`);
    }
  }, [allItems, selectedIds, exitSelectMode]);

  // ── Delete image (permanent, no auto-regeneration) ───────────────────────
  const [regenerating, setRegenerating] = useState<Set<number>>(new Set());

  const handleDeleteImage = useCallback(async (item: GalleryItem) => {
    const sceneIdx = item.sceneIndex ?? 0;

    // Confirm so a stray click doesn't wipe an image
    const ok = typeof window !== "undefined" ? window.confirm(
      `Delete image for ${item.chapterTitle}?\n\nThe image will disappear from the gallery immediately. The local generator will purge the file and manifest entry on its next run.`,
    ) : true;
    if (!ok) return;

    // 1. Queue the delete in Supabase — works directly from the live site.
    //    The (chapter_number, scene_index) PK + ON CONFLICT semantics make
    //    repeated clicks idempotent.
    try {
      const res = await sbFetch("bhagavatam_image_deletes", {
        method: "POST",
        headers: { Prefer: "return=representation,resolution=merge-duplicates" },
        body: JSON.stringify({
          chapter_number: item.chapterNumber,
          scene_index: sceneIdx,
          requested_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        alert(`Delete failed: ${errText || res.statusText}`);
        return;
      }
    } catch (err) {
      alert(`Delete failed — could not reach Supabase.\n${String(err)}`);
      return;
    }

    // 2. Remove from local state immediately so the UI updates without reload.
    setAllItems(prev => prev.filter(i => i.id !== item.id));

    // 3. Lightbox navigation — go to next image, or close if it was the last.
    const idx = filtered.findIndex(i => i.id === item.id);
    if (filtered.length > 1) {
      const nextItem = filtered[idx + 1] || filtered[idx - 1];
      if (nextItem) setLightboxItem(nextItem);
      else setLightboxItem(null);
    } else {
      setLightboxItem(null);
    }
  }, [filtered]);

  const toggleCanto = (canto: number) => {
    setCollapsedCantos(prev => {
      const next = new Set(prev);
      if (next.has(canto)) next.delete(canto);
      else next.add(canto);
      return next;
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-8">
        {/* Header */}
        <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="text-center mb-8 pt-4">
          <motion.div variants={fadeInUp} className="inline-flex items-center gap-2 bg-orange-100/60 text-orange-700 px-4 py-1.5 rounded-full text-xs font-bold tracking-wide mb-4">
            <ImageIcon className="w-3.5 h-3.5" /> BHAGWATHAM IMAGE GALLERY
          </motion.div>
          <motion.h1 variants={fadeInUp} className="font-serif text-3xl sm:text-4xl font-bold text-stone-800 mb-3">
            Sacred Illustrations
          </motion.h1>
          <motion.p variants={fadeInUp} className="text-stone-500 text-sm max-w-lg mx-auto leading-relaxed">
            AI-generated artwork from the Srimad Bhagavatam — chapter covers and Instagram scene illustrations, all in one place.
          </motion.p>
          {!loading && (
            <motion.div variants={fadeInUp} className="flex items-center justify-center gap-4 mt-4 text-[11px] text-stone-400 font-medium">
              <span>{stats.total} images</span>
              <span className="w-1 h-1 rounded-full bg-stone-300" />
              <span>{stats.chapter} chapter covers</span>
              <span className="w-1 h-1 rounded-full bg-stone-300" />
              <span>{stats.instagram} Instagram scenes</span>
              <span className="w-1 h-1 rounded-full bg-stone-300" />
              <span>{stats.cantos} cantos</span>
            </motion.div>
          )}
        </motion.div>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
            <p className="text-sm text-stone-400 font-medium">Loading gallery…</p>
          </div>
        )}

        {!loading && (
          <>
            {/* ── Bulk image generator (for missing chapters) ─────────────── */}
            {bulkStatus && bulkStatus.missingCount > 0 && (
              <div className="mb-6 bg-gradient-to-br from-purple-50 to-indigo-50 border-2 border-purple-200 rounded-2xl p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-600 flex items-center justify-center shrink-0">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-serif font-bold text-purple-900 text-sm">
                      {bulkStatus.missingCount} chapters still missing images
                    </h3>
                    <p className="text-[11px] text-purple-700/80 mt-0.5 leading-relaxed">
                      Generate one sample first to check the style, then bulk-generate the rest. Each image lands in the Pending Review section below for individual approval before posting.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={generateSample}
                    disabled={bulkAction !== "idle"}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:bg-stone-300 disabled:cursor-not-allowed rounded-lg transition-colors"
                  >
                    {bulkAction === "sampling" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
                    Generate 1 sample
                  </button>

                  <div className="flex items-center gap-1.5 bg-white rounded-lg border border-purple-200 px-2 py-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-purple-700">Bulk:</label>
                    <input
                      type="number"
                      value={bulkLimit}
                      onChange={(e) => setBulkLimit(Math.min(50, Math.max(1, parseInt(e.target.value, 10) || 10)))}
                      min={1} max={50}
                      className="w-12 text-xs font-bold text-purple-900 bg-transparent border-0 focus:outline-none text-center"
                    />
                    <span className="text-[10px] text-purple-700/70">images</span>
                  </div>

                  <button
                    onClick={runBulk}
                    disabled={bulkAction !== "idle"}
                    className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white rounded-lg transition-colors ${
                      sampleApproved
                        ? "bg-green-600 hover:bg-green-700 disabled:bg-stone-300"
                        : "bg-amber-500 hover:bg-amber-600 disabled:bg-stone-300"
                    } disabled:cursor-not-allowed`}
                    title={sampleApproved ? "Bulk-generate the next N chapters in parallel" : "Generate a sample and approve it first to confirm the style"}
                  >
                    {bulkAction === "running" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {sampleApproved ? `Bulk-generate ${bulkLimit}` : `Bulk-generate ${bulkLimit} (no sample approved yet)`}
                  </button>

                  <button
                    onClick={refreshBulkStatus}
                    disabled={bulkAction !== "idle"}
                    className="flex items-center gap-1 text-[11px] text-purple-700 hover:text-purple-900 px-2 py-2 disabled:opacity-50"
                    title="Refresh missing-chapter count"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>

                {bulkMessage && (
                  <p className="mt-2.5 text-[11px] text-purple-900 bg-white/60 rounded-lg px-2.5 py-1.5 border border-purple-200">
                    {bulkMessage}
                  </p>
                )}

                {bulkStatus.firstMissing.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <span className="text-[10px] font-semibold text-purple-700/70 uppercase tracking-wider">Next up:</span>
                    {bulkStatus.firstMissing.map((c, i) => (
                      <span key={i} className="text-[10px] text-purple-700 bg-white/70 rounded-full px-2 py-0.5">
                        C{c.canto}.Ch{c.chapter}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Pending review (new Instagram posts awaiting approval) ──── */}
            {pending.length > 0 && (
              <div className="mb-8 bg-amber-50 border-2 border-amber-300 rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-amber-200 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-700" />
                  <h3 className="font-serif font-bold text-amber-900 text-sm">
                    {pending.length} new Instagram post{pending.length === 1 ? "" : "s"} awaiting review
                  </h3>
                  <span className="ml-auto text-[10px] text-amber-700/70">Approve to publish to Buffer · Reject to discard</span>
                </div>
                <div className="divide-y divide-amber-200">
                  {pending.map((p) => {
                    const isExpanded = pendingExpanded === p.id;
                    const isReviewing = reviewing.has(p.id);
                    // Convert the pending row into a GalleryItem shape so the
                    // existing lightbox component can display it full-screen.
                    const openPreview = () => {
                      setLightboxItem({
                        id: `pending-${p.id}`,
                        chapterNumber: p.chapter_global_number,
                        chapterTitle: p.chapter_title || `Chapter ${p.chapter_global_number}`,
                        cantoNumber: p.chapter_canto ?? 0,
                        sceneIndex: 0,
                        url: p.image_url,
                        description: (p.caption || "").split("\n").find((l) => l.trim()) || p.chapter_title || "",
                        fullCaption: p.caption || p.chapter_title || "",
                        generatedAt: p.created_at,
                        type: "instagram",
                      });
                    };
                    return (
                      <div key={p.id} className="flex flex-col sm:flex-row gap-5 p-4">
                        <button
                          onClick={openPreview}
                          className="relative group/img w-full sm:w-72 md:w-80 lg:w-96 aspect-square shrink-0 rounded-xl overflow-hidden shadow-md cursor-zoom-in border border-amber-200"
                          title="Click to view full size"
                          aria-label={`Preview ${p.chapter_title}`}
                        >
                          <img
                            src={p.image_url}
                            alt={p.chapter_title}
                            className="w-full h-full object-cover transition-transform group-hover/img:scale-105"
                            loading="lazy"
                          />
                          <span className="absolute inset-0 bg-black/0 group-hover/img:bg-black/30 transition-colors flex items-center justify-center">
                            <Maximize2 className="w-7 h-7 text-white opacity-0 group-hover/img:opacity-100 transition-opacity drop-shadow" />
                          </span>
                        </button>
                        <div className="flex-1 min-w-0 max-w-2xl">
                          <div className="flex items-start gap-2 mb-1">
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                                Canto {p.chapter_canto} · Ch. {p.chapter_in_canto} · #{p.chapter_global_number}
                              </p>
                              <p className="text-sm font-semibold text-stone-800 truncate" style={{ fontFamily: "var(--font-devanagari)" }}>
                                {p.chapter_title}
                              </p>
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                              <button
                                onClick={() => reviewPost(p.id, "approve")}
                                disabled={isReviewing}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 disabled:bg-stone-300 disabled:cursor-not-allowed rounded-lg transition-colors"
                                title="Publish this post to Instagram + Threads via Buffer"
                              >
                                {isReviewing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                Approve
                              </button>
                              <button
                                onClick={() => reviewPost(p.id, "reject")}
                                disabled={isReviewing}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:bg-stone-300 disabled:cursor-not-allowed rounded-lg transition-colors"
                                title="Discard this image (won't be published)"
                              >
                                {isReviewing ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                                Reject
                              </button>
                            </div>
                          </div>
                          <p className={`text-xs text-stone-600 leading-relaxed whitespace-pre-line ${isExpanded ? "" : "line-clamp-3"}`}>
                            {p.caption}
                          </p>
                          {p.caption.length > 200 && (
                            <button
                              onClick={() => setPendingExpanded(isExpanded ? null : p.id)}
                              className="text-[10px] font-semibold text-amber-700 hover:text-amber-900 mt-1"
                            >
                              {isExpanded ? "Show less" : "Show full caption"}
                            </button>
                          )}
                          {isExpanded && (
                            <p className="text-[10px] text-stone-500 mt-2 italic break-words">{p.hashtags}</p>
                          )}
                          {p.error_message && (
                            <p className="text-[11px] text-red-600 mt-1.5 font-medium">
                              Last error: {p.error_message}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Bulk chapter-art generator (landscape hero images) ───────── */}
            {chartBulkStatus && chartBulkStatus.missingCount > 0 && (
              <div className="mb-6 bg-gradient-to-br from-teal-50 to-cyan-50 border-2 border-teal-200 rounded-2xl p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-teal-600 flex items-center justify-center shrink-0">
                    <ImageIcon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-serif font-bold text-teal-900 text-sm">
                      {chartBulkStatus.missingCount} chapters missing chapter-art covers
                    </h3>
                    <p className="text-[11px] text-teal-700/80 mt-0.5 leading-relaxed">
                      Landscape (1344×1088) hero images shown at the top of each chapter in the reader and in the gallery. Generate one sample to lock the style, then bulk-generate. Each one lands below for individual approval.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={generateChartSample}
                    disabled={chartBulkAction !== "idle"}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:bg-stone-300 disabled:cursor-not-allowed rounded-lg transition-colors"
                  >
                    {chartBulkAction === "sampling" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
                    Generate 1 sample
                  </button>

                  <div className="flex items-center gap-1.5 bg-white rounded-lg border border-teal-200 px-2 py-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Bulk:</label>
                    <input
                      type="number"
                      value={chartBulkLimit}
                      onChange={(e) => setChartBulkLimit(Math.min(50, Math.max(1, parseInt(e.target.value, 10) || 10)))}
                      min={1}
                      max={50}
                      className="w-12 text-xs font-bold text-teal-900 bg-transparent border-0 focus:outline-none text-center"
                    />
                    <span className="text-[10px] text-teal-700/70">covers</span>
                  </div>

                  <button
                    onClick={runChartBulk}
                    disabled={chartBulkAction !== "idle"}
                    className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white rounded-lg transition-colors ${
                      chartSampleApproved
                        ? "bg-green-600 hover:bg-green-700 disabled:bg-stone-300"
                        : "bg-amber-500 hover:bg-amber-600 disabled:bg-stone-300"
                    } disabled:cursor-not-allowed`}
                    title={chartSampleApproved ? "Bulk-generate the next N chapters in parallel" : "Generate a sample and approve it first to confirm the style"}
                  >
                    {chartBulkAction === "running" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {chartSampleApproved ? `Bulk-generate ${chartBulkLimit}` : `Bulk-generate ${chartBulkLimit} (no sample approved yet)`}
                  </button>

                  <button
                    onClick={refreshChartBulkStatus}
                    disabled={chartBulkAction !== "idle"}
                    className="flex items-center gap-1 text-[11px] text-teal-700 hover:text-teal-900 px-2 py-2 disabled:opacity-50"
                    title="Refresh missing-chapter count"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>

                {chartBulkMessage && (
                  <p className="mt-2.5 text-[11px] text-teal-900 bg-white/60 rounded-lg px-2.5 py-1.5 border border-teal-200">
                    {chartBulkMessage}
                  </p>
                )}

                {chartBulkStatus.firstMissing.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <span className="text-[10px] font-semibold text-teal-700/70 uppercase tracking-wider">Next up:</span>
                    {chartBulkStatus.firstMissing.map((c, i) => (
                      <span key={i} className="text-[10px] text-teal-700 bg-white/70 rounded-full px-2 py-0.5">
                        C{c.canto}.Ch{c.chapter}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Pending chapter-art review (new covers awaiting approval) ─ */}
            {pendingChapterArt.length > 0 && (
              <div className="mb-8 bg-cyan-50 border-2 border-cyan-300 rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-cyan-200 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-cyan-700" />
                  <h3 className="font-serif font-bold text-cyan-900 text-sm">
                    {pendingChapterArt.length} new chapter cover{pendingChapterArt.length === 1 ? "" : "s"} awaiting review
                  </h3>
                  <span className="ml-auto text-[10px] text-cyan-700/70">Approve to surface in reader · Reject to regenerate</span>
                </div>
                <div className="divide-y divide-cyan-200">
                  {pendingChapterArt.map((p) => {
                    const isReviewing = reviewingChapterArt.has(p.id);
                    const openPreview = () => {
                      setLightboxItem({
                        id: `chart-pending-${p.id}`,
                        chapterNumber: p.chapter_global_number,
                        chapterTitle: p.chapter_title || `Chapter ${p.chapter_global_number}`,
                        cantoNumber: p.chapter_canto ?? 0,
                        sceneIndex: 0,
                        url: p.image_url,
                        description: p.description_hi || p.scene_title || p.chapter_title || "",
                        generatedAt: p.created_at,
                        type: "chapter",
                      });
                    };
                    return (
                      <div key={p.id} className="flex flex-col sm:flex-row gap-5 p-4">
                        <button
                          onClick={openPreview}
                          className="relative group/img w-full sm:w-80 md:w-96 lg:w-[28rem] aspect-[4/3] shrink-0 rounded-xl overflow-hidden shadow-md cursor-zoom-in border border-cyan-200"
                          title="Click to view full size"
                          aria-label={`Preview ${p.chapter_title}`}
                        >
                          <img
                            src={p.image_url}
                            alt={p.chapter_title}
                            className="w-full h-full object-cover transition-transform group-hover/img:scale-105"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/15 transition-colors flex items-center justify-center">
                            <Maximize2 className="w-6 h-6 text-white opacity-0 group-hover/img:opacity-100 transition-opacity drop-shadow-md" />
                          </div>
                        </button>
                        <div className="flex-1 min-w-0 max-w-2xl">
                          <div className="flex items-baseline gap-2 mb-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-700">
                              {CANTO_NAMES[p.chapter_canto]?.split("—")[0]?.trim() || `Canto ${p.chapter_canto}`} · Ch. {p.chapter_in_canto}
                            </span>
                            <span className="text-[9px] text-cyan-600/60 font-mono">#{p.chapter_global_number}</span>
                          </div>
                          <h4 className="font-serif font-bold text-stone-900 text-sm mb-1.5" style={{ fontFamily: "var(--font-devanagari)" }}>
                            {p.chapter_title}
                          </h4>
                          {p.scene_title && (
                            <p className="text-[11px] text-cyan-700/80 italic mb-2">Scene: {p.scene_title}</p>
                          )}
                          {p.description_hi && (
                            <p className="text-xs text-stone-600 leading-relaxed mb-3 line-clamp-3" style={{ fontFamily: "var(--font-devanagari)" }}>
                              {p.description_hi}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2 mt-3">
                            <button
                              onClick={() => reviewChapterArt(p.id, "approve")}
                              disabled={isReviewing}
                              className="flex items-center gap-1 text-xs font-bold text-white bg-green-600 hover:bg-green-700 disabled:bg-stone-300 px-3 py-1.5 rounded-lg transition-colors"
                            >
                              {isReviewing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                              Approve
                            </button>
                            <button
                              onClick={() => reviewChapterArt(p.id, "reject")}
                              disabled={isReviewing}
                              className="flex items-center gap-1 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:bg-stone-300 px-3 py-1.5 rounded-lg transition-colors"
                            >
                              {isReviewing ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                              Reject
                            </button>
                          </div>
                          {p.error_message && (
                            <p className="mt-2 text-[10px] text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1">
                              {p.error_message}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Regenerating banner */}
            {regenerating.size > 0 && (
              <div className="bg-orange-50 border border-orange-200/60 rounded-2xl px-4 py-3 mb-4 flex items-center gap-3">
                <Loader2 className="w-4 h-4 animate-spin text-orange-500 shrink-0" />
                <p className="text-xs text-orange-700 font-medium">
                  Regenerating {regenerating.size} chapter{regenerating.size > 1 ? "s" : ""}: Ch. {[...regenerating].join(", ")} — new images will appear automatically
                </p>
              </div>
            )}

            {/* Compact header for Instagram mode — gives the user a way out
                since the full filter bar is hidden to mimic a real IG feed. */}
            {filterType === "instagram" && (
              <div className="sticky top-[72px] z-30 max-w-[470px] mx-auto bg-white/95 backdrop-blur-md border-b border-stone-200 mb-2 px-3 py-2 flex items-center gap-2">
                <button
                  onClick={() => setFilterType("all")}
                  className="flex items-center gap-1 text-[12px] font-semibold text-stone-600 hover:text-orange-700 hover:bg-orange-50 px-2 py-1 rounded-md transition-colors"
                  title="Back to gallery"
                  aria-label="Back to gallery"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Back
                </button>
                <span className="text-[13px] font-bold text-stone-900 flex-1 text-center">buildiskcon</span>
                <span className="text-[10px] font-bold text-stone-400 bg-stone-100 px-2 py-1 rounded">
                  {filtered.length}
                </span>
              </div>
            )}

            {/* Filter Bar — hidden in Instagram mode to mimic the real feed */}
            {filterType !== "instagram" && (
            <div className="sticky top-[72px] z-30 bg-white/90 backdrop-blur-md border border-stone-200/60 rounded-2xl shadow-sm px-4 py-3 mb-6 flex flex-wrap items-center gap-3">
              <Filter className="w-4 h-4 text-stone-400 hidden sm:block" />

              {/* Canto dropdown — hidden for characters tab */}
              {filterType !== "characters" && (
                <select
                  value={filterCanto === "all" ? "all" : String(filterCanto)}
                  onChange={(e) => setFilterCanto(e.target.value === "all" ? "all" : Number(e.target.value))}
                  className="text-xs font-medium bg-stone-100 border-0 rounded-lg px-3 py-2 text-stone-600 focus:ring-2 focus:ring-orange-300 outline-none cursor-pointer"
                >
                  <option value="all">All Cantos</option>
                  {availableCantos.map(c => (
                    <option key={c} value={c}>{CANTO_NAMES[c] || `Canto ${c}`}</option>
                  ))}
                </select>
              )}

              {/* Type toggle — Chapter Art and Characters tabs hidden per
                  user request; "All" still surfaces chapter art mixed in. */}
              <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-0.5">
                {(["all", "instagram"] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setFilterType(t)}
                    className={`text-[11px] font-semibold px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                      filterType === t
                        ? "bg-white shadow-sm text-orange-700"
                        : "text-stone-500 hover:text-stone-700"
                    }`}
                  >
                    {t === "all" ? "All" : "Instagram"}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="relative flex-1 min-w-[140px]">
                <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search chapters…"
                  className="w-full text-xs bg-stone-100 border-0 rounded-lg pl-8 pr-3 py-2 text-stone-600 placeholder:text-stone-400 focus:ring-2 focus:ring-orange-300 outline-none"
                />
              </div>

              {/* Count badge */}
              <span className="text-[10px] font-bold text-stone-400 bg-stone-100 px-2.5 py-1.5 rounded-lg shrink-0">
                {filterType === "characters"
                  ? `${filteredPersonas.length} characters`
                  : `${filtered.length} / ${allItems.length}`}
              </span>

              {/* Multi-select toggle (image views only) */}
              {filterType !== "characters" && (
                selectMode ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[11px] font-bold text-orange-700 bg-orange-50 px-2 py-1.5 rounded-lg">
                      {selectedIds.size} selected
                    </span>
                    <button
                      onClick={bulkDelete}
                      disabled={selectedIds.size === 0 || bulkDeleting}
                      className="flex items-center gap-1 text-[11px] font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-stone-300 disabled:cursor-not-allowed px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      {bulkDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      Delete
                    </button>
                    <button
                      onClick={exitSelectMode}
                      className="flex items-center gap-1 text-[11px] font-semibold text-stone-600 hover:bg-stone-100 px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      <X className="w-3 h-3" /> Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setSelectMode(true)}
                    className="flex items-center gap-1 text-[11px] font-semibold text-stone-600 hover:text-orange-700 hover:bg-orange-50 px-2.5 py-1.5 rounded-lg transition-colors shrink-0"
                    title="Select multiple images"
                  >
                    <CheckSquare className="w-3 h-3" /> Select
                  </button>
                )
              )}
            </div>
            )}

            {/* ── Characters / Personas View ─────────────────────────────── */}
            {filterType === "characters" && (
              <div className="pb-12">
                {personasLoading ? (
                  <div className="flex flex-col items-center justify-center py-24 gap-3">
                    <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                    <p className="text-sm text-stone-400 font-medium">Loading characters…</p>
                  </div>
                ) : filteredPersonas.length === 0 ? (
                  <div className="text-center py-20">
                    <Users className="w-10 h-10 text-stone-300 mx-auto mb-3" />
                    <p className="text-stone-500 font-medium">No characters found</p>
                    <p className="text-stone-400 text-sm mt-1">Try adjusting your search</p>
                  </div>
                ) : (
                  <>
                    {/* Stats bar */}
                    <div className="flex flex-wrap items-center gap-3 mb-6">
                      <div className="flex items-center gap-2 text-[11px] text-stone-500">
                        <Crown className="w-3.5 h-3.5 text-amber-500" />
                        <span><strong className="text-stone-700">{personas.filter(p => p.type === "built-in").length}</strong> Built-in</span>
                      </div>
                      <span className="w-1 h-1 rounded-full bg-stone-300" />
                      <div className="flex items-center gap-2 text-[11px] text-stone-500">
                        <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                        <span><strong className="text-stone-700">{personas.filter(p => p.type === "custom").length}</strong> Custom (researched)</span>
                      </div>
                      <span className="w-1 h-1 rounded-full bg-stone-300" />
                      <div className="flex items-center gap-2 text-[11px] text-stone-500">
                        <Shield className="w-3.5 h-3.5 text-blue-500" />
                        <span><strong className="text-stone-700">{personas.filter(p => p.gender === "male").length}</strong> Male</span>
                        <span className="text-stone-300">·</span>
                        <span><strong className="text-stone-700">{personas.filter(p => p.gender === "female").length}</strong> Female</span>
                      </div>
                    </div>

                    {/* Custom personas section */}
                    {filteredPersonas.some(p => p.type === "custom") && (
                      <div className="mb-8">
                        <div className="flex items-center gap-2 mb-4">
                          <Sparkles className="w-4 h-4 text-purple-500" />
                          <h2 className="font-serif text-lg font-bold text-stone-800">Researched Characters</h2>
                          <span className="text-[10px] font-semibold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                            {filteredPersonas.filter(p => p.type === "custom").length}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                          {filteredPersonas.filter(p => p.type === "custom").map((persona, idx) => (
                            <motion.div
                              key={persona.key}
                              initial={{ opacity: 0, y: 12 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                              className={`group relative rounded-2xl border transition-all duration-200 cursor-pointer overflow-hidden ${
                                expandedPersona === persona.key
                                  ? "border-purple-300 bg-purple-50/50 shadow-md"
                                  : "border-stone-200/80 bg-white hover:border-purple-200 hover:shadow-md"
                              }`}
                              onClick={() => setExpandedPersona(expandedPersona === persona.key ? null : persona.key)}
                            >
                              <div className="p-4">
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold ${
                                      persona.gender === "female"
                                        ? "bg-pink-100 text-pink-600"
                                        : "bg-blue-100 text-blue-600"
                                    }`}>
                                      {persona.name.charAt(0)}
                                    </div>
                                    <div className="min-w-0">
                                      <h3 className="font-semibold text-sm text-stone-800 truncate">{persona.name}</h3>
                                      <p className="text-[10px] text-stone-400 font-mono">{persona.key}</p>
                                    </div>
                                  </div>
                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                                    persona.gender === "female"
                                      ? "bg-pink-100 text-pink-600"
                                      : "bg-blue-100 text-blue-600"
                                  }`}>
                                    {persona.gender.toUpperCase()}
                                  </span>
                                </div>
                                <p className="text-[11px] text-stone-600 leading-relaxed line-clamp-3">
                                  {persona.shortDescription}
                                </p>
                                {persona.source && (
                                  <p className="text-[9px] text-stone-400 mt-2 truncate">
                                    📚 {persona.source}
                                  </p>
                                )}
                              </div>
                              {/* Expanded view */}
                              <AnimatePresence>
                                {expandedPersona === persona.key && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="border-t border-stone-200/60 bg-stone-50/50"
                                  >
                                    <div className="p-4">
                                      <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider mb-1.5">Full Description</p>
                                      <p className="text-[11px] text-stone-600 leading-relaxed">{persona.fullDescription}</p>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Built-in personas section */}
                    {filteredPersonas.some(p => p.type === "built-in") && (
                      <div>
                        <div className="flex items-center gap-2 mb-4">
                          <Crown className="w-4 h-4 text-amber-500" />
                          <h2 className="font-serif text-lg font-bold text-stone-800">Built-in Characters</h2>
                          <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                            {filteredPersonas.filter(p => p.type === "built-in").length}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                          {filteredPersonas.filter(p => p.type === "built-in").map((persona, idx) => (
                            <motion.div
                              key={persona.key}
                              initial={{ opacity: 0, y: 12 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                              className={`group relative rounded-2xl border transition-all duration-200 cursor-pointer overflow-hidden ${
                                expandedPersona === persona.key
                                  ? "border-amber-300 bg-amber-50/50 shadow-md"
                                  : "border-stone-200/80 bg-white hover:border-amber-200 hover:shadow-md"
                              }`}
                              onClick={() => setExpandedPersona(expandedPersona === persona.key ? null : persona.key)}
                            >
                              <div className="p-4">
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold ${
                                      persona.gender === "female"
                                        ? "bg-pink-100 text-pink-600"
                                        : "bg-blue-100 text-blue-600"
                                    }`}>
                                      {persona.name.charAt(0)}
                                    </div>
                                    <div className="min-w-0">
                                      <h3 className="font-semibold text-sm text-stone-800 truncate">{persona.name}</h3>
                                      <p className="text-[10px] text-stone-400 font-mono">{persona.key}</p>
                                    </div>
                                  </div>
                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                                    persona.gender === "female"
                                      ? "bg-pink-100 text-pink-600"
                                      : "bg-blue-100 text-blue-600"
                                  }`}>
                                    {persona.gender.toUpperCase()}
                                  </span>
                                </div>
                                <p className="text-[11px] text-stone-600 leading-relaxed line-clamp-3">
                                  {persona.shortDescription}
                                </p>
                              </div>
                              {/* Expanded view */}
                              <AnimatePresence>
                                {expandedPersona === persona.key && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="border-t border-stone-200/60 bg-stone-50/50"
                                  >
                                    <div className="p-4">
                                      <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider mb-1.5">Full Description</p>
                                      <p className="text-[11px] text-stone-600 leading-relaxed">{persona.fullDescription}</p>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Instagram Feed View (Instagram-style cards) ───────────── */}
            {filterType === "instagram" && (
              <>
                {filtered.length === 0 ? (
                  <div className="text-center py-20">
                    <ImageIcon className="w-10 h-10 text-stone-300 mx-auto mb-3" />
                    <p className="text-stone-500 font-medium">No Instagram posts yet</p>
                    <p className="text-stone-400 text-sm mt-1">Approved IG posts will appear here as a real feed</p>
                  </div>
                ) : (
                  <div className="max-w-[470px] mx-auto pb-12 space-y-6">
                    {filtered.map((item) => (
                      <InstagramPostCard key={item.id} item={item} onOpenLightbox={() => setLightboxItem(item)} />
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── Image Gallery View (grid) — for All / Chapter filters ─── */}
            {filterType !== "characters" && filterType !== "instagram" && (
              <>
                {/* Empty state */}
                {filtered.length === 0 && (
                  <div className="text-center py-20">
                    <ImageIcon className="w-10 h-10 text-stone-300 mx-auto mb-3" />
                    <p className="text-stone-500 font-medium">No images match your filters</p>
                    <p className="text-stone-400 text-sm mt-1">Try adjusting the canto or type filter</p>
                  </div>
                )}

                {/* Canto Sections */}
                <div className="space-y-8 pb-12">
                  {groupedByCanto.map(([canto, cantoItems]) => (
                    <motion.div key={canto} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.05, margin: "80px" }} variants={staggerContainer}>
                      {/* Canto header */}
                      <button
                        onClick={() => toggleCanto(canto)}
                        className="w-full flex items-center gap-3 mb-4 group cursor-pointer"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
                            <span className="text-sm font-bold text-orange-600">{canto || "–"}</span>
                          </div>
                          <h2 className="font-serif text-lg sm:text-xl font-bold text-stone-800 truncate">
                            {CANTO_NAMES[canto] || `Canto ${canto}`}
                          </h2>
                          <span className="text-[10px] font-semibold text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full shrink-0">
                            {cantoItems.length}
                          </span>
                        </div>
                        {collapsedCantos.has(canto) ? (
                          <ChevronDown className="w-4 h-4 text-stone-400 group-hover:text-stone-600 transition-colors shrink-0" />
                        ) : (
                          <ChevronUp className="w-4 h-4 text-stone-400 group-hover:text-stone-600 transition-colors shrink-0" />
                        )}
                      </button>

                      {/* Image grid */}
                      <AnimatePresence>
                        {!collapsedCantos.has(canto) && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.25 }}
                            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4"
                          >
                            {cantoItems.map((item, idx) => {
                              const isSelected = selectedIds.has(item.id);
                              return (
                              <motion.div
                                key={item.id}
                                variants={fadeInUp}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true, amount: 0.1 }}
                                transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                                className={`group relative rounded-2xl overflow-hidden bg-stone-100 shadow-sm hover:shadow-lg transition-shadow cursor-pointer aspect-[3/4] ${
                                  selectMode && isSelected ? "ring-4 ring-orange-500" : ""
                                }`}
                                onClick={() => selectMode ? toggleSelected(item.id) : setLightboxItem(item)}
                              >
                                <img
                                  src={item.url}
                                  alt={item.description}
                                  className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 ${
                                    selectMode && isSelected ? "opacity-70" : ""
                                  }`}
                                  loading="lazy"
                                />

                                {/* Multi-select checkbox overlay */}
                                {selectMode && (
                                  <div className="absolute top-2 left-2 z-10 bg-white/90 backdrop-blur-sm rounded-full p-1 shadow">
                                    {isSelected
                                      ? <CheckSquare className="w-5 h-5 text-orange-600" />
                                      : <Square className="w-5 h-5 text-stone-400" />
                                    }
                                  </div>
                                )}

                                {/* Hover overlay with story description */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3">
                                  <p className="text-white text-[11px] font-semibold leading-snug line-clamp-2">{item.chapterTitle}</p>
                                  {item.description && (
                                    <p className="text-white/80 text-[10px] leading-relaxed mt-1.5 line-clamp-3" style={{ fontFamily: "var(--font-devanagari)" }}>
                                      {item.description}
                                    </p>
                                  )}
                                  <div className="flex items-center gap-1.5 mt-1.5">
                                    <span className="text-white/50 text-[9px]">Ch. {item.chapterNumber}</span>
                                    <span className="text-white/30">·</span>
                                    <span className="text-white/50 text-[9px]">{CANTO_NAMES[item.cantoNumber]?.split("—")[0]?.trim() || `Canto ${item.cantoNumber}`}</span>
                                    {item.type === "instagram" && (
                                      <span className="px-1.5 py-0.5 bg-pink-500/40 text-pink-200 rounded text-[9px] font-bold ml-auto">IG</span>
                                    )}
                                  </div>
                                </div>

                                {/* Always-visible type badge (mobile) */}
                                {item.type === "instagram" && (
                                  <div className="absolute top-2 right-2 sm:hidden px-1.5 py-0.5 bg-pink-500/70 text-white rounded text-[9px] font-bold">
                                    IG
                                  </div>
                                )}
                              </motion.div>
                            );
                            })}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxItem && (
          <Lightbox
            item={lightboxItem}
            items={filtered}
            onClose={() => setLightboxItem(null)}
            onNavigate={setLightboxItem}
            onDelete={handleDeleteImage}
          />
        )}
      </AnimatePresence>
    </Layout>
  );
}
