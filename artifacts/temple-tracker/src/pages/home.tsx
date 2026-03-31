import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { WorldMap } from "@/components/WorldMap";
import { useGetDashboardStats } from "@workspace/api-client-react";
import { fadeInUp, fadeIn, staggerContainer, scaleIn, viewportOnce } from "@/lib/animations";
import {
  Building2, IndianRupee, ChartBar, CheckCircle2, ArrowRight,
  Globe, MapPin, Heart, Users, ChevronDown, ExternalLink,
  BookOpen, Utensils, GraduationCap, Tv, Youtube,
} from "lucide-react";
import {
  ISKCON_STATS, ISKCON_PROGRAMS, ISKCON_REGIONS, TOTAL_CATALOGUED,
} from "@/data/iskcon-centers";

// ── Helpers & Hooks ──────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface TempleForMap {
  id: number; name: string; location: string; status: string;
  constructionProgress: number; fundraisingGoal: number; fundraisingRaised: number;
  latitude: number | null; longitude: number | null; donateUrl: string | null;
  projectLead: string;
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

const STATUS_CFG: Record<string, { color: string; bg: string }> = {
  planning:     { color: "#C49A6C", bg: "rgba(196,154,108,0.10)" },
  construction: { color: "#D4872E", bg: "rgba(212,135,46,0.10)" },
  finishing:    { color: "#9B6B2F", bg: "rgba(155,107,47,0.10)" },
  consecrated:  { color: "#6B8F3C", bg: "rgba(107,143,60,0.12)" },
};

const FALLBACK_STATS = {
  totalTemples: 16, activeProjects: 16, totalFundraisingGoal: 450_000_000,
  totalFundraisingRaised: 180_000_000, averageProgress: 42,
  templesByStatus: { construction: 8, planning: 4, finishing: 2, consecrated: 2 },
  recentUpdates: [],
};

// ── Section: Hero ────────────────────────────────────────────────────────────

function HeroSection({ stats }: { stats: typeof FALLBACK_STATS }) {
  return (
    <section id="hero" className="relative rounded-xl overflow-hidden bg-surface-container-low min-h-[420px] sm:h-[420px] flex items-center py-8 sm:py-0">
      <div className="absolute inset-0 z-0">
        <img src={`${import.meta.env.BASE_URL}images/dashboard-hero.webp`} alt="Temple of the Vedic Planetarium" className="w-full h-full object-cover object-center" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/80 to-surface/10 z-10" />
      <motion.div className="relative z-20 px-6 sm:px-12 max-w-xl" variants={staggerContainer} initial="hidden" animate="visible">
        <motion.h1 variants={fadeInUp} className="font-serif text-3xl sm:text-4xl font-bold text-on-surface leading-tight mb-3">
          Build Sacred Spaces<br />Across the World
        </motion.h1>
        <motion.p variants={fadeInUp} className="text-on-surface-variant font-sans text-sm mb-5 leading-relaxed">
          {stats.activeProjects || stats.totalTemples} ISKCON temples rising across 11 countries — track real-time progress, choose a project, and give in seconds.
        </motion.p>
        <motion.figure variants={fadeInUp} className="mb-6 border-l-2 border-primary/40 pl-4">
          <blockquote className="font-serif text-base sm:text-lg italic text-on-surface/80 leading-snug">
            pṛthivīte āche yata nagarādi grāma — sarvatra pracāra haibe mora nāma
          </blockquote>
          <figcaption className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/60 mt-1.5">— Chaitanya Mahaprabhu</figcaption>
        </motion.figure>
        <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-3">
          <a href="#projects" onClick={(e) => { e.preventDefault(); document.querySelector("#projects")?.scrollIntoView({ behavior: "smooth" }); }}>
            <button className="bg-primary text-on-primary px-8 py-3 rounded-xl font-bold text-sm tracking-wide shadow-lg hover:shadow-primary/30 hover:bg-primary/90 transition-all active:scale-95 cursor-pointer w-full sm:w-auto">Choose a Project</button>
          </a>
          <a href="#vision" onClick={(e) => { e.preventDefault(); document.querySelector("#vision")?.scrollIntoView({ behavior: "smooth" }); }}>
            <button className="border-2 border-primary/40 text-primary px-8 py-3 rounded-xl font-bold text-sm tracking-wide hover:bg-primary/5 transition-all active:scale-95 text-center w-full sm:w-auto cursor-pointer">Vision 2051</button>
          </a>
        </motion.div>
      </motion.div>
    </section>
  );
}

// ── Section: Key Metrics ─────────────────────────────────────────────────────

function KeyMetrics({ stats }: { stats: typeof FALLBACK_STATS }) {
  return (
    <motion.section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" variants={staggerContainer} initial="hidden" whileInView="visible" viewport={viewportOnce}>
      {[
        { icon: <Building2 className="w-5 h-5" />, label: "Active Projects", value: stats.activeProjects || stats.totalTemples, tag: "Active", tagColor: "text-primary" },
        { icon: <IndianRupee className="w-5 h-5" />, label: "Total Fundraising Goal", value: `$${(stats.totalFundraisingGoal / 1_000_000).toFixed(0)}M`, tag: "Fundraising", tagColor: "text-secondary" },
        { icon: <ChartBar className="w-5 h-5" />, label: "Average Progress", value: `${Math.round((stats as any).averageProgress || 42)}%`, tag: "Progress", tagColor: "text-tertiary" },
        { icon: <CheckCircle2 className="w-5 h-5" />, label: "Near Completion", value: stats.templesByStatus?.finishing || 0, tag: "Almost There", tagColor: "text-primary" },
      ].map((item) => (
        <motion.div key={item.label} variants={fadeInUp} className="bg-surface-container p-6 rounded-xl transition-all hover:bg-surface-container-high">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">{item.icon}</div>
            <span className={`text-xs font-semibold uppercase tracking-widest ${item.tagColor}`}>{item.tag}</span>
          </div>
          <h3 className="text-on-surface-variant text-sm font-medium uppercase tracking-wide mb-1">{item.label}</h3>
          <div className="text-3xl font-black text-on-surface font-serif">{item.value}</div>
        </motion.div>
      ))}
    </motion.section>
  );
}

// ── Section: TOVP Countdown ──────────────────────────────────────────────────

function CountdownBanner() {
  const target = new Date("2027-11-02T00:00:00");
  const totalMs = Math.max(0, target.getTime() - Date.now());
  const totalDays = Math.floor(totalMs / 86400000);
  const months = Math.floor(totalDays / 30);
  const remDays = totalDays % 30;

  return (
    <motion.section variants={fadeInUp} initial="hidden" whileInView="visible" viewport={viewportOnce}>
      <div className="relative overflow-hidden rounded-2xl px-6 sm:px-10 py-7 flex flex-col sm:flex-row items-center justify-between gap-6" style={{ background: "linear-gradient(135deg, #7A4520 0%, #A0612B 50%, #8B5E2F 100%)" }}>
        <div className="relative z-10">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-on-primary/70 mb-1.5">Grand Opening · November 2, 2027</p>
          <h2 className="font-serif text-2xl sm:text-3xl font-bold leading-tight">Temple of the Vedic Planetarium</h2>
          <p className="text-sm text-on-primary/80 mt-1">Mayapur, West Bengal — the crown jewel of ISKCON's global mission</p>
        </div>
        <div className="relative z-10 flex gap-5 text-center shrink-0">
          {[{ val: months, label: "Months" }, { val: remDays, label: "Days" }, { val: totalDays, label: "Total Days" }].map(({ val, label }) => (
            <div key={label} className="flex flex-col items-center">
              <span className="font-serif text-4xl font-black tabular-nums">{val}</span>
              <span className="text-[10px] uppercase tracking-widest font-bold text-on-primary/70 mt-1">{label}</span>
            </div>
          ))}
        </div>
        <a href="https://tovp.org/donate/" target="_blank" rel="noopener noreferrer" className="relative z-10 shrink-0">
          <button className="bg-on-primary text-primary px-7 py-3 rounded-xl font-bold text-sm tracking-wide hover:bg-on-primary/90 transition-colors whitespace-nowrap flex items-center gap-2">
            <Heart className="w-4 h-4" /> Donate to TOVP
          </button>
        </a>
      </div>
    </motion.section>
  );
}

// ── Section: Temple Projects (Map + Cards) ───────────────────────────────────

function TempleProjectsSection() {
  const { temples, loading } = useTemples();

  const urgentTemples = [...temples]
    .filter((t) => t.status !== "consecrated" && t.fundraisingGoal > 0)
    .sort((a, b) => (a.fundraisingRaised / a.fundraisingGoal) - (b.fundraisingRaised / b.fundraisingGoal))
    .slice(0, 6);

  return (
    <motion.section id="projects" className="space-y-12 scroll-mt-24" variants={staggerContainer} initial="hidden" whileInView="visible" viewport={viewportOnce}>
      {/* Section header */}
      <motion.div variants={fadeInUp}>
        <p className="text-primary font-sans text-xs uppercase tracking-[0.2em] font-bold mb-3">Active Sites Worldwide</p>
        <h2 className="font-serif text-2xl sm:text-3xl font-black text-on-surface">Global Temple Projects</h2>
        <p className="text-sm text-on-surface-variant mt-1">{temples.length} sacred projects across multiple countries — track progress and donate directly.</p>
      </motion.div>

      {/* Global Map */}
      <motion.div variants={fadeIn}>
        {loading ? (
          <div className="w-full h-[440px] bg-[#0d1117] rounded-2xl animate-pulse flex items-center justify-center">
            <Globe className="w-12 h-12 text-white/20" />
          </div>
        ) : (
          <WorldMap temples={temples} />
        )}
      </motion.div>

      {/* Status legend + stats strip */}
      <div className="flex flex-wrap gap-4 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
        {Object.entries(STATUS_CFG).map(([key, c]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
            {key.charAt(0).toUpperCase() + key.slice(1)}
          </div>
        ))}
      </div>

      {/* Temple donation cards */}
      {!loading && (
        <motion.div variants={staggerContainer} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {urgentTemples.map((temple, idx) => {
            const donateUrl = temple.donateUrl || "https://www.iskcon.org/donate";
            const pct = temple.fundraisingGoal > 0 ? Math.round((temple.fundraisingRaised / temple.fundraisingGoal) * 100) : 0;
            const gap = Math.max(0, (temple.fundraisingGoal - temple.fundraisingRaised) / 1_000_000).toFixed(1);
            const c = STATUS_CFG[temple.status] ?? STATUS_CFG.planning!;

            return (
              <motion.div key={temple.id} variants={fadeInUp} className="bg-surface-container-low rounded-2xl overflow-hidden flex flex-col shadow-[0_4px_24px_rgba(27,28,28,0.06)] hover:-translate-y-1 transition-transform duration-300">
                <div className="bg-primary/8 px-6 pt-5 pb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: c.color }}>
                      {temple.status} · {Math.round(temple.constructionProgress)}%
                    </span>
                  </div>
                  <h3 className="font-serif text-lg font-bold text-on-surface leading-snug line-clamp-2">{temple.name}</h3>
                  <p className="text-xs text-on-surface-variant flex items-center gap-1 mt-1">
                    <MapPin className="w-3 h-3 shrink-0" />{temple.location}
                  </p>
                </div>
                <div className="px-6 py-5 flex-1 space-y-4">
                  <div>
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest mb-1.5">
                      <span className="text-on-surface-variant">Funded</span>
                      <span className="text-primary">{pct}%</span>
                    </div>
                    <div className="h-2 w-full bg-surface-container-high rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-xs text-on-surface-variant mt-1.5 font-medium">${gap}M still needed · led by <span className="font-bold text-on-surface">{temple.projectLead}</span></p>
                  </div>
                </div>
                <div className="px-6 pb-6">
                  <a href={donateUrl} target="_blank" rel="noopener noreferrer" className="block">
                    <button className="w-full py-3 bg-primary text-on-primary font-bold text-sm rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
                      <Heart className="w-4 h-4" /> Donate
                    </button>
                  </a>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </motion.section>
  );
}

// ── Section: Seva Opportunities ───────────────────────────────────────────────

type CurrencyKey = "INR" | "USD" | "GBP" | "AUD" | "KES";
const CURRENCY_SYMBOLS: Record<CurrencyKey, string> = { INR: "₹", USD: "$", GBP: "£", AUD: "A$", KES: "KSh" };
const EXCHANGE_RATES: Record<CurrencyKey, number> = { INR: 1, USD: 0.012, GBP: 0.0095, AUD: 0.018, KES: 1.55 };

function formatSevaAmount(baseINR: number, currency: CurrencyKey) {
  const val = Math.round(baseINR * EXCHANGE_RATES[currency]);
  return currency === "INR" ? `₹${baseINR.toLocaleString("en-IN")}` : `${CURRENCY_SYMBOLS[currency]}${val.toLocaleString("en-US")}`;
}

const SEVA_TIERS = [
  { emoji: "🪨", title: "Brick Donor", baseINR: 1000, desc: "Your name inscribed on a sacred brick in the temple walls.", color: "bg-amber-50/60 border-amber-200/60" },
  { emoji: "🏛️", title: "Pillar Supporter", baseINR: 11000, desc: "Contribute to the structural pillars of the divine sanctuary.", color: "bg-orange-50/60 border-orange-200/60" },
  { emoji: "🙏", title: "Altar Patron", baseINR: 51000, desc: "Fund the sacred altar adornments and deities' paraphernalia.", color: "bg-amber-50/80 border-amber-300/50" },
  { emoji: "🌸", title: "Mandala Guardian", baseINR: 100000, desc: "Sustain the entire sacred mandala of the construction.", color: "bg-orange-50/80 border-orange-300/50" },
  { emoji: "🕌", title: "Temple Benefactor", baseINR: 500000, desc: "The highest honour — permanently enshrined as a founding benefactor.", color: "bg-primary/8 border-primary/20" },
];

function SevaSection() {
  const [currency, setCurrency] = useState<CurrencyKey>("INR");

  return (
    <motion.section variants={staggerContainer} initial="hidden" whileInView="visible" viewport={viewportOnce} className="space-y-8">
      <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-primary font-sans text-xs uppercase tracking-[0.2em] font-bold mb-3">Participate in the Mission</p>
          <h2 className="font-serif text-2xl sm:text-3xl font-black text-on-surface">Seva Opportunities</h2>
        </div>
        <div className="flex items-center bg-surface-container-low rounded-xl p-1 shrink-0">
          {(Object.keys(CURRENCY_SYMBOLS) as CurrencyKey[]).map((key) => (
            <button key={key} onClick={() => setCurrency(key)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${currency === key ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:text-primary"}`}>{key}</button>
          ))}
        </div>
      </motion.div>
      <motion.div variants={staggerContainer} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {SEVA_TIERS.map((tier) => (
          <motion.div key={tier.title} variants={scaleIn} className={`rounded-2xl p-5 border flex flex-col gap-3 hover:-translate-y-1 transition-transform duration-300 ${tier.color}`}>
            <div className="text-3xl">{tier.emoji}</div>
            <div>
              <p className="font-serif font-bold text-on-surface text-base">{tier.title}</p>
              <p className="text-primary font-black text-lg mt-1">{formatSevaAmount(tier.baseINR, currency)}</p>
              <p className="text-[10px] text-on-surface-variant font-semibold">{currency !== "INR" ? formatSevaAmount(tier.baseINR, "INR") : formatSevaAmount(tier.baseINR, "USD")} approx.</p>
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed flex-1">{tier.desc}</p>
            <a href="https://www.iskcon.org/donate" target="_blank" rel="noopener noreferrer">
              <button className="w-full py-2 bg-primary/10 text-primary rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-primary hover:text-on-primary transition-colors">Choose Seva</button>
            </a>
          </motion.div>
        ))}
      </motion.div>
    </motion.section>
  );
}

// ── Section: About ISKCON ────────────────────────────────────────────────────

function AboutSection() {
  return (
    <motion.section id="about" className="space-y-16 scroll-mt-24" variants={staggerContainer} initial="hidden" whileInView="visible" viewport={viewportOnce}>
      {/* Hero banner */}
      <motion.div variants={fadeInUp} className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#5C3D1A] via-[#7A5025] to-[#4A2E12] text-white p-8 sm:p-12 md:p-16">
        <motion.p variants={fadeInUp} className="text-amber-200/80 font-sans text-xs uppercase tracking-[0.2em] font-bold mb-4">International Society for Krishna Consciousness</motion.p>
        <motion.h2 variants={fadeInUp} className="font-serif text-3xl sm:text-4xl md:text-5xl font-black leading-tight mb-6 max-w-3xl">Bringing Vedic Wisdom to Every Town & Village Since 1966</motion.h2>
        <motion.p variants={fadeInUp} className="text-white/80 text-base sm:text-lg leading-relaxed max-w-2xl">
          Founded by His Divine Grace A.C. Bhaktivedanta Swami Prabhupada in New York City,
          ISKCON has grown into a global spiritual movement with {ISKCON_STATS.totalCenters}+ centres
          across {ISKCON_STATS.countriesPresent}+ countries on {ISKCON_STATS.continents} continents.
        </motion.p>
      </motion.div>

      {/* Founding story */}
      <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
        <motion.div variants={fadeInUp}>
          <p className="text-primary font-sans text-xs uppercase tracking-[0.2em] font-bold mb-3">The Founding</p>
          <h3 className="font-serif text-2xl sm:text-3xl font-black text-on-surface leading-tight mb-5">A 70-Year-Old Sannyasi, a Cargo Ship, and a Vision</h3>
          <div className="space-y-4 text-on-surface-variant text-sm leading-relaxed">
            <p>In 1965, at the age of 69, Srila Prabhupada boarded the cargo ship Jaladuta with just 40 rupees. After a 35-day voyage across the Atlantic, he arrived in New York City with no money, no followers, and no institutional backing.</p>
            <p>On <strong className="text-on-surface">{ISKCON_STATS.founded}</strong>, in a small storefront at 26 Second Avenue in Manhattan, he formally incorporated ISKCON. In just 11 years he circled the globe 14 times, established 108 temples, and ignited a global revolution in consciousness.</p>
          </div>
        </motion.div>
        <motion.div variants={scaleIn}>
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-8 border border-amber-200/30">
            <div className="grid grid-cols-2 gap-6">
              {[
                { label: "Founded", value: "1966", sub: "New York City" },
                { label: "Temples by 1977", value: "108", sub: "11 years" },
                { label: "Books Written", value: "70+", sub: "Volumes" },
                { label: "Circumnavigations", value: "14", sub: "Of the globe" },
              ].map((item) => (
                <div key={item.label} className="text-center">
                  <p className="text-3xl font-black font-serif text-[#5C3D1A]">{item.value}</p>
                  <p className="text-xs font-bold uppercase tracking-wide text-[#7A5025] mt-1">{item.label}</p>
                  <p className="text-[10px] text-[#7A5025]/60 mt-0.5">{item.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* ISKCON by the numbers */}
      <div>
        <motion.div variants={fadeInUp} className="text-center mb-10">
          <p className="text-primary font-sans text-xs uppercase tracking-[0.2em] font-bold mb-3">ISKCON by the Numbers</p>
          <h3 className="font-serif text-2xl sm:text-3xl font-black text-on-surface">A Movement of Global Scale</h3>
        </motion.div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: <Building2 className="w-6 h-6" />, value: `${ISKCON_STATS.totalCenters}+`, label: "Centres Worldwide" },
            { icon: <Globe className="w-6 h-6" />, value: `${ISKCON_STATS.countriesPresent}+`, label: "Countries" },
            { icon: <Users className="w-6 h-6" />, value: "1M+", label: "Active Members" },
            { icon: <Utensils className="w-6 h-6" />, value: "2M+", label: "Free Meals Daily" },
            { icon: <BookOpen className="w-6 h-6" />, value: "500M+", label: "Books Distributed" },
            { icon: <Tv className="w-6 h-6" />, value: "108M+", label: "TV Households" },
            { icon: <Youtube className="w-6 h-6" />, value: "29.7M+", label: "YouTube Subscribers" },
            { icon: <MapPin className="w-6 h-6" />, value: `${ISKCON_STATS.continents}`, label: "Continents" },
          ].map((item) => (
            <motion.div key={item.label} variants={fadeInUp} className="bg-surface-container-low rounded-xl p-5 text-center border border-outline-variant/10 hover:border-primary/20 transition-colors">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mx-auto mb-3">{item.icon}</div>
              <p className="text-2xl sm:text-3xl font-black text-on-surface font-serif">{item.value}</p>
              <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold mt-1">{item.label}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Programs */}
      <div>
        <motion.div variants={fadeInUp} className="text-center mb-10">
          <p className="text-primary font-sans text-xs uppercase tracking-[0.2em] font-bold mb-3">Key Programs</p>
          <h3 className="font-serif text-2xl sm:text-3xl font-black text-on-surface">Serving Humanity, Nourishing the Soul</h3>
        </motion.div>
        <div className="grid sm:grid-cols-2 gap-6">
          {ISKCON_PROGRAMS.map((program, i) => {
            const icons = [<Utensils className="w-6 h-6" key="f" />, <GraduationCap className="w-6 h-6" key="a" />, <BookOpen className="w-6 h-6" key="b" />, <Users className="w-6 h-6" key="g" />];
            return (
              <motion.div key={program.name} variants={fadeInUp} className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/10">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">{icons[i]}</div>
                  <div>
                    <h4 className="font-serif text-lg font-bold text-on-surface mb-2">{program.name}</h4>
                    <p className="text-sm text-on-surface-variant leading-relaxed">{program.description}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.section>
  );
}

// ── Section: Global Directory ─────────────────────────────────────────────────

function RegionAccordion({ region }: { region: typeof ISKCON_REGIONS[number] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-outline-variant/10 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-5 bg-surface-container-low hover:bg-surface-container transition-colors text-left">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">{region.centers.length}</span>
          <h4 className="font-serif text-base sm:text-lg font-bold text-on-surface">{region.name}</h4>
        </div>
        <ChevronDown className={`w-5 h-5 text-on-surface-variant transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
            <div className="p-4 sm:p-5 grid gap-3">
              {region.centers.map((center) => (
                <div key={center.name} className="bg-surface rounded-lg p-4 border border-outline-variant/5">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <h5 className="font-bold text-sm text-on-surface">{center.name}</h5>
                      <p className="text-xs text-on-surface-variant mt-0.5"><MapPin className="w-3 h-3 inline mr-1 relative -top-px" />{center.city}, {center.country}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {center.website && <a href={center.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80"><ExternalLink className="w-4 h-4" /></a>}
                      {center.donateUrl && <a href={center.donateUrl} target="_blank" rel="noopener noreferrer" className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full font-bold hover:bg-primary/20">Donate</a>}
                    </div>
                  </div>
                  <p className="text-xs text-on-surface-variant leading-relaxed">{center.insight}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DirectorySection() {
  return (
    <motion.section id="directory" className="space-y-8 scroll-mt-24" variants={staggerContainer} initial="hidden" whileInView="visible" viewport={viewportOnce}>
      <motion.div variants={fadeInUp} className="text-center">
        <p className="text-primary font-sans text-xs uppercase tracking-[0.2em] font-bold mb-3">Global Directory</p>
        <h2 className="font-serif text-2xl sm:text-3xl font-black text-on-surface mb-2">{TOTAL_CATALOGUED} ISKCON Centres Catalogued</h2>
        <p className="text-sm text-on-surface-variant max-w-xl mx-auto">Browse ISKCON's presence across {ISKCON_REGIONS.length} regions worldwide. Each centre includes direct links to their website and donation portal.</p>
      </motion.div>
      <div className="space-y-3">
        {ISKCON_REGIONS.map((region) => (
          <RegionAccordion key={region.name} region={region} />
        ))}
      </div>
    </motion.section>
  );
}

// ── Section: Vision 2051 (Summary) ───────────────────────────────────────────

function VisionSection() {
  return (
    <motion.section id="vision" className="scroll-mt-24" variants={staggerContainer} initial="hidden" whileInView="visible" viewport={viewportOnce}>
      <motion.div variants={fadeInUp} className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] text-white p-8 sm:p-12 md:p-16">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <motion.p variants={fadeInUp} className="text-primary font-sans text-xs uppercase tracking-[0.2em] font-bold mb-4">Long-Range Blueprint</motion.p>
        <motion.h2 variants={fadeInUp} className="font-serif text-3xl sm:text-4xl md:text-5xl font-black leading-tight mb-6 max-w-3xl">
          Vision 2051: 211 Temples Across Every State in India
        </motion.h2>
        <motion.p variants={fadeInUp} className="text-white/80 text-base sm:text-lg leading-relaxed max-w-2xl mb-8">
          A bold 25-year roadmap to establish ISKCON temples in all 28 states and 8 Union Territories of India — covering 211 strategically chosen cities across educational corridors, commercial hubs, and pilgrimage circuits.
        </motion.p>
        <motion.div variants={fadeInUp} className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { value: "211", label: "Cities Targeted" },
            { value: "36", label: "States & UTs" },
            { value: "3", label: "Rollout Phases" },
            { value: "2051", label: "Target Year" },
          ].map((item) => (
            <div key={item.label} className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
              <p className="text-2xl sm:text-3xl font-black font-serif text-primary">{item.value}</p>
              <p className="text-[10px] uppercase tracking-widest font-bold text-white/50 mt-1">{item.label}</p>
            </div>
          ))}
        </motion.div>
        <motion.div variants={fadeInUp} className="space-y-3">
          {[
            { phase: "Phase 1 (2025–2033)", desc: "State capitals + top spiritual/commercial cities — 80 temples" },
            { phase: "Phase 2 (2033–2042)", desc: "District HQs, university towns, and emerging corridors — 75 temples" },
            { phase: "Phase 3 (2042–2051)", desc: "Remaining towns, border areas, and island territories — 56 temples" },
          ].map((p) => (
            <div key={p.phase} className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
              <div>
                <p className="text-sm font-bold text-white">{p.phase}</p>
                <p className="text-xs text-white/60">{p.desc}</p>
              </div>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </motion.section>
  );
}

// ── Section: Prabhupada Tribute ──────────────────────────────────────────────

function PrabhupadaTribute() {
  return (
    <motion.section variants={staggerContainer} initial="hidden" whileInView="visible" viewport={viewportOnce} className="relative overflow-hidden rounded-2xl bg-on-surface text-[#fbf9f8]">
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-0">
        <motion.div variants={fadeIn} className="relative h-72 lg:h-auto overflow-hidden lg:rounded-l-2xl">
          <img src="/prabhupada.jpg" alt="Srila Prabhupada" className="w-full h-full object-cover object-top" />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-on-surface/60 hidden lg:block" />
          <div className="absolute inset-0 bg-gradient-to-t from-on-surface/70 to-transparent lg:hidden" />
        </motion.div>
        <motion.div variants={staggerContainer} className="p-8 md:p-12 lg:p-14 flex flex-col justify-center gap-6">
          <motion.div variants={fadeInUp}>
            <span className="inline-block px-3 py-1 rounded-full border border-primary/50 text-primary text-[10px] font-bold uppercase tracking-widest">Founder-Acarya · ISKCON</span>
          </motion.div>
          <motion.div variants={fadeInUp}>
            <h2 className="font-serif text-3xl md:text-4xl font-bold leading-tight text-[#fbf9f8] mb-1">His Divine Grace</h2>
            <h2 className="font-serif text-3xl md:text-4xl font-bold leading-tight text-primary italic">A. C. Bhaktivedanta Swami Prabhupada</h2>
            <p className="text-sm text-white/50 font-medium mt-2">1 September 1896 — 14 November 1977</p>
          </motion.div>
          <motion.p variants={fadeInUp} className="text-white/75 text-base leading-relaxed max-w-2xl">
            At the age of 69 he sailed alone to New York and founded ISKCON in 1966. In eleven years he circled the globe fourteen times, established over 100 temples, and produced a prolific body of Vedic literature.
          </motion.p>
          <motion.blockquote variants={fadeInUp} className="border-l-2 border-primary pl-6 mt-2">
            <p className="font-serif text-lg italic text-white/90 leading-relaxed">"Our temples are not for making money. They are meant for the purpose of spreading Krishna consciousness."</p>
            <cite className="text-xs text-white/50 font-semibold uppercase tracking-widest mt-3 block not-italic">— Srila Prabhupada</cite>
          </motion.blockquote>
          <motion.div variants={fadeInUp} className="flex flex-wrap gap-3 pt-2">
            {[{ label: "Temples Founded", value: "108+" }, { label: "Translations", value: "80 languages" }, { label: "Books Distributed", value: "500M+" }, { label: "Disciples Initiated", value: "5,000+" }].map((stat) => (
              <div key={stat.label} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-center">
                <p className="text-primary font-bold text-base leading-none mb-1">{stat.value}</p>
                <p className="text-white/50 text-[10px] uppercase font-semibold tracking-widest">{stat.label}</p>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </motion.section>
  );
}

// ── Section: Social Proof Strip ──────────────────────────────────────────────

function SocialProofStrip() {
  return (
    <motion.section variants={staggerContainer} initial="hidden" whileInView="visible" viewport={viewportOnce} className="grid grid-cols-1 sm:grid-cols-3 gap-6">
      {[
        { icon: <Building2 className="w-5 h-5" />, value: "800+", label: "ISKCON Centres Worldwide" },
        { icon: <Globe className="w-5 h-5" />, value: "100+", label: "Countries on 6 Continents" },
        { icon: <Users className="w-5 h-5" />, value: "1M+", label: "Active Members Globally" },
      ].map((item) => (
        <motion.div key={item.label} variants={fadeInUp} className="bg-surface-container-low rounded-xl p-6 flex items-center gap-4 border border-outline-variant/10">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">{item.icon}</div>
          <div>
            <p className="text-2xl font-black text-on-surface font-serif">{item.value}</p>
            <p className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">{item.label}</p>
          </div>
        </motion.div>
      ))}
    </motion.section>
  );
}

// ── Section: Final CTA ───────────────────────────────────────────────────────

function CTASection() {
  return (
    <motion.section variants={staggerContainer} initial="hidden" whileInView="visible" viewport={viewportOnce} className="text-center">
      <motion.div variants={fadeInUp}>
        <h2 className="font-serif text-2xl sm:text-3xl font-black text-on-surface mb-4">Be Part of the Mission</h2>
        <p className="text-sm text-on-surface-variant max-w-lg mx-auto mb-8 leading-relaxed">Whether through volunteering, donating, or simply visiting a local temple, there are countless ways to participate in Srila Prabhupada's vision.</p>
      </motion.div>
      <motion.div variants={fadeInUp} className="flex flex-wrap justify-center gap-4">
        <a href="https://www.iskcon.org/donate" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-xl font-bold text-sm hover:bg-primary/90 transition-all active:scale-95">
          <Heart className="w-4 h-4" /> Donate to ISKCON
        </a>
        <a href="https://centres.iskcon.org" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 border-2 border-primary/30 text-primary px-6 py-3 rounded-xl font-bold text-sm hover:bg-primary/5 transition-all active:scale-95">
          <MapPin className="w-4 h-4" /> Find a Centre Near You
        </a>
      </motion.div>
    </motion.section>
  );
}

// ── Main Home Page ───────────────────────────────────────────────────────────

export default function Home() {
  const { data: apiStats } = useGetDashboardStats({
    query: { retry: 0, placeholderData: FALLBACK_STATS as any },
  });
  const stats = apiStats ?? FALLBACK_STATS;

  return (
    <Layout>
      <SEOHead
        title="Build Sacred Spaces Across the World"
        description="Track ISKCON's global temple construction, explore 84 centres across 10 regions, donate directly to projects, and discover the Vision 2051 roadmap for 211 temples across India."
        canonicalPath="/"
        structuredData={[
          { "@context": "https://schema.org", "@type": "Organization", name: "Build Iskcon", description: "Tracking ISKCON's global temple construction mission", url: typeof window !== "undefined" ? window.location.origin : "" },
          { "@context": "https://schema.org", "@type": "WebSite", name: "Build Iskcon", description: "Global ISKCON temple construction intelligence platform", url: typeof window !== "undefined" ? window.location.origin : "" },
        ]}
      />

      <div className="px-4 md:px-8 max-w-screen-2xl mx-auto space-y-20">
        <HeroSection stats={stats} />
        <KeyMetrics stats={stats} />
        <CountdownBanner />
        <TempleProjectsSection />
        <SevaSection />
        <SocialProofStrip />
        <AboutSection />
        <DirectorySection />
        <VisionSection />
        <PrabhupadaTribute />
        <CTASection />
      </div>
    </Layout>
  );
}
