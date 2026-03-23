import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { useListTemples } from "@workspace/api-client-react";
import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { MapPin, Grid, List, Search, Filter } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/** Fetches a real photo from Wikipedia's free open REST API. Returns null if not found. */
function useWikiImage(templeName: string, location: string, skip: boolean): string | null {
  const [src, setSrc] = useState<string | null>(null);
  const tried = useRef(false);

  useEffect(() => {
    if (skip || tried.current) return;
    tried.current = true;

    const parts = location.split(",").map(p => p.trim());
    const city = parts[0] ?? location;
    const cityFirstWord = city.split(/\s+/)[0] ?? city;
    const state = parts[1] ?? "";
    const candidates = [
      templeName,
      `ISKCON ${cityFirstWord}`,
      city,
      cityFirstWord,
      cityFirstWord && state ? `${cityFirstWord}, ${state}` : "",
    ].filter(Boolean);

    async function tryNext(list: string[]): Promise<void> {
      for (const query of list) {
        try {
          const title = encodeURIComponent(query.replace(/\s+/g, "_"));
          const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}`);
          if (!res.ok) continue;
          const data = await res.json() as { thumbnail?: { source?: string } };
          const imgSrc = data?.thumbnail?.source;
          if (imgSrc) {
            setSrc(imgSrc.replace(/\/\d+px-/, "/800px-"));
            return;
          }
        } catch { /* try next */ }
      }
    }

    tryNext(candidates);
  }, [templeName, location, skip]);

  return src;
}

interface TempleCardProps {
  temple: {
    id: number;
    name: string;
    location: string;
    phase: string;
    status: string;
    constructionProgress: number;
    fundraisingGoal: number;
    fundraisingRaised: number;
    coverImage?: string | null;
  };
  idx: number;
}

function TempleCard({ temple, idx }: TempleCardProps) {
  const wikiSrc = useWikiImage(temple.name, temple.location, !!temple.coverImage);
  const coverImg = temple.coverImage || wikiSrc;
  const progressPercentage = Math.round(Math.min(100, Math.max(0, temple.constructionProgress)));

  return (
    <motion.div
      key={temple.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: idx * 0.05 }}
      className="group flex flex-col bg-surface-container-lowest rounded-xl overflow-hidden shadow-[0_4px_24px_rgba(27,28,28,0.06)] hover:-translate-y-1 transition-transform duration-300"
    >
      <div className="relative h-64 overflow-hidden bg-surface-container">
        {coverImg ? (
          <img
            src={coverImg}
            alt={temple.name}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-surface-container-high">
            <span className="text-5xl opacity-20">🛕</span>
          </div>
        )}
        <div className="absolute top-4 left-4 bg-primary-container text-on-primary-container px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">
          {temple.phase}
        </div>
      </div>

      <div className="p-8 flex-1 flex flex-col">
        <div className="mb-6">
          <h3 className="text-2xl font-bold font-serif text-on-surface mb-1 line-clamp-1">{temple.name}</h3>
          <p className="text-sm text-on-surface-variant font-medium flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {temple.location}
          </p>
        </div>

        <div className="space-y-4 mb-8 mt-auto">
          <div>
            <div className="flex justify-between text-xs font-bold uppercase tracking-tighter mb-2">
              <span className="text-on-surface-variant">Realization</span>
              <span className="text-primary">{progressPercentage}%</span>
            </div>
            <div className="h-1.5 w-full bg-surface-container-high rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-secondary rounded-full"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>

          <div className="flex justify-between items-end pt-4" style={{ borderTop: '1px solid rgba(219,194,176,0.15)' }}>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold">Est. Investment</p>
              <p className="text-lg font-bold text-on-surface">
                ${(temple.fundraisingGoal / 1_000_000).toFixed(1)}M
              </p>
            </div>
            <span className={cn(
              "text-[10px] uppercase font-bold px-3 py-1 rounded-full",
              temple.fundraisingRaised >= temple.fundraisingGoal
                ? "bg-primary text-on-primary"
                : "text-secondary bg-secondary-container/30"
            )}>
              {temple.fundraisingRaised >= temple.fundraisingGoal ? "Fully Funded" : "In Progress"}
            </span>
          </div>
        </div>

        <Link href={`/temples/${temple.id}`}>
          <button className="w-full py-3.5 text-primary font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-primary hover:text-on-primary transition-all duration-300 bg-primary/5">
            View Details
          </button>
        </Link>
      </div>
    </motion.div>
  );
}

export default function TempleList() {
  const { data: temples, isLoading } = useListTemples();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [filterRegion, setFilterRegion] = useState("all");
  const [filterStage, setFilterStage] = useState("all");

  const filteredTemples = temples?.filter(t => {
    if (filterStage !== "all" && t.status !== filterStage) return false;
    return true;
  }) || [];

  return (
    <Layout>
      <SEOHead
        title="Project Directory — Global Temple Mandala"
        description="Browse all active ISKCON temple construction projects worldwide. Filter by status, region, and fundraising progress. Discover temples under construction across India and internationally."
        canonicalPath="/temples"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "ISKCON Global Temple Project Directory",
          description: "A complete directory of ISKCON temple construction projects worldwide",
          url: typeof window !== "undefined" ? `${window.location.origin}/temples` : "",
        }}
      />
      <div className="px-4 md:px-8 max-w-screen-2xl mx-auto pb-20">

        {/* Header & View Toggle */}
        <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
          <div className="max-w-2xl">
            <h1 className="text-4xl md:text-5xl font-black text-on-surface tracking-tight mb-4 font-serif">The Global Mandala</h1>
            <p className="text-on-surface-variant font-sans text-lg leading-relaxed">
              Intelligence repository for temple construction, fundraising analytics, and spiritual infrastructure milestones across all continents.
            </p>
          </div>
          <div className="flex items-center bg-surface-container-low p-1.5 rounded-xl">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "flex items-center gap-2 px-6 py-2 rounded-lg transition-all font-semibold",
                viewMode === "grid" ? "bg-surface-container-lowest shadow-sm text-primary" : "text-on-surface-variant hover:text-primary"
              )}
            >
              <Grid className="w-4 h-4" />
              <span className="text-xs uppercase tracking-widest">Grid</span>
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "flex items-center gap-2 px-6 py-2 rounded-lg transition-all font-semibold",
                viewMode === "list" ? "bg-surface-container-lowest shadow-sm text-primary" : "text-on-surface-variant hover:text-primary"
              )}
            >
              <List className="w-4 h-4" />
              <span className="text-xs uppercase tracking-widest">List</span>
            </button>
          </div>
        </div>

        {/* Filter Bar — no hard borders, tonal background only */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-12 items-end bg-surface-container-low p-6 rounded-2xl">
          <div className="flex flex-col gap-2">
            <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-on-surface-variant px-1">Search City</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant w-4 h-4" />
              <input
                type="text"
                placeholder="e.g. Mayapur"
                className="w-full bg-surface-container-lowest rounded-lg py-2.5 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                style={{ borderBottom: '2px solid rgba(219,194,176,0.20)' }}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-on-surface-variant px-1">Region</label>
            <select
              className="w-full bg-surface-container-lowest rounded-lg py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary appearance-none transition-all"
              value={filterRegion}
              onChange={(e) => setFilterRegion(e.target.value)}
              style={{ borderBottom: '2px solid rgba(219,194,176,0.20)' }}
            >
              <option value="all">All Continents</option>
              <option value="asia">Asia Pacific</option>
              <option value="americas">Americas</option>
              <option value="europe">Europe</option>
              <option value="africa">Africa</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-on-surface-variant px-1">Construction Stage</label>
            <select
              className="w-full bg-surface-container-lowest rounded-lg py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary appearance-none transition-all"
              value={filterStage}
              onChange={(e) => setFilterStage(e.target.value)}
              style={{ borderBottom: '2px solid rgba(219,194,176,0.20)' }}
            >
              <option value="all">All Stages</option>
              <option value="planning">Planning</option>
              <option value="construction">Construction</option>
              <option value="finishing">Finishing</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-on-surface-variant px-1">Funding Status</label>
            <select
              className="w-full bg-surface-container-lowest rounded-lg py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary appearance-none transition-all"
              style={{ borderBottom: '2px solid rgba(219,194,176,0.20)' }}
            >
              <option>Any Status</option>
              <option>Fully Funded</option>
              <option>In Progress</option>
              <option>Critical</option>
            </select>
          </div>
          <button className="bg-primary text-on-primary h-[42px] px-8 rounded-xl font-bold text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
            <Filter className="w-4 h-4" />
            Apply Filters
          </button>
        </div>

        {/* Project Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-96 bg-surface-container-low rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredTemples.length === 0 ? (
          <div className="bg-surface-container-low rounded-xl p-12 text-center">
            <h3 className="text-2xl font-serif font-bold text-on-surface mb-2">No projects found</h3>
            <p className="text-on-surface-variant">Try adjusting your filters or search terms.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredTemples.map((temple, idx) => (
              <TempleCard key={temple.id} temple={temple} idx={idx} />
            ))}
          </div>
        )}

      </div>
    </Layout>
  );
}
