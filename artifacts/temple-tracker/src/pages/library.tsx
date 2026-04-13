import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { fadeInUp, fadeIn } from "@/lib/animations";
import { BookOpen, ArrowRight, Loader2 } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

interface GitaProgress {
  lastProcessedPage: number;
  totalPagesProcessed: number;
  totalPagesInPdf: number;
  status: string;
}

// ── Book Card ──────────────────────────────────────────────────────────────

function BookCard({
  title,
  titleHi,
  description,
  status,
  href,
  coverGradient,
  symbol,
  delay,
}: {
  title: string;
  titleHi: string;
  description: string;
  status: string;
  href: string;
  coverGradient: string;
  symbol: string;
  delay: number;
}) {
  return (
    <motion.a
      href={href}
      variants={fadeInUp}
      custom={delay}
      className="group block rounded-2xl overflow-hidden border border-stone-200/60 bg-white shadow-sm hover:shadow-xl hover:border-orange-200/60 transition-all duration-300"
    >
      {/* Cover area */}
      <div
        className={`relative h-56 sm:h-64 flex items-center justify-center overflow-hidden ${coverGradient}`}
      >
        {/* Decorative symbol */}
        <span className="text-7xl sm:text-8xl opacity-20 select-none">{symbol}</span>
        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
        {/* Title on cover */}
        <div className="absolute bottom-0 left-0 right-0 px-5 pb-5">
          <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-1">
            {titleHi}
          </p>
          <h3 className="text-white font-serif text-xl sm:text-2xl font-bold leading-tight">
            {title}
          </h3>
        </div>
      </div>

      {/* Details */}
      <div className="px-5 py-4">
        <p className="text-sm text-stone-600 leading-relaxed mb-3">
          {description}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-stone-400 bg-stone-100 px-3 py-1 rounded-full">
            {status}
          </span>
          <span className="flex items-center gap-1 text-xs font-semibold text-orange-600 group-hover:text-orange-700 transition-colors">
            Read <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </span>
        </div>
      </div>
    </motion.a>
  );
}

// ── Main Library Page ──────────────────────────────────────────────────────

export default function Library() {
  const [gitaProgress, setGitaProgress] = useState<GitaProgress | null>(null);
  const [loadingGita, setLoadingGita] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/gita/progress");
        if (res.ok) {
          setGitaProgress(await res.json());
        }
      } catch {
        // API not available yet
      } finally {
        setLoadingGita(false);
      }
    })();
  }, []);

  const gitaStatus = loadingGita
    ? "Loading..."
    : gitaProgress
      ? `${gitaProgress.totalPagesProcessed.toLocaleString()} pages digitized`
      : "Coming soon";

  return (
    <Layout>
      <SEOHead
        title="Sacred Library -- Build ISKCON"
        description="Read Srila Prabhupada's translations of Srimad Bhagavatam and Bhagavad Gita As It Is in Hindi with BBT formatting."
        structuredData={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Sacred Library",
          description: "Digital library of Srila Prabhupada's translated Vedic literature.",
        }}
      />

      <div className="min-h-screen bg-gradient-to-b from-orange-50/40 via-white to-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          {/* Header */}
          <motion.div
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-2 bg-orange-100/60 text-orange-700 px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide mb-4">
              <BookOpen className="w-3.5 h-3.5" />
              Vedic Literature
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl font-bold text-stone-800 mb-3">
              Sacred Library
            </h1>
            <p className="text-stone-500 text-sm sm:text-base max-w-lg mx-auto leading-relaxed">
              Srila Prabhupada's Hindi translations with original Sanskrit shlokas,
              word-by-word meanings, translations, and purports — formatted in the BBT tradition.
            </p>
          </motion.div>

          {/* Book Grid */}
          <motion.div
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            className="grid sm:grid-cols-2 gap-6 sm:gap-8"
          >
            <BookCard
              title="Srimad Bhagavatam"
              titleHi="श्रीमद्भागवतम्"
              description="The ripened fruit of the Vedic tree — 12 cantos, 335 chapters, 18,000 verses covering creation, devotion, and the pastimes of Lord Krishna."
              status="10,419 pages digitized"
              href="/bhagwatham"
              coverGradient="bg-gradient-to-br from-amber-700 via-orange-800 to-red-900"
              symbol="ॐ"
              delay={0}
            />

            <BookCard
              title="Bhagavad Gita As It Is"
              titleHi="भगवद्गीता यथारूप"
              description="The song of God — 18 chapters, 700 verses. Lord Krishna's direct instructions to Arjuna on the battlefield of Kurukshetra."
              status={gitaStatus}
              href="/gita"
              coverGradient="bg-gradient-to-br from-indigo-800 via-blue-900 to-slate-900"
              symbol="गी"
              delay={1}
            />
          </motion.div>

          {/* Footer note */}
          <motion.p
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            className="text-center text-[11px] text-stone-400 mt-12 leading-relaxed max-w-md mx-auto"
          >
            All texts are from Srila A. C. Bhaktivedanta Swami Prabhupada's
            Hindi translations, published by the Bhaktivedanta Book Trust (BBT).
          </motion.p>
        </div>
      </div>
    </Layout>
  );
}
