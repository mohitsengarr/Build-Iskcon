import { useEffect, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { useGetDashboardStats } from "@workspace/api-client-react";
import {
  Building2, IndianRupee, ChartBar, CheckCircle2, ArrowRight,
  TrendingUp, TrendingDown, Minus, Globe, Target, Shield,
  Loader2, RefreshCcw,
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

// ── McKinsey Insight Card ─────────────────────────────────────────────────────

function InsightCard({ insight, featured = false }: { insight: ComponentInsight; featured?: boolean }) {
  return (
    <div
      className={`rounded-2xl p-7 flex flex-col gap-5 h-full transition-all hover:shadow-lg ${
        featured ? "bg-on-surface text-white" : "bg-surface-container"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            featured ? "bg-white/15 text-white" : "bg-primary/10 text-primary"
          }`}
        >
          {ICON_MAP[insight.icon] ?? <ChartBar className="w-5 h-5" />}
        </div>
        <ConfidenceBadge confidence={insight.confidence} />
      </div>

      {/* Title */}
      <div>
        <h3 className={`font-serif text-lg font-bold leading-snug ${featured ? "text-white" : "text-on-surface"}`}>
          {insight.title}
        </h3>
        <p className={`text-xs mt-0.5 ${featured ? "text-white/60" : "text-on-surface-variant"}`}>
          {insight.subtitle}
        </p>
      </div>

      {/* Headline KPI */}
      <div className={`text-3xl font-black font-serif leading-none ${featured ? "text-primary-container" : "text-primary"}`}>
        {insight.headline}
      </div>

      {/* Summary */}
      <p className={`text-sm leading-relaxed flex-1 ${featured ? "text-white/80" : "text-on-surface-variant"}`}>
        {insight.summary}
      </p>

      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-2">
        {insight.metrics.map((m, i) => (
          <div
            key={i}
            className={`rounded-xl p-3 flex flex-col gap-1 ${
              featured ? "bg-white/10" : "bg-surface-container-high"
            }`}
          >
            <div className="flex items-center gap-1">
              <TrendBadge trend={m.trend} />
            </div>
            <div className={`text-base font-black font-serif leading-none ${featured ? "text-white" : "text-on-surface"}`}>
              {m.value}
            </div>
            <div className={`text-[10px] font-medium uppercase tracking-wide leading-tight ${featured ? "text-white/50" : "text-on-surface-variant"}`}>
              {m.label}
            </div>
          </div>
        ))}
      </div>

      {/* Recommendation */}
      <div
        className={`rounded-xl p-4 text-sm leading-relaxed ${
          featured ? "bg-white/10 text-white/90" : "bg-primary/5 text-on-surface"
        }`}
      >
        <span className={`text-[10px] font-bold uppercase tracking-widest block mb-1 ${featured ? "text-primary-container" : "text-primary"}`}>
          Recommendation
        </span>
        {insight.recommendation}
      </div>

      {/* Footer */}
      <div className={`text-[10px] ${featured ? "text-white/30" : "text-on-surface-variant/50"}`}>
        Generated {new Date(insight.generatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
      </div>
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
        <section className="relative rounded-xl overflow-hidden bg-surface-container-low min-h-[480px] sm:h-[450px] flex items-center py-8 sm:py-0">
          <div className="absolute inset-0 z-0">
            <img
              src={`${import.meta.env.BASE_URL}images/dashboard-hero.webp`}
              alt="Temple of the Vedic Planetarium under construction"
              className="w-full h-full object-cover object-center"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/75 to-surface/20 z-10" />

          <div className="relative z-20 px-6 sm:px-12 max-w-2xl">
            <span className="text-xs font-semibold uppercase tracking-widest text-primary/80 mb-2 block">The Mahaprabhu Prophecy</span>
            <h1 className="font-serif text-3xl sm:text-5xl font-bold text-on-surface mb-4 leading-tight">
              pṛthivīte āche yata nagarādi grāma <br />
              <span className="text-primary">sarvatra pracāra haibe mora nāma</span>
            </h1>
            <p className="text-on-surface-variant font-sans text-base sm:text-lg mb-8 leading-relaxed">
              As Chaitanya Mahaprabhu declared, {"\u201C"}In every town and village throughout the world, the chanting of My name will be heard.{"\u201D"} Tracking ISKCON{"\u2019"}s sacred mission to fulfil this prophecy — project by project, continent by continent.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/temples">
                <button className="bg-primary text-on-primary px-8 py-3 rounded-xl font-bold text-sm tracking-wide shadow-lg hover:shadow-primary/20 transition-all active:scale-95 cursor-pointer w-full sm:w-auto">
                  Explore All Projects
                </button>
              </Link>
              <Link href="/regional">
                <button className="bg-secondary-container text-on-secondary-container px-8 py-3 rounded-xl font-bold text-sm tracking-wide transition-all active:scale-95 hover:bg-secondary-container/80 cursor-pointer w-full sm:w-auto">
                  Regional Insights
                </button>
              </Link>
            </div>
          </div>
        </section>

        {/* Key Metric Cards */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-surface-container p-6 rounded-xl transition-all hover:bg-surface-container-high group">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Building2 className="w-5 h-5" />
              </div>
              <span className="text-xs font-semibold text-primary uppercase tracking-widest">+4 this quarter</span>
            </div>
            <h3 className="text-on-surface-variant text-sm font-medium uppercase tracking-wide mb-1">Total Active Projects</h3>
            <div className="text-3xl font-black text-on-surface font-serif">{stats.activeProjects || stats.totalTemples}</div>
          </div>

          <div className="bg-surface-container p-6 rounded-xl transition-all hover:bg-surface-container-high">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center text-secondary">
                <IndianRupee className="w-5 h-5" />
              </div>
              <span className="text-xs font-semibold text-secondary uppercase tracking-widest">Global Portfolio</span>
            </div>
            <h3 className="text-on-surface-variant text-sm font-medium uppercase tracking-wide mb-1">Total Global Investment</h3>
            <div className="text-3xl font-black text-on-surface font-serif">
              ${(stats.totalFundraisingGoal / 1_000_000).toFixed(0)}M
            </div>
          </div>

          <div className="bg-surface-container p-6 rounded-xl transition-all hover:bg-surface-container-high">
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
          </div>

          <div
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
          </div>
        </section>

        {/* McKinsey Intelligence Briefs */}
        <IntelligenceBriefs />

        {/* Bottom Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Regional Distribution Chart */}
          <div className="lg:col-span-2 bg-surface-container-low rounded-xl p-8">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-10 gap-4">
              <div>
                <h2 className="font-serif text-2xl font-bold text-on-surface">Regional Distribution</h2>
                <p className="text-sm text-on-surface-variant">Domestic vs. International project velocity</p>
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
          </div>

          {/* Spotlight Card */}
          <div className="bg-on-surface-variant text-surface-container-lowest rounded-xl p-8 relative overflow-hidden flex flex-col justify-between">
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
          </div>

        </div>
      </div>
    </Layout>
  );
}
