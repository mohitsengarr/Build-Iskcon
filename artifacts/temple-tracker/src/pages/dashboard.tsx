import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { WorldMap } from "@/components/WorldMap";
import { useGetDashboardStats } from "@workspace/api-client-react";
import { fadeInUp, fadeIn, staggerContainer, scaleIn, viewportOnce } from "@/lib/animations";
import {
  Building2, IndianRupee, ChartBar, CheckCircle2, ArrowRight,
  TrendingUp, TrendingDown, Minus, Globe, Target, Shield,
  Loader2, RefreshCcw, Play, ExternalLink, Film, MapPin,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { Link } from "wouter";
import { BarChart, Bar, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";

// ── Types ────────────────────────────────────────────────────────────────────

interface InsightMetric {
  label: string;
  value: string;
  trend: "up" | "down" | "stable";
}

interface ComponentInsight {
  id:             number;
  componentKey:   string;
  title:          string;
  subtitle:       string;
  headline:       string;
  summary:        string;
  metrics:        InsightMetric[];
  recommendation: string;
  confidence:     "High" | "Medium" | "Low";
  trend:          "up" | "down" | "stable";
  icon:           string;
  accentColor:    string;
  generatedAt:    string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const ICON_MAP: Record<string, React.ReactNode> = {
  "building":     <Building2 className="w-5 h-5" />,
  "trending-up":  <TrendingUp className="w-5 h-5" />,
  "globe":        <Globe className="w-5 h-5" />,
  "target":       <Target className="w-5 h-5" />,
  "shield":       <Shield className="w-5 h-5" />,
};

function TrendBadge({ trend }: { trend: "up" | "down" | "stable" }) {
  if (trend === "up")     return <TrendingUp  className="w-3.5 h-3.5 text-green-600"  />;
  if (trend === "down")   return <TrendingDown className="w-3.5 h-3.5 text-red-500"   />;
  return                         <Minus        className="w-3.5 h-3.5 text-amber-500"  />;
}

function ConfidenceBadge({ confidence }: { confidence: "High" | "Medium" | "Low" }) {
  const map = {
    High:   "bg-green-100 text-green-800",
    Medium: "bg-amber-100 text-amber-800",
    Low:    "bg-red-100 text-red-700",
  };
  return (
    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${map[confidence]}`}>
      {confidence} Confidence
    </span>
  );
}

// ── Temple Videos ─────────────────────────────────────────────────────────────

interface TempleVideo {
  id: number;
  videoId: string;
  title: string;
  channelName: string;
  description: string | null;
  thumbnailUrl: string;
  sourceUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
}

function useTempleVideos() {
  const [videos, setVideos] = useState<TempleVideo[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const API = `${BASE}/api`;
    fetch(`${API}/videos?limit=6`)
      .then((r) => r.json())
      .then((data) => { setVideos(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);
  return { videos, loading };
}

function VideoCard({ video }: { video: TempleVideo }) {
  const [hovered, setHovered] = useState(false);
  const watchUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
  const href = video.sourceUrl?.match(/youtube\.com\/watch|youtu\.be/)
    ? video.sourceUrl
    : watchUrl;
  const isYouTubeWatch = href.includes("youtube.com/watch") || href.includes("youtu.be");

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="block group">
      <div
        className="relative rounded-xl overflow-hidden bg-[#0d1117] aspect-video cursor-pointer shadow-lg"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <img
          src={video.thumbnailUrl}
          alt={video.title}
          className={`w-full h-full object-cover transition-transform duration-500 ${hovered ? "scale-105" : "scale-100"}`}
          onError={(e) => {
            (e.target as HTMLImageElement).src =
              "https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?w=800&h=450&fit=crop";
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div
          className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${hovered ? "opacity-100" : "opacity-0"}`}
        >
          <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/30">
            <Play className="w-6 h-6 text-white fill-white ml-0.5" />
          </div>
        </div>
        <div className="absolute top-3 right-3 flex gap-2">
          {isYouTubeWatch && (
            <span className="bg-red-600 text-white text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">
              YouTube
            </span>
          )}
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mb-1">
            {video.channelName}
          </p>
          <p className="text-sm font-bold text-white leading-snug line-clamp-2 font-serif">
            {video.title}
          </p>
        </div>
      </div>
      {video.description && (
        <p className="text-xs text-on-surface-variant mt-2 line-clamp-2 leading-relaxed px-1">
          {video.description}
        </p>
      )}
    </a>
  );
}

function ConstructionFootage() {
  const { videos, loading } = useTempleVideos();

  return (
    <motion.section
      variants={staggerContainer}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
    >
      <motion.div variants={fadeIn} className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-red-600/10 flex items-center justify-center">
              <Film className="w-4 h-4 text-red-600" />
            </div>
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em]">
              Construction Footage
            </span>
          </div>
          <h2 className="font-serif text-2xl font-bold text-on-surface">Latest from the Field</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            Ground-level construction updates — refreshed automatically by AI each hour
          </p>
        </div>
        <a
          href="https://www.youtube.com/@ISKCONDesireTree"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden md:flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-widest hover:opacity-70 transition-opacity"
        >
          All Videos <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </motion.div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="aspect-video bg-surface-container-low rounded-xl animate-pulse" />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div className="bg-surface-container-low rounded-xl p-12 text-center">
          <Film className="w-10 h-10 text-on-surface-variant mx-auto mb-4 opacity-40" />
          <p className="text-on-surface-variant text-sm">
            Construction videos will appear here after the next AI sync.
          </p>
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
          variants={staggerContainer}
        >
          {videos.map((video) => (
            <motion.div key={video.id} variants={scaleIn}>
              <VideoCard video={video} />
            </motion.div>
          ))}
        </motion.div>
      )}
    </motion.section>
  );
}

// ── Temples hook (for the global map) ────────────────────────────────────────

interface TempleForMap {
  id: number;
  name: string;
  location: string;
  status: string;
  constructionProgress: number;
  fundraisingGoal: number;
  fundraisingRaised: number;
  latitude: number | null;
  longitude: number | null;
}

function useTemples() {
  const [temples, setTemples] = useState<TempleForMap[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`${BASE}/api/temples`)
      .then((r) => r.json())
      .then((data) => { setTemples(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);
  return { temples, loading };
}

// ── Global Site Map Section ───────────────────────────────────────────────────

const STATUS_CFG: Record<string, { color: string; bg: string }> = {
  planning:     { color: "#a78bfa", bg: "rgba(167,139,250,0.08)" },
  construction: { color: "#f59e0b", bg: "rgba(245,158,11,0.08)" },
  finishing:    { color: "#8f4e00", bg: "rgba(143,78,0,0.08)" },
  consecrated:  { color: "#22c55e", bg: "rgba(34,197,94,0.3)" },
};

function GlobalMapSection() {
  const { temples, loading } = useTemples();

  const stats = [
    { label: "Total Sites",        value: temples.length },
    { label: "Under Construction", value: temples.filter((t) => t.status === "construction").length },
    { label: "Planning Phase",     value: temples.filter((t) => t.status === "planning").length },
    { label: "Consecrated",        value: temples.filter((t) => t.status === "consecrated").length },
  ];

  return (
    <motion.section
      variants={staggerContainer}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
      className="space-y-6"
    >
      {/* Section header */}
      <motion.div variants={fadeInUp} className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Globe className="w-4 h-4 text-primary" />
            </div>
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em]">
              Active Sites Worldwide
            </span>
          </div>
          <h2 className="font-serif text-2xl font-bold text-on-surface">Global Progress at a Glance</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            {temples.length} sacred projects across {new Set(temples.map((t) => t.location.split(",").pop()?.trim())).size} regions
          </p>
        </div>
        <Link href="/temples?view=map" className="hidden md:flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-widest hover:opacity-70 transition-opacity">
          Full Directory <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </motion.div>

      {/* Map */}
      <motion.div variants={fadeIn}>
        {loading ? (
          <div className="w-full h-[440px] bg-[#0d1117] rounded-2xl animate-pulse flex items-center justify-center">
            <Globe className="w-12 h-12 text-white/20" style={{ animation: "spin 3s linear infinite" }} />
          </div>
        ) : (
          <WorldMap temples={temples} />
        )}
      </motion.div>

      {/* Stats strip */}
      <motion.div variants={staggerContainer} className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <motion.div key={stat.label} variants={fadeInUp} className="bg-surface-container-low rounded-xl p-5 text-center">
            <p className="text-3xl font-black text-on-surface font-serif">{stat.value}</p>
            <p className="text-[11px] uppercase tracking-widest text-on-surface-variant font-bold mt-1">{stat.label}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Legend + Temple mini-cards */}
      <motion.div variants={fadeInUp} className="space-y-4">
        {/* Legend row */}
        <div className="flex flex-wrap gap-4 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
          {Object.entries(STATUS_CFG).map(([key, c]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
              {key.charAt(0).toUpperCase() + key.slice(1)}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 bg-surface-container-low rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {temples.map((temple) => {
              const c = STATUS_CFG[temple.status] ?? STATUS_CFG.planning!;
              return (
                <Link key={temple.id} href={`/temples/${temple.id}`}>
                  <div
                    className="flex items-center gap-4 p-4 rounded-xl cursor-pointer hover:scale-[1.01] transition-transform"
                    style={{ background: c.bg }}
                  >
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: c.color }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-on-surface truncate font-serif">{temple.name}</p>
                      <p className="text-xs text-on-surface-variant truncate flex items-center gap-1 mt-0.5">
                        <MapPin className="w-2.5 h-2.5 shrink-0" />
                        {temple.location}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold" style={{ color: c.color }}>
                        {Math.round(temple.constructionProgress)}%
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </motion.div>
    </motion.section>
  );
}

// ── McKinsey Insight Card ─────────────────────────────────────────────────────

function InsightCard({ insight, featured = false }: { insight: ComponentInsight; featured?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`rounded-2xl p-6 flex flex-col gap-4 transition-all hover:shadow-md ${
        featured ? "bg-on-surface text-white" : "bg-surface-container"
      }`}
    >
      {/* Header row: icon + title + badge */}
      <div className="flex items-start gap-3">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
            featured ? "bg-white/15 text-white" : "bg-primary/10 text-primary"
          }`}
        >
          {ICON_MAP[insight.icon] ?? <ChartBar className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <h3 className={`font-serif text-sm font-bold leading-snug truncate ${featured ? "text-white" : "text-on-surface"}`}>
              {insight.title}
            </h3>
            <ConfidenceBadge confidence={insight.confidence} />
          </div>
          <p className={`text-[10px] uppercase tracking-widest font-semibold ${featured ? "text-white/50" : "text-on-surface-variant"}`}>
            {insight.subtitle}
          </p>
        </div>
      </div>

      {/* Headline KPI */}
      <div className={`text-2xl font-black font-serif leading-tight ${featured ? "text-primary-container" : "text-primary"}`}>
        {insight.headline}
      </div>

      {/* Summary — clamped by default, full when expanded */}
      <p className={`text-sm leading-relaxed ${expanded ? "" : "line-clamp-3"} ${featured ? "text-white/75" : "text-on-surface-variant"}`}>
        {insight.summary}
      </p>

      {/* Expanded detail: metrics + recommendation */}
      {expanded && (
        <>
          {/* Metrics row */}
          <div className="grid grid-cols-3 gap-2">
            {insight.metrics.map((m, i) => (
              <div
                key={i}
                className={`rounded-xl p-3 flex flex-col gap-1 ${
                  featured ? "bg-white/10" : "bg-surface-container-high"
                }`}
              >
                <TrendBadge trend={m.trend} />
                <div className={`text-sm font-black font-serif leading-none mt-1 ${featured ? "text-white" : "text-on-surface"}`}>
                  {m.value}
                </div>
                <div className={`text-[10px] font-medium uppercase tracking-wide leading-tight ${featured ? "text-white/50" : "text-on-surface-variant"}`}>
                  {m.label}
                </div>
              </div>
            ))}
          </div>

          {/* Recommendation */}
          <div className={`rounded-xl p-4 text-sm leading-relaxed ${featured ? "bg-white/10 text-white/85" : "bg-primary/5 text-on-surface"}`}>
            <span className={`text-[10px] font-bold uppercase tracking-widest block mb-1 ${featured ? "text-primary-container" : "text-primary"}`}>
              Recommendation
            </span>
            {insight.recommendation}
          </div>

          {/* Timestamp */}
          <p className={`text-[10px] ${featured ? "text-white/30" : "text-on-surface-variant/50"}`}>
            Generated {new Date(insight.generatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </p>
        </>
      )}

      {/* Read more / Read less toggle */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className={`flex items-center gap-1 text-xs font-bold uppercase tracking-widest mt-auto pt-1 transition-opacity hover:opacity-70 ${
          featured ? "text-primary-container" : "text-primary"
        }`}
      >
        {expanded ? (
          <>Read less <ChevronUp className="w-3.5 h-3.5" /></>
        ) : (
          <>Read more <ChevronDown className="w-3.5 h-3.5" /></>
        )}
      </button>
    </div>
  );
}

// ── Intelligence Briefs Section ───────────────────────────────────────────────

function IntelligenceBriefs() {
  const [insights, setInsights] = useState<ComponentInsight[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const res  = await fetch(`${BASE}/api/insights/components`);
      const json = await res.json() as { insights: ComponentInsight[] };
      setInsights(json.insights ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-3xl font-bold text-on-surface">Intelligence Briefs</h2>
            <p className="text-sm text-on-surface-variant mt-1">McKinsey-style analysis — AI-generated every hour from live Perplexity + Claude research</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-surface-container rounded-2xl p-7 h-80 animate-pulse flex flex-col gap-4">
              <div className="flex justify-between">
                <div className="w-10 h-10 rounded-xl bg-surface-container-high" />
                <div className="w-24 h-5 rounded-full bg-surface-container-high" />
              </div>
              <div className="w-3/4 h-5 rounded bg-surface-container-high" />
              <div className="w-1/2 h-10 rounded bg-surface-container-high" />
              <div className="flex-1 space-y-2">
                <div className="h-3 rounded bg-surface-container-high" />
                <div className="h-3 rounded bg-surface-container-high w-5/6" />
                <div className="h-3 rounded bg-surface-container-high w-4/6" />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (error || insights.length === 0) {
    return (
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-3xl font-bold text-on-surface">Intelligence Briefs</h2>
            <p className="text-sm text-on-surface-variant mt-1">McKinsey-style analysis — AI-generated every hour from live Perplexity + Claude research</p>
          </div>
        </div>
        <div className="bg-surface-container rounded-2xl p-12 text-center">
          <RefreshCcw className="w-10 h-10 mx-auto text-on-surface-variant mb-4" />
          <p className="text-on-surface-variant text-sm">
            {error
              ? "Intelligence briefs temporarily unavailable."
              : "Generating your first intelligence briefs — trigger a sync or wait for the next hourly cron."}
          </p>
          <button
            onClick={load}
            className="mt-4 text-primary text-sm font-semibold hover:underline"
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  const [featured, ...rest] = insights;

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-3xl font-bold text-on-surface">Intelligence Briefs</h2>
            <p className="text-sm text-on-surface-variant mt-1">McKinsey-style analysis — AI-generated every hour from live Perplexity + Claude research</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-widest hover:opacity-70 transition-opacity"
        >
          <RefreshCcw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Featured card (full width on top, or left column on large screens) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {featured && (
          <div className="lg:col-span-1">
            <InsightCard insight={featured} featured />
          </div>
        )}

        {/* Remaining cards in a 2-column sub-grid */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
          {rest.map((insight) => (
            <InsightCard key={insight.componentKey} insight={insight} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data: stats, isLoading } = useGetDashboardStats();

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        </div>
      </Layout>
    );
  }

  if (!stats) return null;

  const barData = [
    { name: "Q1 2024", india: 120, international: 80  },
    { name: "Q2 2024", india: 150, international: 90  },
    { name: "Q3 2024", india: 190, international: 130 },
    { name: "Q4 (EST)", india: 220, international: 160 },
  ];

  const recentProject = stats.recentUpdates?.[0];

  return (
    <Layout>
      <SEOHead
        title="Global Dashboard"
        description="Live intelligence on ISKCON's global temple construction portfolio — fundraising totals, construction milestones, regional distribution, and AI-driven analytics."
        canonicalPath="/"
        structuredData={[
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "Build Iskcon",
            description: "Tracking ISKCON's global temple construction mission",
            url: typeof window !== "undefined" ? window.location.origin : "",
          },
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Build Iskcon",
            description: "Global ISKCON temple construction intelligence platform",
            url: typeof window !== "undefined" ? window.location.origin : "",
          },
        ]}
      />
      <div className="px-4 md:px-8 max-w-screen-2xl mx-auto space-y-16">

        {/* Hero Section */}
        <section className="relative rounded-xl overflow-hidden bg-surface-container-low min-h-[420px] sm:h-[420px] flex items-center py-8 sm:py-0">
          <div className="absolute inset-0 z-0">
            <img
              src={`${import.meta.env.BASE_URL}images/dashboard-hero.webp`}
              alt="Temple of the Vedic Planetarium under construction"
              className="w-full h-full object-cover object-center"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/80 to-surface/10 z-10" />

          <motion.div
            className="relative z-20 px-6 sm:px-12 max-w-xl"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {/* Value proposition */}
            <motion.p variants={fadeInUp} className="text-on-surface-variant font-sans text-sm mb-3 leading-relaxed">
              Live global dashboard of ISKCON temple construction — see real-time progress, choose a project, and give in seconds.
            </motion.p>

            {/* Shloka — compact, semantic */}
            <motion.figure variants={fadeInUp} className="mb-5">
              <blockquote className="font-serif text-xl sm:text-3xl font-bold text-on-surface leading-snug">
                <span className="text-primary italic">pṛthivīte āche yata nagarādi grāma</span>
                <br />
                sarvatra pracāra haibe mora nāma
              </blockquote>
              <figcaption className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/70 mt-2">
                — Chaitanya Mahaprabhu · The Mahaprabhu Prophecy
              </figcaption>
            </motion.figure>

            {/* CTAs: Donate Now primary, Explore Projects secondary */}
            <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-3">
              <a
                href="https://www.iskcon.org/donate"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-primary text-on-primary px-8 py-3 rounded-xl font-bold text-sm tracking-wide shadow-lg hover:shadow-primary/30 hover:bg-primary/90 transition-all active:scale-95 text-center w-full sm:w-auto"
              >
                Donate Now
              </a>
              <Link href="/temples">
                <button className="border-2 border-primary/40 text-primary px-8 py-3 rounded-xl font-bold text-sm tracking-wide hover:bg-primary/5 transition-all active:scale-95 cursor-pointer w-full sm:w-auto">
                  Explore Projects
                </button>
              </Link>
            </motion.div>
          </motion.div>
        </section>

        {/* Key Metric Cards */}
        <motion.section
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <motion.div variants={fadeInUp} className="bg-surface-container p-6 rounded-xl transition-all hover:bg-surface-container-high group">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Building2 className="w-5 h-5" />
              </div>
              <span className="text-xs font-semibold text-primary uppercase tracking-widest">+4 this quarter</span>
            </div>
            <h3 className="text-on-surface-variant text-sm font-medium uppercase tracking-wide mb-1">Total Active Projects</h3>
            <div className="text-3xl font-black text-on-surface font-serif">{stats.activeProjects || stats.totalTemples}</div>
          </motion.div>

          <motion.div variants={fadeInUp} className="bg-surface-container p-6 rounded-xl transition-all hover:bg-surface-container-high">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center text-secondary">
                <IndianRupee className="w-5 h-5" />
              </div>
              <span className="text-xs font-semibold text-secondary uppercase tracking-widest">Global Portfolio</span>
            </div>
            <h3 className="text-on-surface-variant text-sm font-medium uppercase tracking-wide mb-1">Total Portfolio Goal</h3>
            <div className="text-3xl font-black text-on-surface font-serif">
              ${(stats.totalFundraisingGoal / 1_000_000).toFixed(0)}M
            </div>
          </motion.div>

          <motion.div variants={fadeInUp} className="bg-surface-container p-6 rounded-xl transition-all hover:bg-surface-container-high">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-lg bg-tertiary/10 flex items-center justify-center text-tertiary">
                <ChartBar className="w-5 h-5" />
              </div>
              <span className="text-xs font-semibold text-tertiary uppercase tracking-widest">Global Average</span>
            </div>
            <h3 className="text-on-surface-variant text-sm font-medium uppercase tracking-wide mb-1">Average Completion</h3>
            <div className="text-3xl font-black text-on-surface font-serif">
              {stats.averageProgress ? Math.round(stats.averageProgress) : 65}%
            </div>
          </motion.div>

          <motion.div
            variants={fadeInUp}
            className="bg-surface-container p-6 rounded-xl transition-all hover:bg-surface-container-high"
            style={{ outline: "2px solid color-mix(in srgb, #ff9933 20%, transparent)" }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-lg bg-primary-container/10 flex items-center justify-center text-primary">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <span className="animate-pulse flex items-center gap-1 text-[10px] font-bold text-primary uppercase bg-primary-container/20 px-2 py-0.5 rounded-full">
                Final Phase
              </span>
            </div>
            <h3 className="text-on-surface-variant text-sm font-medium uppercase tracking-wide mb-1">Near Completion</h3>
            <div className="text-3xl font-black text-on-surface font-serif">
              {stats.templesByStatus?.finishing || 0}
            </div>
          </motion.div>
        </motion.section>

        {/* Seva Opportunities — surfaced early for donors */}
        <motion.section
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          id="how-to-give"
          className="bg-primary/5 border border-primary/15 rounded-2xl px-6 sm:px-10 py-8 flex flex-col md:flex-row items-center justify-between gap-6"
        >
          <motion.div variants={fadeInUp} className="flex-1 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary block mb-1">Where Your Seva Is Needed Most</span>
            <h2 className="font-serif text-xl sm:text-2xl font-bold text-on-surface mb-2">
              Choose a Project — Give Directly
            </h2>
            <p className="text-sm text-on-surface-variant leading-relaxed max-w-xl">
              Every rupee and dollar goes to a specific temple. Browse active projects, pick the one that calls to you, and contribute directly to its construction goal.
            </p>
          </motion.div>
          <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-3 shrink-0">
            <Link href="/temples">
              <button className="bg-primary text-on-primary px-7 py-3 rounded-xl font-bold text-sm tracking-wide shadow hover:shadow-primary/20 hover:bg-primary/90 transition-all active:scale-95 cursor-pointer w-full sm:w-auto">
                Browse Projects
              </button>
            </Link>
            <a
              href="https://www.iskcon.org/donate"
              target="_blank"
              rel="noopener noreferrer"
              className="border-2 border-primary/40 text-primary px-7 py-3 rounded-xl font-bold text-sm tracking-wide hover:bg-primary/5 transition-all active:scale-95 text-center w-full sm:w-auto"
            >
              Donate Now
            </a>
          </motion.div>
        </motion.section>

        {/* Global Mandala Map */}
        <GlobalMapSection />

        {/* How to Give — 3-step donor guide */}
        <motion.section
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          className="space-y-6"
        >
          <motion.div variants={fadeInUp}>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary block mb-1">Simple & Transparent</span>
            <h2 className="font-serif text-2xl font-bold text-on-surface">How to Give</h2>
            <p className="text-sm text-on-surface-variant mt-1">Your donation reaches the temple in three steps.</p>
          </motion.div>
          <motion.div variants={staggerContainer} className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              { step: "1", title: "Browse Projects", body: "Use the Project Directory to explore every active construction site — filter by region, status, or funding gap." },
              { step: "2", title: "Choose Your Seva", body: "Each project page shows live funding progress, the project lead, and an expected completion date so you can give with full context." },
              { step: "3", title: "Donate Directly", body: "Click Donate on any project card. Your contribution is tracked against that temple's goal and updated here in real time." },
            ].map(({ step, title, body }) => (
              <motion.div key={step} variants={fadeInUp} className="bg-surface-container rounded-xl p-6 flex gap-4">
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-black text-sm shrink-0">
                  {step}
                </div>
                <div>
                  <h3 className="font-serif font-bold text-on-surface mb-1">{title}</h3>
                  <p className="text-sm text-on-surface-variant leading-relaxed">{body}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
          <motion.div variants={fadeInUp} className="flex justify-center pt-2">
            <Link href="/temples">
              <button className="bg-primary text-on-primary px-8 py-3 rounded-xl font-bold text-sm tracking-wide shadow hover:shadow-primary/20 hover:bg-primary/90 transition-all active:scale-95 cursor-pointer">
                Start Browsing Projects
              </button>
            </Link>
          </motion.div>
        </motion.section>

        {/* Divider: donor funnel above / leadership analytics below */}
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-outline-variant/30" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant px-3 py-1.5 rounded-full bg-surface-container-low whitespace-nowrap">
            For GBC &amp; Leadership
          </span>
          <div className="flex-1 h-px bg-outline-variant/30" />
        </div>

        {/* McKinsey Intelligence Briefs */}
        <IntelligenceBriefs />

        {/* Latest Construction Footage */}
        <ConstructionFootage />

        {/* Bottom Section */}
        <motion.div
          className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >

          {/* Regional Distribution Chart */}
          <motion.div variants={scaleIn} className="lg:col-span-2 bg-surface-container-low rounded-xl p-8">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-10 gap-4">
              <div>
                <h2 className="font-serif text-2xl font-bold text-on-surface">Funding Status by Region</h2>
                <p className="text-sm text-on-surface-variant">Domestic vs. international project velocity</p>
              </div>
              <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-widest">
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-primary"></span> India</div>
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-tertiary"></span> International</div>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barGap={2}>
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#554336", fontSize: 12, fontWeight: 600 }}
                    width={40}
                  />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#554336", fontSize: 12, fontWeight: 600 }}
                    dy={10}
                  />
                  <RechartsTooltip
                    cursor={{ fill: "rgba(27,28,28,0.04)" }}
                    contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 6px 24px rgba(27,28,28,0.06)" }}
                  />
                  <Bar dataKey="india"         fill="var(--color-primary)"  radius={[8, 8, 0, 0]} barSize={32} />
                  <Bar dataKey="international" fill="var(--color-tertiary)" radius={[8, 8, 0, 0]} barSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* Spotlight Card */}
          <motion.div variants={scaleIn} className="bg-on-surface-variant text-surface-container-lowest rounded-xl p-8 relative overflow-hidden flex flex-col justify-between">
            <div className="absolute -top-10 -right-10 w-48 h-48 bg-primary/20 rounded-full blur-3xl" />
            <div>
              <span className="inline-block px-3 py-1 rounded-full bg-primary text-on-primary text-[10px] font-bold uppercase tracking-widest mb-6">
                Spotlight Project
              </span>
              <h2 className="font-serif text-3xl font-bold mb-4 leading-tight">
                {recentProject?.title || "Temple of the Vedic Planetarium"}
              </h2>
              <p className="text-sm opacity-80 mb-8 leading-relaxed line-clamp-3">
                {recentProject?.content || "The flagship structural wonder in Mayapur, West Bengal. Merging cosmology and modern engineering on a massive scale."}
              </p>
            </div>

            <div className="space-y-5">
              <div className="flex justify-between items-end pb-4" style={{ borderBottom: "1px solid rgba(251,249,248,0.10)" }}>
                <span className="text-xs font-medium uppercase tracking-widest opacity-80">Status</span>
                <span className="text-lg font-bold text-primary-container">Finishing Phase</span>
              </div>
              <div className="flex justify-between items-end pb-4" style={{ borderBottom: "1px solid rgba(251,249,248,0.10)" }}>
                <span className="text-xs font-medium uppercase tracking-widest opacity-80">Recent Update</span>
                <span className="text-sm font-bold italic">
                  {recentProject ? new Date(recentProject.createdAt).toLocaleDateString() : "2024"}
                </span>
              </div>
            </div>

            <Link href={recentProject ? `/temples/${recentProject.templeId}` : "/temples/1"}>
              <button
                className="mt-8 flex items-center justify-center gap-2 w-full py-4 rounded-xl hover:bg-surface/10 transition-colors cursor-pointer"
                style={{ border: "1px solid rgba(251,249,248,0.20)" }}
              >
                <span className="text-sm font-bold tracking-wide">View Project</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
          </motion.div>

        </motion.div>

        {/* ── Srila Prabhupada Tribute ───────────────────────────────────── */}
        <motion.section
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          className="relative overflow-hidden rounded-2xl bg-on-surface text-[#fbf9f8]"
        >
          {/* Decorative glow */}
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-secondary/20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-0">

            {/* Photo panel */}
            <motion.div
              variants={fadeIn}
              className="relative h-72 lg:h-auto overflow-hidden lg:rounded-l-2xl"
            >
              <img
                src="/prabhupada.jpg"
                alt="His Divine Grace A.C. Bhaktivedanta Swami Prabhupada"
                className="w-full h-full object-cover object-top"
              />
              {/* subtle gradient overlay on the right edge to blend */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-on-surface/60 hidden lg:block" />
              <div className="absolute inset-0 bg-gradient-to-t from-on-surface/70 to-transparent lg:hidden" />
            </motion.div>

            {/* Content panel */}
            <motion.div variants={staggerContainer} className="p-8 md:p-12 lg:p-14 flex flex-col justify-center gap-6">

              {/* Label */}
              <motion.div variants={fadeInUp}>
                <span className="inline-block px-3 py-1 rounded-full border border-primary/50 text-primary text-[10px] font-bold uppercase tracking-widest">
                  Founder-Ācārya · ISKCON
                </span>
              </motion.div>

              {/* Name */}
              <motion.div variants={fadeInUp}>
                <h2 className="font-serif text-3xl md:text-4xl font-bold leading-tight text-[#fbf9f8] mb-1">
                  His Divine Grace
                </h2>
                <h2 className="font-serif text-3xl md:text-4xl font-bold leading-tight text-primary italic">
                  A. C. Bhaktivedanta Swami Prabhupāda
                </h2>
                <p className="text-sm text-white/50 font-medium mt-2 tracking-wide">
                  1 September 1896 — 14 November 1977
                </p>
              </motion.div>

              {/* Bio */}
              <motion.p variants={fadeInUp} className="text-white/75 text-base leading-relaxed max-w-2xl">
                Born Abhay Charanaravinda De in Calcutta, Prabhupāda was a Gaudīya Vaishnava teacher and the most prominent proponent of the devotional tradition of Chaitanya Mahaprabhu. At the age of 69 he sailed alone to New York and founded the <strong className="text-white font-semibold">International Society for Krishna Consciousness (ISKCON)</strong> in 1966.
              </motion.p>

              <motion.p variants={fadeInUp} className="text-white/75 text-base leading-relaxed max-w-2xl">
                In eleven years he circled the globe fourteen times, established over 100 temples worldwide, and produced a prolific body of Vedic literature — including the landmark <em className="text-white/90">Bhagavad-gītā As It Is</em>, the <em className="text-white/90">Śrīmad-Bhāgavatam</em>, and the <em className="text-white/90">Caitanya-caritāmṛta</em>. His vision of a temple in every town and village remains the guiding mandate for every project tracked on this platform.
              </motion.p>

              {/* Quote */}
              <motion.blockquote
                variants={fadeInUp}
                className="border-l-2 border-primary pl-6 mt-2"
              >
                <p className="font-serif text-lg italic text-white/90 leading-relaxed">
                  "Our temples are not for making money. They are meant for the purpose of spreading Kṛṣṇa consciousness."
                </p>
                <cite className="text-xs text-white/50 font-semibold uppercase tracking-widest mt-3 block not-italic">
                  — Srila Prabhupāda
                </cite>
              </motion.blockquote>

              {/* Stat chips */}
              <motion.div variants={fadeInUp} className="flex flex-wrap gap-3 pt-2">
                {[
                  { label: "Temples Founded", value: "108+" },
                  { label: "Translations", value: "80 languages" },
                  { label: "Books Distributed", value: "500M+" },
                  { label: "Disciples Initiated", value: "5,000+" },
                ].map((stat) => (
                  <div key={stat.label} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-center">
                    <p className="text-primary font-bold text-base leading-none mb-1">{stat.value}</p>
                    <p className="text-white/50 text-[10px] uppercase font-semibold tracking-widest">{stat.label}</p>
                  </div>
                ))}
              </motion.div>

            </motion.div>
          </div>
        </motion.section>

      </div>
    </Layout>
  );
}
