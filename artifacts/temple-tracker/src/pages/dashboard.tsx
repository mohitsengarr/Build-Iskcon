import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { WorldMap } from "@/components/WorldMap";
import { useGetDashboardStats } from "@workspace/api-client-react";
import { fadeInUp, fadeIn, staggerContainer, scaleIn, viewportOnce } from "@/lib/animations";
import {
  Building2, IndianRupee, ChartBar, CheckCircle2, ArrowRight,
  Globe, RefreshCcw, Play, ExternalLink, Film, MapPin, Heart,
  Clock, BookOpen, ChevronRight, MessageCircle, Heart as HeartIcon,
  TrendingUp, RefreshCw, Zap,
} from "lucide-react";
import { Link } from "wouter";
import { BarChart, Bar, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { BLOGS } from "@/pages/blogs";
import { formatDistanceToNow } from "date-fns";

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");


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
  donateUrl: string | null;
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

// ── Global Site Map Section ───────────────────────────────────────────────────

const STATUS_CFG: Record<string, { color: string; bg: string }> = {
  planning:     { color: "#C49A6C", bg: "rgba(196,154,108,0.10)" },
  construction: { color: "#D4872E", bg: "rgba(212,135,46,0.10)" },
  finishing:    { color: "#9B6B2F", bg: "rgba(155,107,47,0.10)" },
  consecrated:  { color: "#6B8F3C", bg: "rgba(107,143,60,0.12)" },
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

// ── TOVP Countdown Banner ─────────────────────────────────────────────────────

function CountdownBanner() {
  const target = new Date("2027-11-02T00:00:00");
  const now = new Date();
  const totalMs = Math.max(0, target.getTime() - now.getTime());
  const totalDays = Math.floor(totalMs / (1000 * 60 * 60 * 24));
  const months = Math.floor(totalDays / 30);
  const remDays = totalDays % 30;

  return (
    <motion.section variants={fadeInUp} initial="hidden" animate="visible">
      <div className="relative overflow-hidden rounded-2xl px-6 sm:px-10 py-7 flex flex-col sm:flex-row items-center justify-between gap-6" style={{ background: "linear-gradient(135deg, #7A4520 0%, #A0612B 50%, #8B5E2F 100%)" }}>
        <div className="absolute -top-16 -right-16 w-64 h-64 bg-white/5 rounded-full blur-3xl pointer-events-none" />
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
            <Heart className="w-4 h-4" />
            Donate to TOVP
          </button>
        </a>
      </div>
    </motion.section>
  );
}

// ── Active Projects Donation Cards ────────────────────────────────────────────

function ActiveProjectsDonation() {
  const { temples, loading } = useTemples();

  const urgentTemples = [...temples]
    .filter((t) => t.status !== "consecrated" && t.fundraisingGoal > 0)
    .sort((a, b) => {
      const pctA = a.fundraisingRaised / a.fundraisingGoal;
      const pctB = b.fundraisingRaised / b.fundraisingGoal;
      return pctA - pctB;
    })
    .slice(0, 3);

  return (
    <motion.section
      variants={staggerContainer}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
      className="space-y-8"
    >
      <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row justify-between sm:items-end gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Heart className="w-4 h-4 text-primary" />
            </div>
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em]">Where Your Seva Is Needed Most</span>
          </div>
          <h2 className="font-serif text-2xl font-bold text-on-surface">Projects Calling for Support</h2>
          <p className="text-sm text-on-surface-variant mt-1">Each donation directly funds construction — scan the QR code or click Donate to give securely.</p>
        </div>
        <Link href="/temples" className="hidden sm:flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-widest hover:opacity-70 transition-opacity shrink-0">
          All Projects <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </motion.div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-80 bg-surface-container-low rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <motion.div variants={staggerContainer} className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {urgentTemples.map((temple, idx) => {
            const donateUrl = temple.donateUrl || "https://www.iskcon.org/donate";
            const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&bgcolor=FFFBF5&color=A0612B&data=${encodeURIComponent(donateUrl)}`;
            const pct = temple.fundraisingGoal > 0
              ? Math.round((temple.fundraisingRaised / temple.fundraisingGoal) * 100)
              : 0;
            const gap = Math.max(0, (temple.fundraisingGoal - temple.fundraisingRaised) / 1_000_000).toFixed(1);
            const urgencyLabels = ["Most Urgent", "Needs Seva", "Support Needed"];

            return (
              <motion.div
                key={temple.id}
                variants={fadeInUp}
                className="bg-surface-container-low rounded-2xl overflow-hidden flex flex-col shadow-[0_4px_24px_rgba(27,28,28,0.06)] hover:-translate-y-1 transition-transform duration-300"
              >
                {/* Header strip */}
                <div className="bg-primary/8 px-6 pt-5 pb-4">
                  <span className="inline-block text-[10px] font-bold uppercase tracking-widest text-primary bg-primary/10 px-2.5 py-1 rounded-full mb-3">
                    {urgencyLabels[idx]}
                  </span>
                  <h3 className="font-serif text-lg font-bold text-on-surface leading-snug line-clamp-2">{temple.name}</h3>
                  <p className="text-xs text-on-surface-variant flex items-center gap-1 mt-1">
                    <MapPin className="w-3 h-3 shrink-0" />
                    {temple.location}
                  </p>
                </div>

                {/* Body */}
                <div className="px-6 py-5 flex-1 space-y-4">
                  {/* Funding bar */}
                  <div>
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest mb-1.5">
                      <span className="text-on-surface-variant">Funded</span>
                      <span className="text-primary">{pct}%</span>
                    </div>
                    <div className="h-2 w-full bg-surface-container-high rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-xs text-on-surface-variant mt-1.5 font-medium">
                      ${gap}M still needed · led by <span className="font-bold text-on-surface">{temple.projectLead}</span>
                    </p>
                  </div>

                  {/* QR code */}
                  <div className="flex items-center gap-4 bg-surface-container rounded-xl p-4">
                    <img
                      src={qrSrc}
                      alt={`Donate QR for ${temple.name}`}
                      className="w-16 h-16 rounded-lg border border-outline-variant/20"
                    />
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Scan to Donate</p>
                      <p className="text-xs text-on-surface-variant leading-relaxed">Point your camera to give directly to this temple project.</p>
                    </div>
                  </div>
                </div>

                {/* CTA */}
                <div className="px-6 pb-6">
                  <a href={donateUrl} target="_blank" rel="noopener noreferrer" className="block">
                    <button className="w-full py-3 bg-primary text-on-primary font-bold text-sm rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
                      <Heart className="w-4 h-4" />
                      Donate to {temple.name.split(" ").slice(0, 3).join(" ")}
                    </button>
                  </a>
                  <Link href={`/temples/${temple.id}`}>
                    <button className="w-full mt-2 py-2.5 text-primary text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-primary/5 transition-colors">
                      View Full Project
                    </button>
                  </Link>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </motion.section>
  );
}

// ── Seva Opportunities ────────────────────────────────────────────────────────

const SEVA_TIERS = [
  {
    emoji: "🪨",
    title: "Brick Donor",
    amount: "₹1,000",
    amountUSD: "$12",
    desc: "Your name is inscribed on a sacred brick, permanently enshrined in the temple walls.",
    color: "bg-amber-50/60 border-amber-200/60",
  },
  {
    emoji: "🏛️",
    title: "Pillar Supporter",
    amount: "₹11,000",
    amountUSD: "$130",
    desc: "Contribute to the structural pillars that uphold the divine sanctuary.",
    color: "bg-orange-50/60 border-orange-200/60",
  },
  {
    emoji: "🙏",
    title: "Altar Patron",
    amount: "₹51,000",
    amountUSD: "$610",
    desc: "Fund the sacred altar adornments and the deities' paraphernalia.",
    color: "bg-amber-50/80 border-amber-300/50",
  },
  {
    emoji: "🌸",
    title: "Mandala Guardian",
    amount: "₹1,00,000",
    amountUSD: "$1,200",
    desc: "Your patronage sustains the entire sacred mandala of the construction.",
    color: "bg-orange-50/80 border-orange-300/50",
  },
  {
    emoji: "🕌",
    title: "Temple Benefactor",
    amount: "₹5,00,000",
    amountUSD: "$6,000",
    desc: "The highest honour — your name permanently enshrined as a founding benefactor.",
    color: "bg-primary/8 border-primary/20",
  },
];

function SevaOpportunities() {
  return (
    <motion.section
      variants={staggerContainer}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
      className="space-y-8"
    >
      <motion.div variants={fadeInUp}>
        <div className="flex items-center gap-3 mb-2">
          <span className="text-xl">🙏</span>
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em]">Participate in the Mission</span>
        </div>
        <h2 className="font-serif text-2xl font-bold text-on-surface">Seva Opportunities</h2>
        <p className="text-sm text-on-surface-variant mt-1 max-w-2xl">
          ISKCON follows the Vedic tradition of <em>seva</em> — sacred service. Every donation, however small, builds a temple and earns the blessing of the Lord.
        </p>
      </motion.div>

      <motion.div variants={staggerContainer} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {SEVA_TIERS.map((tier) => (
          <motion.div
            key={tier.title}
            variants={scaleIn}
            className={`rounded-2xl p-5 border flex flex-col gap-3 hover:-translate-y-1 transition-transform duration-300 ${tier.color}`}
          >
            <div className="text-3xl">{tier.emoji}</div>
            <div>
              <p className="font-serif font-bold text-on-surface text-base leading-snug">{tier.title}</p>
              <p className="text-primary font-black text-lg mt-1">{tier.amount}</p>
              <p className="text-[10px] text-on-surface-variant font-semibold">{tier.amountUSD} approx.</p>
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed flex-1">{tier.desc}</p>
            <a href="https://www.iskcon.org/donate" target="_blank" rel="noopener noreferrer">
              <button className="w-full mt-auto py-2 bg-primary/10 text-primary rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-primary hover:text-on-primary transition-colors">
                Choose Seva
              </button>
            </a>
          </motion.div>
        ))}
      </motion.div>
    </motion.section>
  );
}

// ── How to Give ───────────────────────────────────────────────────────────────

function HowToGive() {
  const steps = [
    {
      number: "01",
      title: "Choose Your Seva",
      desc: "Browse the seva tiers or select a specific temple project that resonates with your heart.",
      icon: "🔍",
    },
    {
      number: "02",
      title: "Scan or Click",
      desc: "Use the QR code for instant mobile giving, or click the Donate button for online payment.",
      icon: "📱",
    },
    {
      number: "03",
      title: "Receive Your Blessing",
      desc: "Your name is recorded in the temple register and a certificate of seva is sent from the project lead.",
      icon: "🌸",
    },
  ];

  return (
    <motion.section
      variants={staggerContainer}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
      className="relative overflow-hidden rounded-2xl bg-surface-container-low px-6 sm:px-12 py-12"
    >
      <div className="absolute -bottom-16 -right-16 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

      <motion.div variants={fadeInUp} className="mb-10 max-w-xl">
        <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mb-2">Simple & Secure</p>
        <h2 className="font-serif text-2xl font-bold text-on-surface">How to Give</h2>
        <p className="text-sm text-on-surface-variant mt-2">
          Every donation — large or small — is a brick in the temple of the Lord. Here is how to participate in this sacred mission.
        </p>
      </motion.div>

      <motion.div variants={staggerContainer} className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {steps.map((step) => (
          <motion.div key={step.number} variants={fadeInUp} className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <span className="text-3xl">{step.icon}</span>
              <span className="font-serif text-4xl font-black text-primary/20">{step.number}</span>
            </div>
            <div>
              <h3 className="font-serif text-lg font-bold text-on-surface mb-2">{step.title}</h3>
              <p className="text-sm text-on-surface-variant leading-relaxed">{step.desc}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      <motion.div variants={fadeInUp} className="mt-10 flex flex-col sm:flex-row gap-4">
        <a href="https://www.iskcon.org/donate" target="_blank" rel="noopener noreferrer">
          <button className="bg-primary text-on-primary px-8 py-3.5 rounded-xl font-bold text-sm tracking-wide hover:bg-primary/90 transition-colors flex items-center gap-2">
            <Heart className="w-4 h-4" />
            Donate Now
          </button>
        </a>
        <a href="https://tovp.org/donate/" target="_blank" rel="noopener noreferrer">
          <button className="border border-primary text-primary px-8 py-3.5 rounded-xl font-bold text-sm tracking-wide hover:bg-primary/5 transition-colors flex items-center gap-2">
            <ExternalLink className="w-4 h-4" />
            TOVP Donations
          </button>
        </a>
      </motion.div>
    </motion.section>
  );
}

// ── Blogs / Insights Preview ─────────────────────────────────────────────────

function BlogsPreview() {
  const categoryColors: Record<string, string> = {
    Architecture: "bg-primary/10 text-primary",
    Giving: "bg-secondary/10 text-secondary",
    Seva: "bg-amber-100/60 text-amber-800",
    Community: "bg-orange-100/50 text-orange-800",
    Philosophy: "bg-yellow-100/50 text-yellow-800",
    Vision: "bg-primary/8 text-primary",
  };

  return (
    <motion.section
      variants={staggerContainer}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
      className="space-y-8"
    >
      <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row justify-between sm:items-end gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-primary" />
            </div>
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em]">
              Knowledge & Insights
            </span>
          </div>
          <h2 className="font-serif text-2xl font-bold text-on-surface">Latest Articles</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            Explore temple architecture, devotion, community seva, and the vision for 2051.
          </p>
        </div>
      </motion.div>

      <motion.div variants={staggerContainer} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {BLOGS.map((blog) => (
          <motion.div key={blog.slug} variants={fadeInUp}>
            <Link href={`/blogs/${blog.slug}`}>
              <div className="group bg-surface-container-low rounded-xl p-6 hover:-translate-y-1 transition-all duration-300 cursor-pointer border border-outline-variant/10 h-full flex flex-col">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full ${categoryColors[blog.category] ?? "bg-surface-container text-on-surface-variant"}`}>
                    {blog.category}
                  </span>
                  <span className="text-[10px] text-on-surface-variant flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {blog.readTime} min
                  </span>
                </div>
                <h3 className="font-serif text-lg font-bold text-on-surface group-hover:text-primary transition-colors leading-snug mb-2 line-clamp-2">
                  {blog.title}
                </h3>
                <p className="text-xs text-on-surface-variant leading-relaxed line-clamp-3 flex-1">
                  {blog.subtitle}
                </p>
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-outline-variant/10">
                  <div className="text-[10px] text-on-surface-variant">
                    <span className="font-bold text-on-surface">{blog.author.split(" ")[0]}</span> · {blog.date}
                  </div>
                  <ChevronRight className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </motion.section>
  );
}

// ── Social Feed Preview ──────────────────────────────────────────────────────

interface FeedPostCompact {
  id: number;
  title: string;
  content: string;
  author: string;
  category: string;
  likes: number;
  hashtags: string | null;
  createdAt: string;
  templeId: number;
  templeName: string;
  templeLocation: string;
}

function SocialFeedPreview() {
  const [posts, setPosts] = useState<FeedPostCompact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BASE}/api/social/feed?limit=6`)
      .then((r) => r.json())
      .then((data) => { setPosts(data.posts?.slice(0, 6) ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function getInitials(name: string): string {
    const words = name.split(" ").filter((w: string) => w.length > 0);
    if (words.length === 1) return words[0]!.substring(0, 2).toUpperCase();
    return (words[0]![0]! + words[1]![0]!).toUpperCase();
  }

  const CATEGORY_COLORS: Record<string, string> = {
    construction: "bg-primary/80 text-on-primary",
    spiritual: "bg-secondary/80 text-on-secondary",
    fundraising: "bg-secondary-container/90 text-on-secondary-container",
    logistics: "bg-tertiary/80 text-on-tertiary",
    general: "bg-surface-container/90 text-on-surface-variant",
  };

  return (
    <motion.section
      variants={staggerContainer}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
      className="space-y-8"
    >
      <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row justify-between sm:items-end gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <MessageCircle className="w-4 h-4 text-primary" />
            </div>
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em]">
              Community Updates
            </span>
          </div>
          <h2 className="font-serif text-2xl font-bold text-on-surface">Social Feed</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            Latest updates from temple projects around the world.
          </p>
        </div>
      </motion.div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-36 bg-surface-container-low rounded-xl animate-pulse" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-surface-container-low rounded-xl p-12 text-center">
          <MessageCircle className="w-10 h-10 text-on-surface-variant mx-auto mb-4 opacity-40" />
          <p className="text-on-surface-variant text-sm">Social feed will appear after the next AI sync.</p>
        </div>
      ) : (
        <motion.div variants={staggerContainer} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {posts.map((post) => (
            <motion.div
              key={post.id}
              variants={fadeInUp}
              className="bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/10 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-primary to-secondary-container flex items-center justify-center flex-shrink-0">
                  <span className="text-on-primary font-bold text-xs font-serif">{getInitials(post.templeName)}</span>
                </div>
                <div className="min-w-0">
                  <Link href={`/temples/${post.templeId}`}>
                    <p className="text-sm font-bold text-on-surface hover:text-primary transition-colors cursor-pointer truncate">
                      {post.templeName.split(" ").slice(0, 3).join(" ")}
                    </p>
                  </Link>
                  <p className="text-[10px] text-on-surface-variant">
                    {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
                  </p>
                </div>
                <span className={`ml-auto text-[9px] font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0 ${CATEGORY_COLORS[post.category] ?? CATEGORY_COLORS.general}`}>
                  {post.category}
                </span>
              </div>
              <p className="text-sm text-on-surface leading-relaxed line-clamp-3 mb-2">{post.content}</p>
              {post.hashtags && <p className="text-xs text-primary font-medium truncate">{post.hashtags}</p>}
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-outline-variant/10 text-xs text-on-surface-variant">
                <span className="flex items-center gap-1"><Heart className="w-3 h-3" /> {post.likes}</span>
                <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" /> Reply</span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}
    </motion.section>
  );
}

// ── Regional Quick Stats ─────────────────────────────────────────────────────

function RegionalQuickStats() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BASE}/api/insights/regional`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const regionColor = (region: string): string => {
    const map: Record<string, string> = {
      "South Asia": "bg-primary", Africa: "bg-amber-700", Americas: "bg-amber-600",
      Oceania: "bg-yellow-700", Europe: "bg-secondary", "East Asia": "bg-orange-700",
    };
    return map[region] ?? "bg-on-surface-variant";
  };

  return (
    <motion.section
      variants={staggerContainer}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
      className="space-y-8"
    >
      <motion.div variants={fadeInUp}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-primary" />
          </div>
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em]">
            Regional Intelligence
          </span>
        </div>
        <h2 className="font-serif text-2xl font-bold text-on-surface">Global Regional Analysis</h2>
        <p className="text-sm text-on-surface-variant mt-1">
          Comparative analysis across continental zones — live from project data.
        </p>
      </motion.div>

      {/* KPI strip */}
      <motion.div variants={staggerContainer} className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-surface-container-low animate-pulse rounded-xl" />
          ))
        ) : data ? (
          [
            { label: "Total Projects", value: data.summary.totalProjects, sub: `${data.summary.constructionCount} under construction` },
            { label: "Total Capital", value: data.summary.totalInvestment, sub: `${data.summary.fundingPct}% funded` },
            { label: "Regions Active", value: data.summary.regionsActive, sub: `across continents` },
            { label: "In Planning", value: data.summary.planningCount, sub: "upcoming visions" },
          ].map((kpi) => (
            <motion.div key={kpi.label} variants={fadeInUp} className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/10">
              <p className="text-xs uppercase font-bold tracking-widest text-on-surface-variant mb-2">{kpi.label}</p>
              <p className="text-3xl font-bold font-serif text-on-surface">{String(kpi.value)}</p>
              <p className="text-xs text-on-surface-variant mt-1">{kpi.sub}</p>
            </motion.div>
          ))
        ) : null}
      </motion.div>

      {/* Projects per Region bars */}
      {data && (
        <motion.div variants={fadeInUp} className="bg-surface-container-low p-8 rounded-xl border border-outline-variant/10">
          <h3 className="text-xl font-bold font-serif text-on-surface mb-6">Projects per Region</h3>
          <div className="space-y-5">
            {data.projectsByRegion?.map((item: any) => {
              const maxCount = Math.max(...data.projectsByRegion.map((r: any) => r.count));
              return (
                <div key={item.region} className="space-y-2">
                  <div className="flex justify-between text-sm font-medium">
                    <span className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${regionColor(item.region)}`} />
                      {item.region}
                    </span>
                    <span className="text-primary font-bold">{item.count} {item.count === 1 ? "project" : "projects"}</span>
                  </div>
                  <div className="w-full h-6 bg-surface-container rounded-lg overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-primary-container transition-all duration-700"
                      style={{ width: `${(item.count / maxCount) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* AI Narratives */}
      {data && data.narratives?.length > 0 && (
        <motion.div variants={staggerContainer} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {data.narratives.slice(0, 2).map((n: any) => (
            <motion.div
              key={n.componentKey}
              variants={fadeInUp}
              className="bg-surface-container-low p-8 rounded-xl border border-outline-variant/10"
            >
              <div className="flex items-center justify-between mb-4">
                <Globe className="w-5 h-5 text-primary" />
                <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${
                  n.confidence === "High" ? "bg-primary/10 text-primary" : "bg-secondary/10 text-secondary"
                }`}>
                  {n.confidence} confidence
                </span>
              </div>
              <h3 className="text-lg font-bold font-serif text-primary leading-snug mb-3">{n.headline}</h3>
              <p className="text-sm text-on-surface-variant leading-relaxed mb-4">{n.summary}</p>
              <div className="pt-4 border-t border-outline-variant/20">
                <p className="text-[10px] uppercase font-bold tracking-widest text-on-surface-variant mb-1">Recommendation</p>
                <p className="text-sm font-medium text-on-surface">{n.recommendation}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}
    </motion.section>
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

  if (!stats) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4 px-4 text-center">
          <RefreshCcw className="w-12 h-12 text-on-surface-variant opacity-40" />
          <h2 className="font-serif text-2xl font-bold text-on-surface">Dashboard Unavailable</h2>
          <p className="text-on-surface-variant text-sm max-w-sm">
            Could not load dashboard data. The API may be temporarily unreachable.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 bg-primary text-on-primary px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-primary/90 transition-colors"
          >
            Retry
          </button>
        </div>
      </Layout>
    );
  }

  const templesByStatus = stats.templesByStatus ?? {};
  const barData = [
    { name: "Planning",     count: templesByStatus["planning"]     ?? 0 },
    { name: "Construction", count: templesByStatus["construction"] ?? 0 },
    { name: "Finishing",    count: templesByStatus["finishing"]    ?? 0 },
    { name: "Consecrated",  count: templesByStatus["consecrated"]  ?? 0 },
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

        {/* TOVP Countdown Banner */}
        <CountdownBanner />

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
              <span className="text-xs font-semibold text-primary uppercase tracking-widest">Global Projects</span>
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
              {stats && 'averageProgress' in stats ? Math.round((stats as any).averageProgress) : 65}%
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

        {/* Projects needing support + QR donation cards */}
        <ActiveProjectsDonation />

        {/* Regional Intelligence */}
        <RegionalQuickStats />

        {/* Social Feed */}
        <SocialFeedPreview />

        {/* Blog / Insights */}
        <BlogsPreview />

        {/* Seva Tiers */}
        <SevaOpportunities />

        {/* How to Give */}
        <HowToGive />

        {/* Divider: donor funnel above / leadership analytics below */}
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-outline-variant/30" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant px-3 py-1.5 rounded-full bg-surface-container-low whitespace-nowrap">
            For GBC &amp; Leadership
          </span>
          <div className="flex-1 h-px bg-outline-variant/30" />
        </div>

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
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-primary"></span> Projects</div>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barGap={2}>
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#6B5344", fontSize: 12, fontWeight: 600 }}
                    width={40}
                  />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#6B5344", fontSize: 12, fontWeight: 600 }}
                    dy={10}
                  />
                  <RechartsTooltip
                    cursor={{ fill: "rgba(27,28,28,0.04)" }}
                    contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 6px 24px rgba(27,28,28,0.06)" }}
                  />
                  <Bar dataKey="count" fill="var(--color-primary)" radius={[8, 8, 0, 0]} barSize={48} />
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
