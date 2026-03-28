import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { BarChart, Bar, ResponsiveContainer, XAxis, Tooltip } from "recharts";
import { fadeInUp, staggerContainer, viewportOnce } from "@/lib/animations";
import { Link } from "wouter";
import { ArrowRight, Building2, MapPin, Globe, TrendingUp, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ─────────────────────────────────────────────────────────────────────

interface RegionStat {
  region: string;
  count: number;
  investment: number;
  raised: number;
  fundingPct: number;
}

interface CityRow {
  city: string;
  region: string;
  projects: number;
  investment: string;
  status: string;
}

interface UpcomingVision {
  id: number;
  name: string;
  location: string;
  deity: string | null;
  description: string | null;
  phase: string | null;
  constructionProgress: number;
  fundraisingGoal: number;
  fundraisingRaised: number;
  fundingPct: number;
  expectedCompletion: string | null;
  region: string;
  coverImage: string | null;
}

interface Narrative {
  componentKey: string;
  headline: string;
  summary: string;
  recommendation: string;
  confidence: string;
  generatedAt: string;
}

interface RegionalData {
  summary: {
    totalProjects: number;
    totalInvestment: string;
    totalRaised: string;
    fundingPct: number;
    regionsActive: number;
    constructionCount: number;
    planningCount: number;
    completedCount: number;
  };
  projectsByRegion: RegionStat[];
  topCities: CityRow[];
  upcomingVisions: UpcomingVision[];
  narratives: Narrative[];
  generatedAt: string;
}

// ── Status colour mapping ─────────────────────────────────────────────────────

function statusStyle(status: string): string {
  if (status === "Active Construction") return "text-primary bg-primary/10";
  if (status === "Near Completion")     return "text-lime-800 bg-lime-50";
  if (status === "Planning Phase")      return "text-secondary bg-secondary/10";
  return "text-on-surface-variant bg-surface-container";
}

// ── Skeleton loader ───────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("bg-surface-container animate-pulse rounded-lg", className)} />;
}

// ── Region colour accent ──────────────────────────────────────────────────────

function regionColor(region: string): string {
  const map: Record<string, string> = {
    "South Asia": "bg-primary",
    "Africa": "bg-amber-600",
    "Americas": "bg-amber-600",
    "Oceania": "bg-yellow-700",
    "Europe": "bg-secondary",
    "East Asia": "bg-orange-700",
  };
  return map[region] ?? "bg-on-surface-variant";
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RegionalInsights() {
  const [data, setData] = useState<RegionalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/insights/regional`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError("Could not load regional data. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Derive chart data from API
  const maxCount = Math.max(...(data?.projectsByRegion.map((r) => r.count) ?? [1]));

  return (
    <Layout>
      <SEOHead
        title="Regional Insights — Global Temple Intelligence"
        description="Analyse ISKCON temple construction activity by region. Compare India vs international project velocity, continent-level funding gaps, and strategic expansion priorities."
        canonicalPath="/regional"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Regional Insights — Build Iskcon",
          description: "Regional breakdown of ISKCON temple construction progress and fundraising intelligence",
          url: typeof window !== "undefined" ? `${window.location.origin}/regional` : "",
        }}
      />

      <div className="px-6 md:px-12 max-w-screen-2xl mx-auto space-y-16 pb-20">

        {/* Header */}
        <motion.section
          className="max-w-3xl"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          <motion.p variants={fadeInUp} className="text-xs uppercase font-bold tracking-widest text-primary mb-3">
            Live Intelligence
          </motion.p>
          <motion.h1 variants={fadeInUp} className="text-4xl md:text-5xl font-bold font-serif text-on-surface mb-4 leading-tight">
            Global Regional <span className="text-primary italic">Intelligence</span>
          </motion.h1>
          <motion.p variants={fadeInUp} className="text-on-surface-variant font-sans text-lg leading-relaxed max-w-2xl">
            Comparative analysis across continental zones — derived live from {data ? data.summary.totalProjects : "—"} active projects spanning {data ? data.summary.regionsActive : "—"} regions. Updated hourly by the cron intelligence engine.
          </motion.p>

          {data && (
            <motion.div variants={fadeInUp} className="flex items-center gap-2 mt-4 text-xs text-on-surface-variant">
              <RefreshCw className="w-3 h-3" />
              <span>Live data — {new Date(data.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
              <button onClick={load} className="ml-2 text-primary font-semibold hover:underline">Refresh</button>
            </motion.div>
          )}
        </motion.section>

        {/* Error state */}
        {error && (
          <div className="text-red-600 bg-red-50 rounded-xl p-6 font-medium">{error}</div>
        )}

        {/* ── Summary KPI strip ─────────────────────────────────────────── */}
        <motion.section
          className="grid grid-cols-2 sm:grid-cols-4 gap-4"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
          ) : data ? [
            { label: "Total Projects", value: data.summary.totalProjects, sub: `${data.summary.constructionCount} under construction` },
            { label: "Total Capital Goal", value: data.summary.totalInvestment, sub: `${data.summary.fundingPct}% funded globally` },
            { label: "Regions Active", value: data.summary.regionsActive, sub: `on ${data.summary.regionsActive} continents` },
            { label: "In Planning", value: data.summary.planningCount, sub: "upcoming visions" },
          ].map((kpi) => (
            <motion.div key={kpi.label} variants={fadeInUp} className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/10">
              <p className="text-xs uppercase font-bold tracking-widest text-on-surface-variant mb-2">{kpi.label}</p>
              <p className="text-3xl font-bold font-serif text-on-surface">{String(kpi.value)}</p>
              <p className="text-xs text-on-surface-variant mt-1">{kpi.sub}</p>
            </motion.div>
          )) : null}
        </motion.section>

        {/* ── Comparison Bento Grid ──────────────────────────────────────── */}
        <motion.section
          className="grid grid-cols-1 lg:grid-cols-2 gap-8"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
        >
          {/* Projects per Region — horizontal bars */}
          <motion.div variants={fadeInUp} className="bg-surface-container-low p-8 rounded-xl shadow-sm border border-outline-variant/10">
            <div className="flex justify-between items-end mb-10">
              <div>
                <h3 className="text-xl font-bold font-serif text-on-surface mb-1">Projects per Region</h3>
                <p className="text-xs uppercase tracking-widest text-on-surface-variant font-semibold">Active & Planned Sites</p>
              </div>
              <Building2 className="text-primary w-6 h-6" />
            </div>

            <div className="space-y-6">
              {loading
                ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)
                : data?.projectsByRegion.map((item) => (
                    <div key={item.region} className="space-y-2">
                      <div className="flex justify-between text-sm font-medium">
                        <span className="flex items-center gap-2">
                          <span className={cn("w-2 h-2 rounded-full", regionColor(item.region))} />
                          {item.region}
                        </span>
                        <span className="text-primary font-bold">{item.count} {item.count === 1 ? "project" : "projects"}</span>
                      </div>
                      <div className="w-full h-8 bg-surface-container rounded-lg overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary to-primary-container transition-all duration-700"
                          style={{ width: `${(item.count / maxCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
            </div>
          </motion.div>

          {/* Investment by Region — vertical bar chart */}
          <motion.div variants={fadeInUp} className="bg-surface-container-low p-8 rounded-xl shadow-sm border border-outline-variant/10 flex flex-col">
            <div className="flex justify-between items-end mb-10">
              <div>
                <h3 className="text-xl font-bold font-serif text-on-surface mb-1">Investment by Region</h3>
                <p className="text-xs uppercase tracking-widest text-on-surface-variant font-semibold">Allocated Capital ($M)</p>
              </div>
              <TrendingUp className="text-secondary w-6 h-6" />
            </div>

            <div className="flex-1 h-64 min-h-[250px]">
              {loading ? (
                <Skeleton className="h-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={(data?.projectsByRegion ?? []).map((r) => ({
                      region: r.region.replace("South Asia", "S. Asia").replace("Americas", "Americas").replace("East Asia", "E. Asia"),
                      value: r.investment,
                    }))}
                    margin={{ top: 20, right: 0, left: 0, bottom: 0 }}
                  >
                    <XAxis
                      dataKey="region"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#554336', fontSize: 9, fontWeight: 'bold' }}
                      dy={10}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                      contentStyle={{ borderRadius: '8px', border: 'none' }}
                      formatter={(val) => [`$${val}M`, 'Investment Goal']}
                    />
                    <Bar dataKey="value" fill="var(--color-tertiary)" radius={[8, 8, 0, 0]} barSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </motion.div>
        </motion.section>

        {/* ── AI Regional Narratives ─────────────────────────────────────── */}
        {!loading && data && data.narratives.length > 0 && (
          <motion.section
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
          >
            <motion.div variants={fadeInUp} className="mb-8">
              <h2 className="text-3xl font-bold font-serif mb-2">Regional Intelligence Briefs</h2>
              <p className="text-on-surface-variant">AI-synthesised analysis — generated hourly from live project data.</p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {data.narratives.map((n) => (
                <motion.div
                  key={n.componentKey}
                  variants={fadeInUp}
                  className="bg-surface-container-low p-8 rounded-xl border border-outline-variant/10"
                >
                  <div className="flex items-center justify-between mb-4">
                    <Globe className="w-5 h-5 text-primary" />
                    <span className={cn(
                      "text-[10px] font-bold uppercase px-2 py-1 rounded-full",
                      n.confidence === "High" ? "bg-primary/10 text-primary" : "bg-secondary/10 text-secondary"
                    )}>
                      {n.confidence} confidence
                    </span>
                  </div>
                  <h3 className="text-lg font-bold font-serif text-primary leading-snug mb-3">{n.headline}</h3>
                  <p className="text-sm text-on-surface-variant leading-relaxed mb-4">{n.summary}</p>
                  <div className="pt-4 border-t border-outline-variant/20">
                    <p className="text-[10px] uppercase font-bold tracking-widest text-on-surface-variant mb-1">Recommendation</p>
                    <p className="text-sm font-medium text-on-surface">{n.recommendation}</p>
                  </div>
                  <p className="text-[10px] text-on-surface-variant mt-4">
                    Generated {new Date(n.generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.section>
        )}

        {/* ── Top Developing Cities Table ────────────────────────────────── */}
        <motion.section
          initial="hidden"
          whileInView="visible"
          variants={fadeInUp}
          viewport={viewportOnce}
        >
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold font-serif">Top Developing Cities</h2>
            <Link href="/temples" className="text-sm font-semibold text-primary flex items-center gap-1 hover:underline">
              View All Projects <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="overflow-hidden rounded-xl bg-surface-container-low border border-outline-variant/10">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-high/50">
                  <th className="px-6 py-4 text-xs uppercase tracking-widest font-bold text-on-surface-variant">City Center</th>
                  <th className="px-6 py-4 text-xs uppercase tracking-widest font-bold text-on-surface-variant hidden md:table-cell">Region</th>
                  <th className="px-6 py-4 text-xs uppercase tracking-widest font-bold text-on-surface-variant text-center">Projects</th>
                  <th className="px-6 py-4 text-xs uppercase tracking-widest font-bold text-on-surface-variant text-right hidden sm:table-cell">Capital Goal</th>
                  <th className="px-6 py-4 text-xs uppercase tracking-widest font-bold text-on-surface-variant">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        <td className="px-6 py-5" colSpan={5}><Skeleton className="h-6" /></td>
                      </tr>
                    ))
                  : data?.topCities.map((row) => (
                      <tr key={row.city} className="hover:bg-surface-container transition-colors duration-200">
                        <td className="px-6 py-5 font-bold text-on-surface font-serif flex items-center gap-2">
                          <span className={cn("w-2 h-2 rounded-full flex-shrink-0", regionColor(row.region))} />
                          {row.city}
                        </td>
                        <td className="px-6 py-5 text-sm hidden md:table-cell">{row.region}</td>
                        <td className="px-6 py-5 text-center font-mono">{String(row.projects).padStart(2, "0")}</td>
                        <td className="px-6 py-5 text-right font-semibold hidden sm:table-cell">{row.investment}</td>
                        <td className="px-6 py-5">
                          <span className={cn("px-3 py-1 text-[10px] font-bold rounded-full uppercase", statusStyle(row.status))}>
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </motion.section>

        {/* ── Upcoming Visions (planning-phase temples) ───────────────────── */}
        <motion.section
          initial="hidden"
          whileInView="visible"
          variants={staggerContainer}
          viewport={viewportOnce}
        >
          <div className="mb-10">
            <h2 className="text-3xl font-bold font-serif mb-2">Upcoming Visions</h2>
            <p className="text-on-surface-variant font-medium">
              {loading ? "Loading..." : `${data?.upcomingVisions.length ?? 0} projects currently in Land Acquisition & Concept Design stages.`}
            </p>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <Skeleton className="h-96 md:col-span-2" />
              <Skeleton className="h-96" />
            </div>
          ) : data && data.upcomingVisions.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Featured (largest) planning project */}
              {(() => {
                const featured = data.upcomingVisions[0]!;
                return (
                  <Link
                    href={`/temples/${featured.id}`}
                    className="md:col-span-2 group relative overflow-hidden rounded-xl bg-surface-container-high min-h-[384px] flex flex-col justify-end p-10 border border-outline-variant/10 shadow-lg cursor-pointer"
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent z-10" />
                    <img
                      src={featured.coverImage ?? "https://images.unsplash.com/photo-1548013146-72479768bada?q=80&w=2000&auto=format&fit=crop"}
                      alt={featured.name}
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1548013146-72479768bada?q=80&w=2000&auto=format&fit=crop";
                      }}
                    />
                    <div className="relative z-20">
                      <span className="inline-block px-3 py-1 bg-primary-container text-on-primary-container text-[10px] font-bold rounded-sm uppercase tracking-widest mb-4">
                        {featured.phase ?? "Planning Phase"}
                      </span>
                      <h3 className="text-3xl font-bold text-white mb-2 font-serif">{featured.name}</h3>
                      <div className="flex items-center gap-2 text-white/70 text-sm mb-3">
                        <MapPin className="w-3 h-3" />
                        <span>{featured.location}</span>
                        <span className="ml-2 px-2 py-0.5 rounded-sm bg-white/20 text-[10px] font-bold uppercase">{featured.region}</span>
                      </div>
                      {featured.description && (
                        <p className="text-white/80 text-sm max-w-lg mb-6 leading-relaxed line-clamp-3">
                          {featured.description}
                        </p>
                      )}
                      <div className="flex items-center gap-8">
                        <div>
                          <p className="text-[10px] uppercase font-bold text-white/50 tracking-tighter">Capital Goal</p>
                          <p className="text-white font-bold">${(featured.fundraisingGoal / 1_000_000).toFixed(1)}M</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase font-bold text-white/50 tracking-tighter">Funded</p>
                          <p className="text-white font-bold">{featured.fundingPct}%</p>
                        </div>
                        {featured.expectedCompletion && (
                          <div>
                            <p className="text-[10px] uppercase font-bold text-white/50 tracking-tighter">Est. Completion</p>
                            <p className="text-white font-bold">
                              {new Date(featured.expectedCompletion).getFullYear()}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })()}

              {/* Remaining planning projects — stacked cards */}
              <div className="flex flex-col gap-6">
                {data.upcomingVisions.slice(1, 3).map((vision) => (
                  <Link
                    key={vision.id}
                    href={`/temples/${vision.id}`}
                    className="bg-surface-container-low p-8 rounded-xl border border-outline-variant/10 flex flex-col justify-between hover:shadow-md transition-shadow duration-200 cursor-pointer"
                  >
                    <div>
                      <div className="flex justify-between items-start mb-6">
                        <span className={cn(
                          "w-12 h-12 rounded-full flex items-center justify-center font-black text-sm text-white",
                          regionColor(vision.region)
                        )}>
                          {vision.location.split(",")[0]?.slice(0, 3).toUpperCase() ?? "???"}
                        </span>
                        <span className="text-[10px] font-bold text-primary uppercase">{vision.phase ?? "Planning"}</span>
                      </div>
                      <h3 className="text-base font-bold mb-2 font-serif leading-snug">{vision.name}</h3>
                      <p className="text-xs text-on-surface-variant mb-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />{vision.location}
                      </p>
                    </div>
                    <div className="pt-5 border-t border-outline-variant/20">
                      <div className="flex items-center justify-between text-xs font-bold uppercase text-on-surface-variant mb-2">
                        <span>Fundraising Status</span>
                        <span>{vision.fundingPct}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-700"
                          style={{ width: `${vision.fundingPct}%` }}
                        />
                      </div>
                    </div>
                  </Link>
                ))}

                {data.upcomingVisions.length === 0 && (
                  <div className="p-8 text-center text-on-surface-variant">No planning-phase projects found.</div>
                )}
              </div>
            </div>
          ) : !loading && (
            <div className="text-center text-on-surface-variant py-16">
              No planning-phase projects at this time.
            </div>
          )}
        </motion.section>

      </div>
    </Layout>
  );
}
