// wall.bhagwatham.com — a living Krishna wallpaper.
//
// A painting of Krishna fills the screen with a verse He spoke in the Gita, and
// every quarter-hour both turn to the next. The clock is shared (lib/wallpaper),
// so every screen showing the page changes together. Leave it open on a laptop,
// put it fullscreen on a TV in the temple hall, or save the current one as a
// phone wallpaper.

import { useCallback, useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { BookOpen, Download, Maximize, Minimize } from "lucide-react";
import { sbFetch } from "@/lib/sbRest";
import { KRISHNA_WALLPAPERS, type Wallpaper } from "@/data/krishnaWallpapers";
import {
  SLOT_MS, coverCrop, coverPosition, fitText, msUntilNextSlot, pickForSlot, slotAt, slotProgress,
  wallpaperQuotes, type Quote, type QuoteRow,
} from "@/lib/wallpaper";

const FADE_MS = 1800;
/** How long the controls stay up after the last touch or mouse move. */
const CHROME_MS = 4000;
/** New verses are logged once a day; a long-open screen picks them up. */
const QUOTES_REFRESH_MS = 6 * 60 * 60 * 1000;

interface Darshan { slot: number; art: Wallpaper; quote: Quote | undefined }

function darshanFor(slot: number, quotes: readonly Quote[]): Darshan {
  return { slot, art: pickForSlot(KRISHNA_WALLPAPERS, slot)!, quote: pickForSlot(quotes, slot) };
}

function reference(q: Quote) {
  return `Bhagavad Gita ${q.chapter}.${q.verse}`;
}

/** Loads with CORS, so the same cached copy can be drawn to a canvas later. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
}

function useNow(everyMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);
  return now;
}

function useBoxAspect() {
  const read = () => (typeof window === "undefined" ? 16 / 9 : window.innerWidth / Math.max(1, window.innerHeight));
  const [aspect, setAspect] = useState(read);
  useEffect(() => {
    const onResize = () => setAspect(read());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return aspect;
}

/**
 * One painting, filling the screen with Krishna's face as near the middle as
 * the painting's edges allow. It drifts slowly inward over its quarter-hour,
 * from His face; the drift starts where the clock says it should, so a reload
 * mid-slot does not jump back to the beginning.
 */
function ArtLayer({ darshan, entering, boxAspect }: { darshan: Darshan; entering: boolean; boxAspect: number }) {
  const { art } = darshan;
  const [delay] = useState(() => -(Date.now() - darshan.slot * SLOT_MS) / 1000);
  const [imageAspect, setImageAspect] = useState(1344 / 1088);
  const pos = coverPosition(art.focusX, art.focusY ?? 0.3, imageAspect, boxAspect);
  return (
    <div className={`absolute inset-0 ${entering ? "wp-fade-in" : ""}`}>
      <img
        src={art.src}
        crossOrigin="anonymous"
        alt={art.caption}
        onLoad={(e) => setImageAspect(e.currentTarget.naturalWidth / Math.max(1, e.currentTarget.naturalHeight))}
        className="wp-drift h-full w-full object-cover"
        style={{
          objectPosition: `${pos.x * 100}% ${pos.y * 100}%`,
          transformOrigin: `${pos.originX * 100}% ${pos.originY * 100}%`,
          animationDelay: `${delay}s`,
        }}
      />
    </div>
  );
}

/**
 * The current darshan as a phone lock-screen image: the whole painting across
 * the middle, a blurred, darkened copy of it filling above and below (where the
 * phone puts its clock), and the verse set beneath.
 */
async function savePhoneWallpaper(d: Darshan) {
  const W = 1080;
  const H = 2340;
  await document.fonts?.ready;
  const img = await loadImage(d.art.src);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d");
  if (!g) return;

  const back = coverCrop(img.naturalWidth, img.naturalHeight, W / H, d.art.focusX);
  g.filter = "blur(36px) brightness(0.5)";
  g.drawImage(img, back.sx, back.sy, back.sw, back.sh, -60, -60, W + 120, H + 120);
  g.filter = "none";
  g.fillStyle = "rgba(12, 8, 4, 0.35)";
  g.fillRect(0, 0, W, H);

  const paintedH = Math.round((W * img.naturalHeight) / img.naturalWidth);
  const top = Math.round(H * 0.3);
  g.shadowColor = "rgba(0, 0, 0, 0.55)";
  g.shadowBlur = 40;
  g.drawImage(img, 0, top, W, paintedH);
  g.shadowBlur = 0;

  const q = d.quote;
  const textTop = top + paintedH + 90;
  const footerY = H - 110;
  g.textAlign = "center";
  if (q) {
    const fit = fitText(`“${q.text}”`, {
      maxWidth: W - 170,
      maxHeight: footerY - 150 - textTop,
      sizes: [56, 52, 48, 44, 40, 36],
      lineHeight: 1.42,
      measureAt: (size, s) => {
        g.font = `400 ${size}px "Noto Serif", Georgia, serif`;
        return g.measureText(s).width;
      },
    });
    g.font = `400 ${fit.size}px "Noto Serif", Georgia, serif`;
    g.fillStyle = "#fffaf0";
    g.shadowColor = "rgba(0, 0, 0, 0.6)";
    g.shadowBlur = 14;
    fit.lines.forEach((line, i) => g.fillText(line, W / 2, textTop + fit.size + i * fit.size * 1.42));
    const after = textTop + fit.size + fit.lines.length * fit.size * 1.42 + 30;
    g.font = `500 32px Inter, system-ui, sans-serif`;
    g.fillStyle = "rgba(255, 228, 180, 0.92)";
    g.fillText(`— ${q.speaker}, ${reference(q)}`, W / 2, after);
  }
  g.shadowBlur = 0;
  g.font = `400 26px Inter, system-ui, sans-serif`;
  g.fillStyle = "rgba(255, 255, 255, 0.55)";
  g.fillText("wall.bhagwatham.com", W / 2, footerY);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `krishna-wallpaper-${d.art.id}.jpg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export default function WallpaperPage() {
  const now = useNow(1000);
  const boxAspect = useBoxAspect();
  const slot = slotAt(now);

  const [quotes, setQuotes] = useState<Quote[]>([]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await sbFetch("gita_quote_log?select=id,chapter,verse,text&order=id.asc");
        if (!res.ok) return;
        const rows = (await res.json()) as QuoteRow[];
        if (alive) setQuotes(wallpaperQuotes(rows));
      } catch { /* the paintings still turn without the verses */ }
    };
    void load();
    const id = window.setInterval(load, QUOTES_REFRESH_MS);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  // What is on screen, and what is fading out beneath it. The next painting is
  // only put up once it has loaded, so the crossfade never shows a blank.
  const [shown, setShown] = useState<Darshan | null>(null);
  const [leaving, setLeaving] = useState<Darshan | null>(null);
  const shownRef = useRef<Darshan | null>(null);
  useEffect(() => {
    const next = darshanFor(slot, quotes);
    const current = shownRef.current;
    if (current && current.slot === slot) {
      // Same painting; the verses may just have arrived.
      if (current.quote !== next.quote) {
        shownRef.current = next;
        setShown(next);
      }
      return;
    }
    let cancelled = false;
    loadImage(next.art.src).catch(() => null).then(() => {
      if (cancelled) return;
      setLeaving(shownRef.current);
      shownRef.current = next;
      setShown(next);
    });
    return () => { cancelled = true; };
  }, [slot, quotes]);
  useEffect(() => {
    if (!leaving) return;
    const id = window.setTimeout(() => setLeaving(null), FADE_MS + 200);
    return () => window.clearTimeout(id);
  }, [leaving]);

  // The controls step back when nobody is touching the screen, and the cursor
  // with them — on a TV the painting should be all there is.
  const [chrome, setChrome] = useState(true);
  const chromeTimer = useRef<number | undefined>(undefined);
  const wake = useCallback(() => {
    setChrome(true);
    window.clearTimeout(chromeTimer.current);
    chromeTimer.current = window.setTimeout(() => setChrome(false), CHROME_MS);
  }, []);
  useEffect(() => {
    wake();
    return () => window.clearTimeout(chromeTimer.current);
  }, [wake]);

  // Fullscreen keeps the screen awake too, for a TV left showing it.
  const [full, setFull] = useState(false);
  const canFull = typeof document !== "undefined" && Boolean(document.documentElement.requestFullscreen);
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const onChange = async () => {
      const isFull = Boolean(document.fullscreenElement);
      setFull(isFull);
      try {
        if (isFull) lock = await (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen") ?? null;
        else { await lock?.release(); lock = null; }
      } catch { /* a screen that may sleep is no worse than before */ }
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => { document.removeEventListener("fullscreenchange", onChange); void lock?.release(); };
  }, []);
  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  }, []);

  const [saving, setSaving] = useState(false);
  const save = useCallback(async () => {
    if (!shown || saving) return;
    setSaving(true);
    try { await savePhoneWallpaper(shown); } finally { setSaving(false); }
  }, [shown, saving]);

  const minutesLeft = Math.max(1, Math.ceil(msUntilNextSlot(now) / 60_000));
  const q = shown?.quote;

  return (
    <div
      className={`fixed inset-0 overflow-hidden bg-[#0c0804] text-white select-none ${chrome ? "" : "cursor-none"}`}
      onPointerMove={wake}
      onPointerDown={wake}
    >
      <Helmet>
        <title>Krishna Wallpaper — a new darshan every 15 minutes | Bhagwatham</title>
        <meta name="description" content="Paintings of Krishna with His words from the Bhagavad Gita, changing every quarter-hour. Leave it open, put it on a TV, or save one as your phone wallpaper." />
      </Helmet>
      <style>{`
        @keyframes wp-drift { from { transform: scale(1); } to { transform: scale(1.08); } }
        @keyframes wp-fade-in { from { opacity: 0; } to { opacity: 1; } }
        .wp-drift { animation: wp-drift ${SLOT_MS / 1000}s linear both; will-change: transform; }
        .wp-fade-in { animation: wp-fade-in ${FADE_MS}ms ease both; }
        @media (prefers-reduced-motion: reduce) { .wp-drift { animation: none; } .wp-fade-in { animation-duration: 1ms; } }
      `}</style>

      {/* Keyed by slot alone, so the painting that was showing is the same element
          as it fades out — no reload, no blank frame under the new one. */}
      {leaving && <ArtLayer key={`a${leaving.slot}`} darshan={leaving} entering={false} boxAspect={boxAspect} />}
      {shown && <ArtLayer key={`a${shown.slot}`} darshan={shown} entering boxAspect={boxAspect} />}

      {/* Shade under the words, and a little under the controls. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/50 to-transparent transition-opacity duration-700 ${chrome ? "opacity-100" : "opacity-0"}`} />

      <header
        className={`absolute inset-x-0 top-0 flex items-center justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 transition-opacity duration-700 ${chrome ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
        <div className="min-w-0">
          <p className="font-serif text-lg font-bold tracking-wide text-amber-50 drop-shadow">Bhagwatham</p>
          <p className="text-xs text-amber-50/80 drop-shadow">Next darshan in {minutesLeft} min</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://buildiskcon.com/gita"
            className="hidden items-center gap-1.5 rounded-full bg-black/35 px-3 py-2 text-xs font-medium text-white backdrop-blur hover:bg-black/55 sm:flex"
          >
            <BookOpen className="h-4 w-4" aria-hidden /> Read the Gita
          </a>
          <button
            type="button"
            onClick={save}
            disabled={!shown || saving}
            className="flex items-center gap-1.5 rounded-full bg-black/35 px-3 py-2 text-xs font-medium text-white backdrop-blur hover:bg-black/55 disabled:opacity-60"
          >
            <Download className="h-4 w-4" aria-hidden /> {saving ? "Saving…" : "Phone wallpaper"}
          </button>
          {canFull && (
            <button
              type="button"
              onClick={toggleFull}
              aria-label={full ? "Leave fullscreen" : "Fullscreen"}
              className="rounded-full bg-black/35 p-2 text-white backdrop-blur hover:bg-black/55"
            >
              {full ? <Minimize className="h-4 w-4" aria-hidden /> : <Maximize className="h-4 w-4" aria-hidden />}
            </button>
          )}
        </div>
      </header>

      {shown && (
        <figure
          key={`q${shown.slot}`}
          className="wp-fade-in absolute inset-x-0 bottom-0 px-5 pb-[max(2.25rem,calc(env(safe-area-inset-bottom)+1.5rem))] sm:px-12 sm:pb-14"
        >
          <figcaption className="mb-3 text-[0.7rem] uppercase tracking-[0.18em] text-amber-100/75 drop-shadow sm:text-xs">
            {shown.art.caption} · {shown.art.source}
          </figcaption>
          {q && (
            <blockquote className="max-w-3xl">
              <p className="font-serif text-[clamp(1.2rem,2.4vw+0.6rem,2.35rem)] leading-snug text-[#fffaf0] [text-shadow:0_2px_14px_rgba(0,0,0,0.55)]">
                “{q.text}”
              </p>
              <footer className="mt-3 text-sm font-medium text-amber-200/95 drop-shadow sm:text-base">
                — {q.speaker}, {reference(q)}
              </footer>
            </blockquote>
          )}
        </figure>
      )}

      {/* The quarter-hour, filling as it passes. */}
      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/10">
        <div className="h-full bg-amber-300/70" style={{ width: `${slotProgress(now) * 100}%` }} />
      </div>
    </div>
  );
}
