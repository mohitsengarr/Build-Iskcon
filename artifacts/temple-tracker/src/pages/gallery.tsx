import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Layout } from "@/components/layout/Layout";
import { Loader2, Download, Share2, X, Search, ImageIcon, Filter, ChevronDown, ChevronUp, Trash2, Maximize2, Minimize2, RefreshCw } from "lucide-react";
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
  generatedAt: string;
  type: "chapter" | "instagram";
}

// ── Constants ───────────────────────────────────────────────────────────────

const API_BASE = "/api/bhagwatham";

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

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex flex-col items-center justify-center"
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

      {/* Image */}
      <motion.img
        key={item.id}
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }}
        src={item.url}
        alt={item.description}
        className={`object-contain shadow-2xl transition-all duration-300 ${
          fullscreen ? "max-h-screen max-w-full rounded-none" : "max-h-[70vh] max-w-[90vw] rounded-2xl"
        }`}
        onClick={(e) => e.stopPropagation()}
      />

      {/* Bottom info bar — hidden in fullscreen */}
      {!fullscreen && (
        <div className="mt-4 max-w-xl w-full text-center px-4" onClick={(e) => e.stopPropagation()}>
          <p className="text-white/90 text-sm font-medium mb-1">{item.chapterTitle}</p>
          {item.description && (
            <p className="text-white/60 text-xs leading-relaxed mb-2 line-clamp-2" style={{ fontFamily: "var(--font-devanagari)" }}>
              {item.description}
            </p>
          )}
          <p className="text-white/40 text-[10px] mb-3">
            {CANTO_NAMES[item.cantoNumber] || `Canto ${item.cantoNumber}`} · Chapter {item.chapterNumber} · Scene {item.sceneIndex}
            {item.type === "instagram" && <span className="ml-2 px-1.5 py-0.5 bg-pink-500/30 text-pink-300 rounded text-[10px]">Instagram</span>}
          </p>
          <div className="flex items-center justify-center gap-2">
            <button onClick={handleDownload} className="flex items-center gap-1.5 text-xs text-white/70 hover:text-white px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
              <Download className="w-3.5 h-3.5" /> Download
            </button>
            <button onClick={handleShare} className="flex items-center gap-1.5 text-xs text-white/70 hover:text-white px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
              <Share2 className="w-3.5 h-3.5" /> Share
            </button>
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 text-xs text-red-400/70 hover:text-red-400 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Delete & Regenerate
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => { onDelete(item); setConfirmDelete(false); }}
                  className="flex items-center gap-1 text-xs text-white px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 transition-colors font-semibold"
                >
                  <RefreshCw className="w-3 h-3" /> Delete & Regenerate
                </button>
                <button onClick={() => setConfirmDelete(false)} className="text-xs text-white/50 hover:text-white px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ── Gallery Page ─────────────────────────────────────────────────────────────

export default function Gallery() {
  const [allItems, setAllItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCanto, setFilterCanto] = useState<number | "all">("all");
  const [filterType, setFilterType] = useState<"all" | "chapter" | "instagram">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [lightboxItem, setLightboxItem] = useState<GalleryItem | null>(null);
  const [collapsedCantos, setCollapsedCantos] = useState<Set<number>>(new Set());

  // ── Fetch manifests ───────────────────────────────────────────────────────
  useEffect(() => {
    async function fetchAll() {
      const items: GalleryItem[] = [];

      try {
        const res = await fetch(`${API_BASE}/image-manifest`);
        const manifest = await res.json();
        if (manifest?.images) {
          for (const img of manifest.images) {
            const cacheBuster = new Date(img.generatedAt).getTime() || Date.now();
            items.push({
              id: `ch-${img.chapterNumber}-${img.sceneIndex ?? 0}`,
              chapterNumber: img.chapterNumber,
              chapterTitle: img.chapterTitle || `Chapter ${img.chapterNumber}`,
              cantoNumber: img.cantoNumber ?? 0,
              sceneIndex: img.sceneIndex ?? 0,
              url: `${API_BASE}/images/${img.imagePath}?v=${cacheBuster}`,
              description: img.descriptionHi || img.chapterTitle || img.prompt?.split(",").slice(0, 2).join(",").trim() || "",
              generatedAt: img.generatedAt,
              type: "chapter",
            });
          }
        }
      } catch { /* manifest not available */ }

      try {
        const igRes = await fetch(`${API_BASE}/instagram/manifest`);
        const igManifest = await igRes.json();
        if (igManifest?.images) {
          for (const img of igManifest.images) {
            items.push({
              id: `ig-${img.chapterNumber}-${img.sceneIndex ?? 0}`,
              chapterNumber: img.chapterNumber,
              chapterTitle: img.chapterTitle || `Chapter ${img.chapterNumber}`,
              cantoNumber: img.cantoNumber ?? 0,
              sceneIndex: img.sceneIndex ?? 0,
              url: img.publicUrl || `${API_BASE}/instagram/images/${img.imagePath}`,
              description: img.caption?.split("\n")[0] || img.prompt || "",
              generatedAt: img.generatedAt,
              type: "instagram",
            });
          }
        }
      } catch { /* IG manifest not available */ }

      // Sort by canto → chapter → sceneIndex
      items.sort((a, b) => a.cantoNumber - b.cantoNumber || a.chapterNumber - b.chapterNumber || a.sceneIndex - b.sceneIndex);
      setAllItems(items);
      setLoading(false);
    }
    fetchAll();
  }, []);

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = allItems;
    if (filterCanto !== "all") result = result.filter(i => i.cantoNumber === filterCanto);
    if (filterType !== "all") result = result.filter(i => i.type === filterType);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(i =>
        i.chapterTitle.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        String(i.chapterNumber).includes(q)
      );
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

  // ── Delete + Regenerate image ────────────────────────────────────────────
  const [regenerating, setRegenerating] = useState<Set<number>>(new Set()); // chapter numbers currently regenerating

  const handleDeleteImage = useCallback(async (item: GalleryItem) => {
    // Step 1: Delete the bad image
    try {
      const endpoint = item.type === "instagram"
        ? `${API_BASE}/image/${item.chapterNumber}/${(item.sceneIndex ?? 0) + 100}`
        : `${API_BASE}/image/${item.chapterNumber}/${item.sceneIndex ?? 0}`;
      const res = await fetch(endpoint, { method: "DELETE" });

      if (!res.ok) {
        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          alert("Delete & regenerate requires the API server (dev mode).");
          return;
        }
      }
    } catch {
      alert("Delete & regenerate requires the API server. Run locally.");
      return;
    }

    // Remove from local state immediately
    const deletedChapter = item.chapterNumber;
    const deletedType = item.type;
    setAllItems(prev => prev.filter(i => i.id !== item.id));

    // Navigate to next image in lightbox
    const idx = filtered.findIndex(i => i.id === item.id);
    if (filtered.length > 1) {
      const nextItem = filtered[idx + 1] || filtered[idx - 1];
      if (nextItem) setLightboxItem(nextItem);
      else setLightboxItem(null);
    } else {
      setLightboxItem(null);
    }

    // Step 2: Trigger regeneration in background
    setRegenerating(prev => new Set(prev).add(deletedChapter));
    try {
      const regenRes = await fetch(`${API_BASE}/regenerate-chapter/${deletedChapter}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}), // auto-generate prompt
      });

      if (regenRes.ok) {
        const data = await regenRes.json();
        // Add the newly generated images back to the gallery
        if (data.images?.length > 0) {
          const newItems: GalleryItem[] = data.images.map((img: any) => ({
            id: `ch-${img.chapterNumber}-${img.sceneIndex ?? 0}-${Date.now()}`,
            chapterNumber: img.chapterNumber,
            chapterTitle: img.chapterTitle || `Chapter ${img.chapterNumber}`,
            cantoNumber: img.cantoNumber ?? 0,
            sceneIndex: img.sceneIndex ?? 0,
            url: `${API_BASE}/images/${img.imagePath}?v=${Date.now()}`,
            description: img.descriptionHi || img.chapterTitle || "",
            generatedAt: img.generatedAt || new Date().toISOString(),
            type: deletedType,
          }));
          setAllItems(prev => [...prev, ...newItems].sort((a, b) =>
            a.cantoNumber - b.cantoNumber || a.chapterNumber - b.chapterNumber || a.sceneIndex - b.sceneIndex
          ));
        }
      }
    } catch { /* regeneration failed silently */ }
    setRegenerating(prev => { const next = new Set(prev); next.delete(deletedChapter); return next; });
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
            {/* Regenerating banner */}
            {regenerating.size > 0 && (
              <div className="bg-orange-50 border border-orange-200/60 rounded-2xl px-4 py-3 mb-4 flex items-center gap-3">
                <Loader2 className="w-4 h-4 animate-spin text-orange-500 shrink-0" />
                <p className="text-xs text-orange-700 font-medium">
                  Regenerating {regenerating.size} chapter{regenerating.size > 1 ? "s" : ""}: Ch. {[...regenerating].join(", ")} — new images will appear automatically
                </p>
              </div>
            )}

            {/* Filter Bar */}
            <div className="sticky top-[72px] z-30 bg-white/90 backdrop-blur-md border border-stone-200/60 rounded-2xl shadow-sm px-4 py-3 mb-6 flex flex-wrap items-center gap-3">
              <Filter className="w-4 h-4 text-stone-400 hidden sm:block" />

              {/* Canto dropdown */}
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

              {/* Type toggle */}
              <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-0.5">
                {(["all", "chapter", "instagram"] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setFilterType(t)}
                    className={`text-[11px] font-semibold px-3 py-1.5 rounded-md transition-colors ${
                      filterType === t
                        ? "bg-white shadow-sm text-orange-700"
                        : "text-stone-500 hover:text-stone-700"
                    }`}
                  >
                    {t === "all" ? "All" : t === "chapter" ? "Chapter Art" : "Instagram"}
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
                {filtered.length} / {allItems.length}
              </span>
            </div>

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
                        {cantoItems.map((item, idx) => (
                          <motion.div
                            key={item.id}
                            variants={fadeInUp}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true, amount: 0.1 }}
                            transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                            className="group relative rounded-2xl overflow-hidden bg-stone-100 shadow-sm hover:shadow-lg transition-shadow cursor-pointer aspect-[3/4]"
                            onClick={() => setLightboxItem(item)}
                          >
                            <img
                              src={item.url}
                              alt={item.description}
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                              loading="lazy"
                            />

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
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
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
