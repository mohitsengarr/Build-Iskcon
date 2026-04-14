import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { WorldMap } from "@/components/WorldMap";
import { fadeInUp, fadeIn, staggerContainer, scaleIn, viewportOnce } from "@/lib/animations";
import {
  Building2, IndianRupee, ChartBar, CheckCircle2,
  Globe, MapPin, Heart, Users, ChevronDown, ExternalLink,
  BookOpen, Utensils, GraduationCap, Tv, Youtube,
  Shield, ArrowRight, Mail, Clock,
} from "lucide-react";
import {
  ISKCON_STATS, ISKCON_PROGRAMS, ISKCON_REGIONS, TOTAL_CATALOGUED,
} from "@/data/iskcon-centers";
import { TEMPLES, TEMPLE_STATS, fetchLiveTemples, computeStats, type Temple } from "@/data/temples";

// ── Constants ───────────────────────────────────────────────────────────────

const CANONICAL_DOMAIN = "https://buildiskcon.com";

const STATUS_CFG: Record<string, { color: string; bg: string; label: string }> = {
  planning:     { color: "#C49A6C", bg: "rgba(196,154,108,0.10)", label: "Planning" },
  construction: { color: "#D4872E", bg: "rgba(212,135,46,0.10)", label: "Construction" },
  finishing:    { color: "#9B6B2F", bg: "rgba(155,107,47,0.10)", label: "Finishing" },
  consecrated:  { color: "#6B8F3C", bg: "rgba(107,143,60,0.12)", label: "Consecrated" },
};

const stats = TEMPLE_STATS;
const totalNeeded = stats.totalFundraisingGoal - stats.totalFundraisingRaised;

// ── Structured Data (JSON-LD) ───────────────────────────────────────────────

const STRUCTURED_DATA_ORGANIZATION = {
  "@context": "https://schema.org", "@type": "Organization", "@id": `${CANONICAL_DOMAIN}/#organization`,
  name: "Build Iskcon", alternateName: "Build ISKCON — Global Temple Construction Intelligence",
  description: "An independent initiative tracking ISKCON's global temple construction projects, fundraising milestones, and sacred mission.",
  url: CANONICAL_DOMAIN, logo: `${CANONICAL_DOMAIN}/favicon.svg`, image: `${CANONICAL_DOMAIN}/opengraph.jpg`,
  sameAs: [], nonprofitStatus: "CommunityProject",
};

const STRUCTURED_DATA_WEBSITE = {
  "@context": "https://schema.org", "@type": "WebSite", "@id": `${CANONICAL_DOMAIN}/#website`,
  name: "Build Iskcon", description: "Track 47 active ISKCON temple construction projects across 15 countries.",
  url: CANONICAL_DOMAIN, publisher: { "@id": `${CANONICAL_DOMAIN}/#organization` }, inLanguage: "en",
};

const STRUCTURED_DATA_PERSON_PRABHUPADA = {
  "@context": "https://schema.org", "@type": "Person",
  name: "A. C. Bhaktivedanta Swami Prabhupada", alternateName: "Srila Prabhupada",
  description: "Founder-Acharya of ISKCON. Established 108 temples worldwide and translated over 70 volumes of Vedic literature.",
  birthDate: "1896-09-01", deathDate: "1977-11-14",
  birthPlace: { "@type": "Place", name: "Calcutta, British India" },
  jobTitle: "Founder-Acharya", affiliation: { "@type": "Organization", name: "ISKCON" },
  sameAs: ["https://en.wikipedia.org/wiki/A._C._Bhaktivedanta_Swami_Prabhupada", "https://www.wikidata.org/wiki/Q310149"],
};

const STRUCTURED_DATA_EVENT_TOVP = {
  "@context": "https://schema.org", "@type": "Event",
  name: "Temple of the Vedic Planetarium Grand Opening", startDate: "2027-11-02",
  eventStatus: "https://schema.org/EventScheduled",
  location: { "@type": "Place", name: "TOVP, Mayapur", address: { "@type": "PostalAddress", addressLocality: "Mayapur", addressRegion: "West Bengal", addressCountry: "IN" }, geo: { "@type": "GeoCoordinates", latitude: 23.423, longitude: 88.388 } },
  organizer: { "@type": "Organization", name: "TOVP Foundation", url: "https://tovp.org" },
};

const STRUCTURED_DATA_PLACES = TEMPLES.map((t) => ({
  "@context": "https://schema.org", "@type": "Place", name: t.name, description: t.description,
  address: { "@type": "PostalAddress", addressLocality: t.location },
  ...(t.latitude && t.longitude ? { geo: { "@type": "GeoCoordinates", latitude: t.latitude, longitude: t.longitude } } : {}),
}));

const FAQ_ITEMS = [
  { q: "Where does my donation go?", a: "Build Iskcon does NOT collect, process, or handle any donations. When you click 'Donate' on any project, you are redirected to that temple's official ISKCON donation page. Your money goes directly to the temple — we are simply the map that helps you find where to give." },
  { q: "Is Build Iskcon an official ISKCON website?", a: "No. Build Iskcon is an independent, community-driven transparency platform. All data is sourced from official ISKCON project communications. All donation links direct to verified, official ISKCON temple websites." },
  { q: "How is this site funded?", a: "Build Iskcon is a volunteer-driven initiative with no commercial revenue. The site is maintained as a seva (service) project to help devotees discover and support ISKCON temple construction worldwide." },
  { q: "How many ISKCON temples are currently under construction?", a: "As of 2026, Build Iskcon tracks 47 active ISKCON temple construction projects across 15 countries, including the flagship Temple of the Vedic Planetarium (TOVP) in Mayapur." },
  { q: "What is the Temple of the Vedic Planetarium (TOVP)?", a: "The TOVP is Srila Prabhupada's most cherished project — one of the largest religious structures being built globally. Located in Mayapur, West Bengal, it is 78% complete with a grand opening scheduled for November 2, 2027." },
  { q: "What is ISKCON's Vision 2051?", a: "Vision 2051 is a 25-year roadmap to establish 211 ISKCON temples across all 28 states and 8 Union Territories of India in 3 phases, starting 2025." },
  { q: "What are the seva (donation) tiers?", a: "Five tiers: Brick Donor (₹1,000), Pillar Supporter (₹11,000), Altar Patron (₹51,000), Mandala Guardian (₹1,00,000), and Temple Benefactor (₹5,00,000). All donations go directly to official ISKCON temple websites." },
  { q: "How can I donate to ISKCON temple construction?", a: "Browse the projects on this page, pick the temple that moves your heart, and click 'Donate.' You'll be redirected to the temple's official donation page where you can give securely." },
  { q: "When is the TOVP opening?", a: "The TOVP grand opening is scheduled for November 2, 2027. It is currently 78% complete and needs approximately $18M more to finish." },
  { q: "How many ISKCON centres exist worldwide?", a: "ISKCON has over 800 centres across 100+ countries on 6 continents. Build Iskcon catalogues 84 key centres across 10 regions." },
];

const STRUCTURED_DATA_FAQ = {
  "@context": "https://schema.org", "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })),
};

const STRUCTURED_DATA_SPEAKABLE = {
  "@context": "https://schema.org", "@type": "WebPage",
  name: "Build Iskcon — ISKCON Temple Construction Tracker",
  speakable: { "@type": "SpeakableSpecification", cssSelector: ["#hero h1", "#hero p", ".key-stats", "#faq"] },
  url: CANONICAL_DOMAIN,
};

// ── TOVP data ───────────────────────────────────────────────────────────────

const TOVP = TEMPLES.find((t) => t.id === 1)!;
const TOVP_TARGET = new Date("2027-11-02T00:00:00");
const TOVP_DAYS_LEFT = Math.max(0, Math.floor((TOVP_TARGET.getTime() - Date.now()) / 86400000));
const TOVP_NEEDED = Math.max(0, (TOVP.fundraisingGoal - TOVP.fundraisingRaised) / 1_000_000).toFixed(0);

// ── Section: Hero + TOVP Countdown (merged) ─────────────────────────────────

function HeroSection() {
  return (
    <section id="hero" className="space-y-0">
      {/* Hero banner */}
      <div className="relative rounded-t-xl overflow-hidden bg-surface-container-low min-h-[420px] sm:min-h-[460px] flex items-center py-10 sm:py-0">
        <div className="absolute inset-0 z-0">
          <img src={`${import.meta.env.BASE_URL}images/dashboard-hero.webp`} alt="Temple of the Vedic Planetarium (TOVP) under construction in Mayapur — ISKCON's largest temple project" className="w-full h-full object-cover object-center" loading="eager" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/85 to-surface/10 z-10" />
        <motion.div className="relative z-20 px-6 sm:px-12 max-w-xl" variants={staggerContainer} initial="hidden" animate="visible">
          <motion.h1 variants={fadeInUp} className="font-serif text-3xl sm:text-[2.75rem] font-bold text-on-surface leading-[1.15] mb-4">
            Help Build Sacred Temples<br />Across the World
          </motion.h1>
          <motion.p variants={fadeInUp} className="text-on-surface-variant font-sans text-[15px] mb-5 leading-relaxed">
            47 ISKCON temples are under construction in 15 countries right now. From the Temple of the Vedic Planetarium in Mayapur to new centres in Nairobi and Budapest — every donation brings Srila Prabhupada's vision closer to reality.
          </motion.p>
          <motion.figure variants={fadeInUp} className="mb-6 border-l-2 border-primary/40 pl-4">
            <blockquote className="font-serif text-base italic text-on-surface/80 leading-snug">
              pṛthivīte āche yata nagarādi grāma — sarvatra pracāra haibe mora nāma
            </blockquote>
            <figcaption className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/60 mt-1">
              — Chaitanya Mahaprabhu
              <span className="block text-[9px] mt-0.5 normal-case tracking-normal italic font-normal">"In every town and village, My name shall be heard."</span>
            </figcaption>
          </motion.figure>
          <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-3">
            <a href="https://tovp.org/donate/" target="_blank" rel="noopener noreferrer">
              <button className="bg-primary text-on-primary px-8 py-3.5 rounded-xl font-bold text-sm tracking-wide shadow-lg hover:shadow-primary/30 hover:bg-primary/90 transition-all active:scale-95 cursor-pointer w-full sm:w-auto flex items-center gap-2">
                <Heart className="w-4 h-4" /> Donate to TOVP
              </button>
            </a>
            <a href="#projects" onClick={(e) => { e.preventDefault(); document.querySelector("#projects")?.scrollIntoView({ behavior: "smooth" }); }}>
              <button className="border-2 border-primary/40 text-primary px-8 py-3.5 rounded-xl font-bold text-sm tracking-wide hover:bg-primary/5 transition-all active:scale-95 text-center w-full sm:w-auto cursor-pointer flex items-center gap-2">
                Explore All 41 Projects <ArrowRight className="w-4 h-4" />
              </button>
            </a>
          </motion.div>
        </motion.div>
      </div>

      {/* TOVP Countdown — integrated directly below hero, no gap */}
      <div className="relative overflow-hidden rounded-b-xl px-6 sm:px-10 py-6 flex flex-col sm:flex-row items-center justify-between gap-5" style={{ background: "linear-gradient(135deg, #7A4520 0%, #A0612B 50%, #8B5E2F 100%)" }}>
        <div className="relative z-10 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-on-primary/70 mb-1">Grand Opening · November 2, 2027</p>
          <h2 className="font-serif text-xl sm:text-2xl font-bold leading-tight">TOVP Mayapur — 78% Complete, ${TOVP_NEEDED}M Still Needed</h2>
          <p className="text-sm text-on-primary/80 mt-1">The crown jewel of ISKCON's global mission opens in {TOVP_DAYS_LEFT} days.</p>
        </div>
        <div className="relative z-10 flex gap-5 text-center shrink-0">
          {[{ val: Math.floor(TOVP_DAYS_LEFT / 30), label: "Months" }, { val: TOVP_DAYS_LEFT % 30, label: "Days" }, { val: TOVP_DAYS_LEFT, label: "Total" }].map(({ val, label }) => (
            <div key={label} className="flex flex-col items-center">
              <span className="font-serif text-3xl sm:text-4xl font-black tabular-nums">{val}</span>
              <span className="text-[10px] uppercase tracking-widest font-bold text-on-primary/70 mt-0.5">{label}</span>
            </div>
          ))}
        </div>
        <a href="https://tovp.org/donate/" target="_blank" rel="noopener noreferrer" className="relative z-10 shrink-0">
          <button className="bg-on-primary text-primary px-6 py-3 rounded-xl font-bold text-sm tracking-wide hover:bg-on-primary/90 transition-colors whitespace-nowrap flex items-center gap-2">
            <Heart className="w-4 h-4" /> Donate to TOVP
          </button>
        </a>
      </div>
    </section>
  );
}

// ── Section: Key Metrics ─────────────────────────────────────────────────────

function KeyMetrics() {
  return (
    <motion.section aria-label="Key Statistics" className="key-stats grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6" variants={staggerContainer} initial="hidden" whileInView="visible" viewport={viewportOnce}>
      {[
        { icon: <Building2 className="w-5 h-5" />, label: "Temples Under Construction", value: stats.activeProjects, tag: "Active", tagColor: "text-primary" },
        { icon: <IndianRupee className="w-5 h-5" />, label: "Still Needed to Finish All", value: `$${(totalNeeded / 1_000_000).toFixed(0)}M`, tag: "Urgent", tagColor: "text-red-600" },
        { icon: <ChartBar className="w-5 h-5" />, label: "Average Progress", value: `${stats.averageProgress}%`, tag: "Growing", tagColor: "text-tertiary" },
        { icon: <CheckCircle2 className="w-5 h-5" />, label: "Nearly Complete", value: stats.templesByStatus?.finishing || 0, tag: "Almost There", tagColor: "text-green-700" },
      ].map((item) => (
        <motion.div key={item.label} variants={fadeInUp} className="bg-surface-container p-5 sm:p-6 rounded-xl transition-all hover:bg-surface-container-high">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">{item.icon}</div>
            <span className={`text-[10px] sm:text-xs font-semibold uppercase tracking-widest ${item.tagColor}`}>{item.tag}</span>
          </div>
          <h3 className="text-on-surface-variant text-[10px] sm:text-sm font-medium uppercase tracking-wide mb-1">{item.label}</h3>
          <div className="text-2xl sm:text-3xl font-black text-on-surface font-serif">{item.value}</div>
        </motion.div>
      ))}
    </motion.section>
  );
}

// ── Section: Trust / Transparency ────────────────────────────────────────────

function TrustSection() {
  return (
    <motion.section aria-label="Trust and Transparency" variants={fadeInUp} initial="hidden" whileInView="visible" viewport={viewportOnce}>
      <div className="bg-green-50/60 border border-green-200/40 rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row gap-6 items-start">
        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-green-700 shrink-0">
          <Shield className="w-6 h-6" />
        </div>
        <div className="space-y-3">
          <h2 className="font-serif text-xl sm:text-2xl font-black text-on-surface">Where Does My Donation Go?</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            <strong className="text-on-surface">Build Iskcon does not collect, process, or handle any donations.</strong> When you click "Donate" on any project, you are redirected to that temple's official ISKCON donation page. Your money goes directly to the temple project — we are simply the map that helps you find where to give.
          </p>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            All data is sourced from official ISKCON project communications and temple websites. Build Iskcon is a volunteer-driven seva (service) project with no commercial revenue.
          </p>
          <div className="flex flex-wrap gap-4 pt-1">
            {[
              { icon: <Shield className="w-4 h-4" />, text: "Zero funds handled by us" },
              { icon: <ExternalLink className="w-4 h-4" />, text: "Direct links to official ISKCON pages" },
              { icon: <Heart className="w-4 h-4" />, text: "100% volunteer-driven seva" },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-2 text-xs font-bold text-green-800">
                {item.icon} {item.text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.section>
  );
}

// ── Section: Featured Project ────────────────────────────────────────────────

function FeaturedProject() {
  const featured = TEMPLES.find((t) => t.id === 1)!; // TOVP
  const pct = Math.round((featured.fundraisingRaised / featured.fundraisingGoal) * 100);
  const gap = ((featured.fundraisingGoal - featured.fundraisingRaised) / 1_000_000).toFixed(0);

  return (
    <motion.section aria-label="Featured Project" variants={fadeInUp} initial="hidden" whileInView="visible" viewport={viewportOnce}>
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#2D1810] via-[#4A2E12] to-[#3D2212] text-white p-6 sm:p-10">
        <div className="absolute top-0 right-0 w-72 h-72 bg-primary/15 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 grid md:grid-cols-[1fr_auto] gap-8 items-center">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 bg-amber-500/20 border border-amber-400/30 rounded-full text-amber-300 text-[10px] font-bold uppercase tracking-widest">Most Urgent · Featured Project</span>
              <span className="px-3 py-1 bg-white/10 rounded-full text-white/70 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5">
                <Clock className="w-3 h-3" /> {TOVP_DAYS_LEFT} days to opening
              </span>
            </div>
            <h2 className="font-serif text-2xl sm:text-3xl font-black leading-tight">{featured.name}</h2>
            <p className="text-white/70 text-sm leading-relaxed max-w-lg">{featured.description}</p>
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                <span className="text-white/60">Funded</span>
                <span className="text-primary">{pct}% — ${gap}M still needed</span>
              </div>
              <div className="h-3 w-full bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-primary to-amber-400 rounded-full" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="flex flex-wrap gap-3 pt-2">
              <a href="https://tovp.org/donate/" target="_blank" rel="noopener noreferrer">
                <button className="bg-primary text-on-primary px-6 py-3 rounded-xl font-bold text-sm hover:bg-primary/90 transition-all active:scale-95 flex items-center gap-2">
                  <Heart className="w-4 h-4" /> Donate to TOVP
                </button>
              </a>
              <a href="https://tovp.org" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-white/60 hover:text-white text-sm font-medium transition-colors px-4">
                Learn more <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
          <div className="hidden md:flex flex-col items-center gap-2 text-center">
            <div className="text-6xl font-black font-serif text-primary">{pct}%</div>
            <div className="text-xs uppercase tracking-widest font-bold text-white/50">Complete</div>
            <div className="text-sm font-bold text-primary mt-2">${(featured.fundraisingRaised / 1_000_000).toFixed(0)}M raised</div>
            <div className="text-xs text-white/40">of ${(featured.fundraisingGoal / 1_000_000).toFixed(0)}M goal</div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

// ── Section: Temple Projects ─────────────────────────────────────────────────

function TempleProjectsSection() {
  const [temples, setTemples] = useState<Temple[]>(TEMPLES);
  useEffect(() => { fetchLiveTemples().then(setTemples); }, []);
  const liveStats = computeStats(temples);
  const liveTotalNeeded = liveStats.totalFundraisingGoal - liveStats.totalFundraisingRaised;
  const countries = new Set(temples.map(t => { const parts = t.location.split(","); return parts[parts.length - 1]?.trim(); }).filter(Boolean));
  const urgentTemples = [...temples]
    .filter((t) => t.id !== 1 && t.status !== "consecrated" && t.fundraisingGoal > 0) // exclude TOVP (shown as featured)
    .sort((a, b) => (b.constructionProgress) - (a.constructionProgress))
    .slice(0, 6);

  return (
    <motion.section id="projects" className="space-y-10 scroll-mt-24" variants={staggerContainer} initial="hidden" whileInView="visible" viewport={viewportOnce}>
      <motion.div variants={fadeInUp}>
        <p className="text-primary font-sans text-xs uppercase tracking-[0.2em] font-bold mb-3">Active Sites Worldwide</p>
        <h2 className="font-serif text-2xl sm:text-3xl font-black text-on-surface">How Many ISKCON Temples Are Under Construction?</h2>
        <p className="text-sm text-on-surface-variant mt-2 max-w-2xl">{temples.length} sacred projects across {countries.size} countries need your support. ${(liveTotalNeeded / 1_000_000).toFixed(0)}M is still needed to complete them all. Pick the one that moves your heart — every rupee counts.</p>
      </motion.div>

      {/* Global Map */}
      <motion.div variants={fadeIn}>
        <WorldMap temples={temples} />
      </motion.div>

      {/* Status legend */}
      <div className="flex flex-wrap gap-4 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
        {Object.entries(STATUS_CFG).map(([key, c]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
            {c.label}
          </div>
        ))}
      </div>

      {/* Static HTML table for SEO */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse" aria-label="ISKCON Temple Construction Projects">
          <caption className="sr-only">All 47 active ISKCON temple construction projects with status, funding progress, and lead organization</caption>
          <thead>
            <tr className="border-b border-outline-variant/20 text-xs uppercase tracking-widest text-on-surface-variant">
              <th className="py-3 pr-4 font-bold">Temple</th>
              <th className="py-3 pr-4 font-bold hidden sm:table-cell">Location</th>
              <th className="py-3 pr-4 font-bold">Status</th>
              <th className="py-3 pr-4 font-bold text-right">Funded</th>
              <th className="py-3 pr-4 font-bold text-right hidden sm:table-cell">Needed</th>
              <th className="py-3 font-bold text-center">Donate</th>
            </tr>
          </thead>
          <tbody>
            {temples.map((t) => {
              const pct = t.fundraisingGoal > 0 ? Math.round((t.fundraisingRaised / t.fundraisingGoal) * 100) : 0;
              const gap = Math.max(0, (t.fundraisingGoal - t.fundraisingRaised) / 1_000_000).toFixed(1);
              return (
                <tr key={t.id} className="border-b border-outline-variant/10 hover:bg-surface-container-low/50 transition-colors">
                  <td className="py-3 pr-4 font-semibold text-on-surface text-xs sm:text-sm">{t.name}</td>
                  <td className="py-3 pr-4 text-on-surface-variant hidden sm:table-cell">{t.location}</td>
                  <td className="py-3 pr-4">
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span className="w-2 h-2 rounded-full" style={{ background: (STATUS_CFG[t.status] ?? STATUS_CFG.planning).color }} />
                      <span className="capitalize">{t.status}</span>
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-right font-bold text-primary text-xs sm:text-sm">{pct}%</td>
                  <td className="py-3 pr-4 text-right text-on-surface-variant hidden sm:table-cell">${gap}M</td>
                  <td className="py-3 text-center">
                    <a href={t.donateUrl || "https://tovp.org/donate/"} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-primary/80 transition-colors">
                      <Heart className="w-3 h-3" /> Give
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Temple donation cards with pre-set amounts */}
      <div>
        <h3 className="font-serif text-xl font-bold text-on-surface mb-6">Projects That Need Your Help Most</h3>
        <motion.div variants={staggerContainer} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {urgentTemples.map((temple, idx) => {
            const donateUrl = temple.donateUrl || "https://tovp.org/donate/";
            const pct = temple.fundraisingGoal > 0 ? Math.round((temple.fundraisingRaised / temple.fundraisingGoal) * 100) : 0;
            const gap = Math.max(0, (temple.fundraisingGoal - temple.fundraisingRaised) / 1_000_000).toFixed(1);
            const c = STATUS_CFG[temple.status] ?? STATUS_CFG.planning;
            const isNearComplete = pct >= 70;

            return (
              <motion.article key={temple.id} variants={fadeInUp} className="bg-surface-container-low rounded-2xl overflow-hidden flex flex-col shadow-[0_4px_24px_rgba(27,28,28,0.06)] hover:-translate-y-1 transition-transform duration-300 relative">
                {isNearComplete && (
                  <div className="absolute top-3 right-3 z-10 px-2.5 py-1 bg-green-600 text-white text-[10px] font-bold uppercase tracking-widest rounded-full">Nearly There</div>
                )}
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

                  {/* Pre-set donation amounts */}
                  <div className="grid grid-cols-3 gap-2">
                    {["₹1,000", "₹11,000", "₹51,000"].map((amount) => (
                      <a key={amount} href={donateUrl} target="_blank" rel="noopener noreferrer" className="block">
                        <button className="w-full py-2 bg-primary/8 text-primary rounded-lg text-xs font-bold hover:bg-primary/15 transition-colors">{amount}</button>
                      </a>
                    ))}
                  </div>
                </div>
                <div className="px-6 pb-6">
                  <a href={donateUrl} target="_blank" rel="noopener noreferrer" className="block">
                    <button className="w-full py-3 bg-primary text-on-primary font-bold text-sm rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
                      <Heart className="w-4 h-4" /> Donate Any Amount
                    </button>
                  </a>
                  <p className="text-[10px] text-center text-on-surface-variant mt-2">You'll be redirected to {temple.projectLead}'s official page</p>
                </div>
              </motion.article>
            );
          })}
        </motion.div>
      </div>
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
  { emoji: "🪨", title: "Brick Donor", baseINR: 1000, desc: "Your name inscribed on a sacred brick in the temple walls.", color: "bg-amber-50/60 border-amber-200/60", popular: false },
  { emoji: "🏛️", title: "Pillar Supporter", baseINR: 11000, desc: "Contribute to the structural pillars of the divine sanctuary.", color: "bg-orange-50/60 border-orange-200/60", popular: false },
  { emoji: "🙏", title: "Altar Patron", baseINR: 51000, desc: "Fund the sacred altar adornments and deities' paraphernalia.", color: "bg-amber-50/80 border-amber-300/50", popular: true },
  { emoji: "🌸", title: "Mandala Guardian", baseINR: 100000, desc: "Sustain the entire sacred mandala of the construction.", color: "bg-orange-50/80 border-orange-300/50", popular: false },
  { emoji: "🕌", title: "Temple Benefactor", baseINR: 500000, desc: "The highest honour — permanently enshrined as a founding benefactor.", color: "bg-primary/8 border-primary/20", popular: false },
];

function SevaSection() {
  const [currency, setCurrency] = useState<CurrencyKey>("INR");

  return (
    <motion.section aria-label="Seva Opportunities" variants={staggerContainer} initial="hidden" whileInView="visible" viewport={viewportOnce} className="space-y-8">
      <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-primary font-sans text-xs uppercase tracking-[0.2em] font-bold mb-3">Every Amount Builds Something Sacred</p>
          <h2 className="font-serif text-2xl sm:text-3xl font-black text-on-surface">How Can I Donate to ISKCON Temple Construction?</h2>
          <p className="text-sm text-on-surface-variant mt-2 max-w-xl">Choose from 5 seva tiers. Every donation goes directly to official ISKCON temple websites — Build Iskcon never handles your funds.</p>
        </div>
        <div className="flex items-center bg-surface-container-low rounded-xl p-1 shrink-0">
          {(Object.keys(CURRENCY_SYMBOLS) as CurrencyKey[]).map((key) => (
            <button key={key} onClick={() => setCurrency(key)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${currency === key ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:text-primary"}`}>{key}</button>
          ))}
        </div>
      </motion.div>

      <motion.div variants={staggerContainer} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {SEVA_TIERS.map((tier) => (
          <motion.div key={tier.title} variants={scaleIn} className={`rounded-2xl p-5 border flex flex-col gap-3 hover:-translate-y-1 transition-transform duration-300 ${tier.color} relative`}>
            {tier.popular && (
              <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-primary text-on-primary text-[9px] font-bold uppercase tracking-widest rounded-b-lg">Most Popular</div>
            )}
            <div className="text-3xl">{tier.emoji}</div>
            <div>
              <p className="font-serif font-bold text-on-surface text-base">{tier.title}</p>
              <p className="text-primary font-black text-lg mt-1">{formatSevaAmount(tier.baseINR, currency)}</p>
              <p className="text-[10px] text-on-surface-variant font-semibold">{currency !== "INR" ? formatSevaAmount(tier.baseINR, "INR") : formatSevaAmount(tier.baseINR, "USD")} approx.</p>
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed flex-1">{tier.desc}</p>
            <a href="https://tovp.org/donate/" target="_blank" rel="noopener noreferrer">
              <button className="w-full py-2.5 bg-primary/10 text-primary rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-primary hover:text-on-primary transition-colors">
                Give {formatSevaAmount(tier.baseINR, currency)}
              </button>
            </a>
          </motion.div>
        ))}
      </motion.div>

      {/* Static table for featured snippets */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse" aria-label="ISKCON Seva Donation Tiers">
          <caption className="sr-only">ISKCON temple construction donation seva tiers with amounts in INR and USD</caption>
          <thead>
            <tr className="border-b border-outline-variant/20 text-xs uppercase tracking-widest text-on-surface-variant">
              <th className="py-3 pr-4 font-bold">Tier</th>
              <th className="py-3 pr-4 font-bold text-right">INR</th>
              <th className="py-3 pr-4 font-bold text-right">USD</th>
              <th className="py-3 font-bold">What You Get</th>
            </tr>
          </thead>
          <tbody>
            {SEVA_TIERS.map((tier) => (
              <tr key={tier.title} className="border-b border-outline-variant/10">
                <td className="py-3 pr-4 font-semibold text-on-surface">{tier.emoji} {tier.title}</td>
                <td className="py-3 pr-4 text-right font-bold text-primary">₹{tier.baseINR.toLocaleString("en-IN")}</td>
                <td className="py-3 pr-4 text-right text-on-surface-variant">${Math.round(tier.baseINR * 0.012).toLocaleString("en-US")}</td>
                <td className="py-3 text-on-surface-variant">{tier.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.section>
  );
}

// ── Section: About ISKCON ────────────────────────────────────────────────────

function AboutSection() {
  return (
    <motion.section id="about" className="space-y-16 scroll-mt-24" variants={staggerContainer} initial="hidden" whileInView="visible" viewport={viewportOnce}>
      <motion.div variants={fadeInUp} className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#5C3D1A] via-[#7A5025] to-[#4A2E12] text-white p-8 sm:p-12 md:p-16">
        <motion.p variants={fadeInUp} className="text-amber-200/80 font-sans text-xs uppercase tracking-[0.2em] font-bold mb-4">International Society for Krishna Consciousness</motion.p>
        <motion.h2 variants={fadeInUp} className="font-serif text-3xl sm:text-4xl md:text-5xl font-black leading-tight mb-6 max-w-3xl">What Is ISKCON and How Did It Begin?</motion.h2>
        <motion.p variants={fadeInUp} className="text-white/80 text-base sm:text-lg leading-relaxed max-w-2xl">
          ISKCON was founded on July 13, 1966, by Srila Prabhupada in New York City.
          Today it has grown into a global movement with {ISKCON_STATS.totalCenters}+ centres
          across {ISKCON_STATS.countriesPresent}+ countries on {ISKCON_STATS.continents} continents.
        </motion.p>
      </motion.div>

      {/* Founding story */}
      <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
        <motion.div variants={fadeInUp}>
          <p className="text-primary font-sans text-xs uppercase tracking-[0.2em] font-bold mb-3">The Founding</p>
          <h3 className="font-serif text-2xl sm:text-3xl font-black text-on-surface leading-tight mb-5">Who Founded ISKCON?</h3>
          <div className="space-y-4 text-on-surface-variant text-sm leading-relaxed">
            <p>In 1965, at age 69, Srila Prabhupada boarded the cargo ship Jaladuta with just 40 rupees. After a 35-day voyage, he arrived in New York with no money, no followers, and no backing.</p>
            <p>On <strong className="text-on-surface">{ISKCON_STATS.founded}</strong>, he formally incorporated ISKCON. In 11 years he circled the globe 14 times, established 108 temples, and ignited a global revolution in consciousness.</p>
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
          <h3 className="font-serif text-2xl sm:text-3xl font-black text-on-surface">How Big Is ISKCON Today?</h3>
          <p className="text-sm text-on-surface-variant mt-2 max-w-xl mx-auto">Over 800 centres, 100+ countries, 6 continents, 2M+ free meals daily.</p>
        </motion.div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: <Building2 className="w-6 h-6" />, value: `${ISKCON_STATS.totalCenters}+`, label: "Centres" },
            { icon: <Globe className="w-6 h-6" />, value: `${ISKCON_STATS.countriesPresent}+`, label: "Countries" },
            { icon: <Users className="w-6 h-6" />, value: "1M+", label: "Members" },
            { icon: <Utensils className="w-6 h-6" />, value: "2M+", label: "Meals Daily" },
            { icon: <BookOpen className="w-6 h-6" />, value: "500M+", label: "Books" },
            { icon: <Tv className="w-6 h-6" />, value: "108M+", label: "TV Homes" },
            { icon: <Youtube className="w-6 h-6" />, value: "29.7M+", label: "YouTube" },
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
          <h3 className="font-serif text-2xl sm:text-3xl font-black text-on-surface">What Programs Does ISKCON Run?</h3>
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

// ── Section: Global Directory ────────────────────────────────────────────────

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
        <h2 className="font-serif text-2xl sm:text-3xl font-black text-on-surface mb-2">Where Are ISKCON Centres Located?</h2>
        <p className="text-sm text-on-surface-variant max-w-xl mx-auto">{TOTAL_CATALOGUED} major centres across {ISKCON_REGIONS.length} regions. Find one near you.</p>
      </motion.div>
      <div className="space-y-3">
        {ISKCON_REGIONS.map((region) => (
          <RegionAccordion key={region.name} region={region} />
        ))}
      </div>
    </motion.section>
  );
}

// ── Section: Vision 2051 ─────────────────────────────────────────────────────

function VisionSection() {
  return (
    <motion.section id="vision" className="scroll-mt-24" variants={staggerContainer} initial="hidden" whileInView="visible" viewport={viewportOnce}>
      <motion.div variants={fadeInUp} className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] text-white p-8 sm:p-12 md:p-16">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <motion.p variants={fadeInUp} className="text-primary font-sans text-xs uppercase tracking-[0.2em] font-bold mb-4">Long-Range Blueprint</motion.p>
        <motion.h2 variants={fadeInUp} className="font-serif text-3xl sm:text-4xl md:text-5xl font-black leading-tight mb-4 max-w-3xl">What Is ISKCON's Vision 2051?</motion.h2>
        <motion.p variants={fadeInUp} className="text-white/90 text-base sm:text-lg leading-relaxed max-w-2xl mb-2 font-semibold">
          Vision 2051 is a 25-year roadmap to build 211 ISKCON temples across all 36 Indian states and union territories by 2051.
        </motion.p>
        <motion.p variants={fadeInUp} className="text-white/70 text-sm leading-relaxed max-w-2xl mb-8">
          211 cities. 3 phases. Educational corridors, commercial hubs, and pilgrimage circuits.
        </motion.p>
        <motion.div variants={fadeInUp} className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { value: "211", label: "Cities" },
            { value: "36", label: "States & UTs" },
            { value: "3", label: "Phases" },
            { value: "2051", label: "Target Year" },
          ].map((item) => (
            <div key={item.label} className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
              <p className="text-2xl sm:text-3xl font-black font-serif text-primary">{item.value}</p>
              <p className="text-[10px] uppercase tracking-widest font-bold text-white/50 mt-1">{item.label}</p>
            </div>
          ))}
        </motion.div>
        <motion.div variants={fadeInUp} className="space-y-3 mb-8">
          {[
            { phase: "Phase 1 (2025–2033)", desc: "State capitals + top spiritual/commercial cities — 80 temples" },
            { phase: "Phase 2 (2033–2042)", desc: "District HQs, university towns, emerging corridors — 75 temples" },
            { phase: "Phase 3 (2042–2051)", desc: "Remaining towns, border areas, island territories — 56 temples" },
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
        <motion.div variants={fadeInUp}>
          <a href="#projects" onClick={(e) => { e.preventDefault(); document.querySelector("#projects")?.scrollIntoView({ behavior: "smooth" }); }}>
            <button className="bg-primary text-on-primary px-6 py-3 rounded-xl font-bold text-sm hover:bg-primary/90 transition-all active:scale-95 flex items-center gap-2">
              The first 80 temples are being built now — support one <ArrowRight className="w-4 h-4" />
            </button>
          </a>
        </motion.div>
      </motion.div>
    </motion.section>
  );
}

// ── Section: Prabhupada Tribute + CTA ────────────────────────────────────────

function PrabhupadaTribute() {
  return (
    <motion.section aria-label="Srila Prabhupada" variants={staggerContainer} initial="hidden" whileInView="visible" viewport={viewportOnce} className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-on-surface text-[#fbf9f8]">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-0">
          <motion.div variants={fadeIn} className="relative h-72 lg:h-auto overflow-hidden lg:rounded-l-2xl">
            <img src="/prabhupada.jpg" alt="His Divine Grace A.C. Bhaktivedanta Swami Prabhupada, Founder-Acharya of ISKCON" className="w-full h-full object-cover object-top" />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent to-on-surface/60 hidden lg:block" />
            <div className="absolute inset-0 bg-gradient-to-t from-on-surface/70 to-transparent lg:hidden" />
          </motion.div>
          <motion.div variants={staggerContainer} className="p-8 md:p-12 lg:p-14 flex flex-col justify-center gap-5">
            <motion.div variants={fadeInUp}>
              <span className="inline-block px-3 py-1 rounded-full border border-primary/50 text-primary text-[10px] font-bold uppercase tracking-widest">Founder-Acarya · ISKCON</span>
            </motion.div>
            <motion.div variants={fadeInUp}>
              <h2 className="font-serif text-3xl md:text-4xl font-bold leading-tight text-[#fbf9f8] mb-1">His Divine Grace</h2>
              <h3 className="font-serif text-3xl md:text-4xl font-bold leading-tight text-primary italic">A. C. Bhaktivedanta Swami Prabhupada</h3>
              <p className="text-sm text-white/50 font-medium mt-2">1 September 1896 — 14 November 1977</p>
            </motion.div>
            <motion.p variants={fadeInUp} className="text-white/75 text-base leading-relaxed max-w-2xl">
              At age 69 he sailed alone to New York and founded ISKCON in 1966. In eleven years he circled the globe fourteen times, established over 100 temples, and produced a prolific body of Vedic literature translated into 80+ languages.
            </motion.p>
            <motion.blockquote variants={fadeInUp} className="border-l-2 border-primary pl-6">
              <p className="font-serif text-lg italic text-white/90 leading-relaxed">"Our temples are not for making money. They are meant for the purpose of spreading Krishna consciousness."</p>
              <cite className="text-xs text-white/50 font-semibold uppercase tracking-widest mt-3 block not-italic">— Srila Prabhupada</cite>
            </motion.blockquote>
            <motion.div variants={fadeInUp} className="flex flex-wrap gap-3">
              {[{ label: "Temples", value: "108+" }, { label: "Languages", value: "80+" }, { label: "Books", value: "500M+" }, { label: "Disciples", value: "5,000+" }].map((stat) => (
                <div key={stat.label} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-center">
                  <p className="text-primary font-bold text-base leading-none mb-1">{stat.value}</p>
                  <p className="text-white/50 text-[10px] uppercase font-semibold tracking-widest">{stat.label}</p>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* CTA after Prabhupada — emotional connection to donating */}
      <motion.div variants={fadeInUp} className="text-center bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-8 border border-amber-200/30">
        <h3 className="font-serif text-xl sm:text-2xl font-black text-[#5C3D1A] mb-3">Continue Srila Prabhupada's Mission</h3>
        <p className="text-sm text-[#7A5025]/80 max-w-lg mx-auto mb-5">Every temple built carries his vision forward. From the TOVP in Mayapur to new centres across the globe — your donation makes it real.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <a href="https://tovp.org/donate/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-xl font-bold text-sm hover:bg-primary/90 transition-all active:scale-95">
            <Heart className="w-4 h-4" /> Donate to TOVP
          </a>
          <a href="#projects" onClick={(e) => { e.preventDefault(); document.querySelector("#projects")?.scrollIntoView({ behavior: "smooth" }); }} className="inline-flex items-center gap-2 border-2 border-primary/30 text-primary px-6 py-3 rounded-xl font-bold text-sm hover:bg-primary/5 transition-all active:scale-95">
            Choose Another Temple <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </motion.div>
    </motion.section>
  );
}

// ── Section: Email Capture ───────────────────────────────────────────────────

function EmailCapture() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    try {
      const res = await fetch("https://etfmndcrchundvgtvmot.supabase.co/rest/v1/newsletter_subscribers", {
        method: "POST",
        headers: {
          apikey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0Zm1uZGNyY2h1bmR2Z3R2bW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc2NDE1MTIsImV4cCI6MjA2MzIxNzUxMn0.7GXS820xSFcUy2TRdbspN7s-NP3sgKFFtUP-Zw0Qbrs",
          Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0Zm1uZGNyY2h1bmR2Z3R2bW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc2NDE1MTIsImV4cCI6MjA2MzIxNzUxMn0.7GXS820xSFcUy2TRdbspN7s-NP3sgKFFtUP-Zw0Qbrs",
          "Content-Type": "application/json",
          Prefer: "return=minimal,resolution=ignore-duplicates",
        },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (res.ok || res.status === 201 || res.status === 409) {
        setStatus("success");
        setEmail("");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  return (
    <motion.section aria-label="Newsletter signup" variants={fadeInUp} initial="hidden" whileInView="visible" viewport={viewportOnce}>
      <div className="bg-surface-container rounded-2xl p-8 sm:p-10 text-center">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary mx-auto mb-4">
          <Mail className="w-7 h-7" />
        </div>
        <h2 className="font-serif text-2xl sm:text-3xl font-black text-on-surface mb-3">Get Monthly Temple Construction Updates</h2>
        <p className="text-sm text-on-surface-variant max-w-lg mx-auto mb-6 leading-relaxed">
          See how temples are progressing, which projects are near completion, and where your donations are making the most impact. One email per month — no spam, ever.
        </p>
        {status === "success" ? (
          <div className="max-w-md mx-auto bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-green-700">You're subscribed! Hare Krishna 🙏</p>
            <p className="text-xs text-green-600 mt-1">You'll receive monthly temple construction updates.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 px-4 py-3 rounded-xl border border-outline-variant/20 bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40"
              required
              disabled={status === "loading"}
            />
            <button type="submit" disabled={status === "loading"} className="bg-primary text-on-primary px-6 py-3 rounded-xl font-bold text-sm hover:bg-primary/90 transition-all active:scale-95 whitespace-nowrap flex items-center gap-2 justify-center disabled:opacity-60">
              <Mail className="w-4 h-4" /> {status === "loading" ? "Saving..." : "Subscribe"}
            </button>
          </form>
        )}
        {status === "error" && (
          <p className="text-xs text-red-600 mt-2">Something went wrong. Please try again.</p>
        )}
        <p className="text-[10px] text-on-surface-variant mt-3">Free. Unsubscribe anytime. We never share your email.</p>
      </div>
    </motion.section>
  );
}

// ── Section: FAQ ─────────────────────────────────────────────────────────────

function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0); // Trust FAQ open by default

  return (
    <motion.section id="faq" className="space-y-8 scroll-mt-24" variants={staggerContainer} initial="hidden" whileInView="visible" viewport={viewportOnce}>
      <motion.div variants={fadeInUp} className="text-center">
        <p className="text-primary font-sans text-xs uppercase tracking-[0.2em] font-bold mb-3">Frequently Asked Questions</p>
        <h2 className="font-serif text-2xl sm:text-3xl font-black text-on-surface mb-2">Common Questions About ISKCON Temple Construction</h2>
      </motion.div>
      <div className="space-y-3 max-w-3xl mx-auto">
        {FAQ_ITEMS.map((item, i) => (
          <motion.div key={i} variants={fadeInUp} className="border border-outline-variant/10 rounded-xl overflow-hidden">
            <button
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              className="w-full flex items-center justify-between p-5 bg-surface-container-low hover:bg-surface-container transition-colors text-left gap-4"
            >
              <h3 className="font-serif text-sm sm:text-base font-bold text-on-surface leading-snug">{item.q}</h3>
              <ChevronDown className={`w-5 h-5 text-on-surface-variant shrink-0 transition-transform duration-300 ${openIndex === i ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence>
              {openIndex === i && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
                  <p className="px-5 pb-5 text-sm text-on-surface-variant leading-relaxed">{item.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}

// ── Section: Final CTA ───────────────────────────────────────────────────────

function CTASection() {
  const nearComplete = TEMPLES.filter((t) => (t.fundraisingRaised / t.fundraisingGoal) >= 0.7 && t.status !== "consecrated");

  return (
    <motion.section aria-label="Final Call to Action" variants={staggerContainer} initial="hidden" whileInView="visible" viewport={viewportOnce} className="text-center">
      <motion.div variants={fadeInUp}>
        <h2 className="font-serif text-2xl sm:text-3xl font-black text-on-surface mb-4">
          {nearComplete.length} temples are almost complete. Your donation today could help finish them.
        </h2>
        <p className="text-sm text-on-surface-variant max-w-xl mx-auto mb-8 leading-relaxed">
          The TOVP in Mayapur needs ${TOVP_NEEDED}M in {TOVP_DAYS_LEFT} days.
          {nearComplete.length > 1 ? ` Plus ${nearComplete.length - 1} more projects are over 70% funded and accelerating.` : ""}
          {" "}Choose one and give today.
        </p>
      </motion.div>
      <motion.div variants={fadeInUp} className="flex flex-wrap justify-center gap-4">
        <a href="https://tovp.org/donate/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-xl font-bold text-sm hover:bg-primary/90 transition-all active:scale-95">
          <Heart className="w-4 h-4" /> Donate to TOVP
        </a>
        <a href="#projects" onClick={(e) => { e.preventDefault(); document.querySelector("#projects")?.scrollIntoView({ behavior: "smooth" }); }} className="inline-flex items-center gap-2 border-2 border-primary/30 text-primary px-6 py-3 rounded-xl font-bold text-sm hover:bg-primary/5 transition-all active:scale-95">
          Explore All Projects <ArrowRight className="w-4 h-4" />
        </a>
        <a href="https://centres.iskcon.org" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 border-2 border-outline-variant/20 text-on-surface-variant px-6 py-3 rounded-xl font-bold text-sm hover:bg-surface-container transition-all active:scale-95">
          <MapPin className="w-4 h-4" /> Find a Centre Near You
        </a>
      </motion.div>
    </motion.section>
  );
}

// ── Main Home Page ───────────────────────────────────────────────────────────

export default function Home() {
  return (
    <Layout>
      <SEOHead
        title="Track 47 Active ISKCON Temple Construction Projects Worldwide"
        description="Help build 47 ISKCON temples across 15 countries. The TOVP in Mayapur opens in 2027. Explore projects, donate directly to official ISKCON pages, and discover Vision 2051."
        canonicalPath="/"
        structuredData={[
          STRUCTURED_DATA_ORGANIZATION,
          STRUCTURED_DATA_WEBSITE,
          STRUCTURED_DATA_PERSON_PRABHUPADA,
          STRUCTURED_DATA_EVENT_TOVP,
          STRUCTURED_DATA_FAQ,
          STRUCTURED_DATA_SPEAKABLE,
          ...STRUCTURED_DATA_PLACES,
        ]}
      />

      <div className="px-4 md:px-8 max-w-screen-2xl mx-auto space-y-16 sm:space-y-20">
        <HeroSection />
        <KeyMetrics />
        <TrustSection />
        <FeaturedProject />
        <TempleProjectsSection />
        <SevaSection />
        <AboutSection />
        <DirectorySection />
        <VisionSection />
        <PrabhupadaTribute />
        <EmailCapture />
        <FAQSection />
        <CTASection />
      </div>
    </Layout>
  );
}
