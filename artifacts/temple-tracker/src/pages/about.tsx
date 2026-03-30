import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { fadeInUp, staggerContainer, scaleIn, viewportOnce } from "@/lib/animations";
import {
  Globe, BookOpen, Heart, Users, Building2, ChevronDown,
  ExternalLink, MapPin, Utensils, GraduationCap, Tv, Youtube,
} from "lucide-react";
import { Link } from "wouter";
import {
  ISKCON_STATS,
  ISKCON_PROGRAMS,
  ISKCON_REGIONS,
  TOTAL_CATALOGUED,
} from "@/data/iskcon-centers";

// ── Hero Section ─────────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <motion.section
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#5C3D1A] via-[#7A5025] to-[#4A2E12] text-white p-8 sm:p-12 md:p-16"
    >
      {/* Background ornamentation */}
      <div className="absolute inset-0 opacity-[0.04]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='30' cy='30' r='6' fill='%23fff'/%3E%3C/svg%3E")`,
        backgroundSize: "60px 60px",
      }} />

      <motion.p variants={fadeInUp} className="text-amber-200/80 font-sans text-xs uppercase tracking-[0.2em] font-bold mb-4">
        International Society for Krishna Consciousness
      </motion.p>

      <motion.h1 variants={fadeInUp} className="font-serif text-3xl sm:text-4xl md:text-5xl font-black leading-tight mb-6 max-w-3xl">
        Bringing Vedic Wisdom to Every Town & Village Since 1966
      </motion.h1>

      <motion.p variants={fadeInUp} className="text-white/80 text-base sm:text-lg leading-relaxed max-w-2xl mb-8">
        Founded by His Divine Grace A.C. Bhaktivedanta Swami Prabhupada in New York City,
        ISKCON has grown into a global spiritual movement with {ISKCON_STATS.totalCenters}+ centres
        across {ISKCON_STATS.countriesPresent}+ countries on {ISKCON_STATS.continents} continents.
      </motion.p>

      <motion.div variants={fadeInUp} className="flex flex-wrap gap-3">
        <Link
          href="/temples"
          className="inline-flex items-center gap-2 bg-white text-[#5C3D1A] px-6 py-3 rounded-xl font-bold text-sm hover:bg-white/90 transition-all active:scale-95"
        >
          <Building2 className="w-4 h-4" />
          Explore Temples
        </Link>
        <a
          href="https://www.iskcon.org"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 border-2 border-white/30 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-white/10 transition-all active:scale-95"
        >
          <Globe className="w-4 h-4" />
          Visit ISKCON.org
        </a>
      </motion.div>
    </motion.section>
  );
}

// ── Founding Story Section ───────────────────────────────────────────────────

function FoundingStorySection() {
  return (
    <motion.section
      variants={staggerContainer}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
      className="grid md:grid-cols-2 gap-8 md:gap-12 items-center"
    >
      <motion.div variants={fadeInUp}>
        <p className="text-primary font-sans text-xs uppercase tracking-[0.2em] font-bold mb-3">
          The Founding
        </p>
        <h2 className="font-serif text-2xl sm:text-3xl font-black text-on-surface leading-tight mb-5">
          A 70-Year-Old Sannyasi, a Cargo Ship, and a Vision
        </h2>
        <div className="space-y-4 text-on-surface-variant text-sm leading-relaxed">
          <p>
            In 1965, at the age of 69, Srila Prabhupada boarded the cargo ship Jaladuta with just
            40 rupees and a trunk of translated Srimad-Bhagavatam volumes. After a 35-day voyage
            across the Atlantic, he arrived in New York City with no money, no followers, and no
            institutional backing.
          </p>
          <p>
            On <strong className="text-on-surface">{ISKCON_STATS.founded}</strong>, in a small storefront at 26 Second Avenue
            in Manhattan's Lower East Side, Srila Prabhupada formally incorporated the International
            Society for Krishna Consciousness. What began with a handful of seekers would become one of
            the most significant spiritual movements of the modern era.
          </p>
          <p>
            In just 11 years before his passing in 1977, Prabhupada circled the globe 14 times,
            established 108 temples, initiated over 5,000 disciples, authored over 70 volumes of
            translations and commentary, and ignited a global revolution in consciousness.
          </p>
        </div>
      </motion.div>

      <motion.div variants={scaleIn} className="relative">
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
    </motion.section>
  );
}

// ── Key Metrics Grid ─────────────────────────────────────────────────────────

function MetricsGrid() {
  const metrics = [
    { icon: <Building2 className="w-6 h-6" />, value: `${ISKCON_STATS.totalCenters}+`, label: "Centres Worldwide" },
    { icon: <Globe className="w-6 h-6" />, value: `${ISKCON_STATS.countriesPresent}+`, label: "Countries" },
    { icon: <Users className="w-6 h-6" />, value: "1M+", label: "Active Members" },
    { icon: <Utensils className="w-6 h-6" />, value: "2M+", label: "Free Meals Daily" },
    { icon: <BookOpen className="w-6 h-6" />, value: "500M+", label: "Books Distributed" },
    { icon: <Tv className="w-6 h-6" />, value: "108M+", label: "TV Households" },
    { icon: <Youtube className="w-6 h-6" />, value: "29.7M+", label: "YouTube Subscribers" },
    { icon: <MapPin className="w-6 h-6" />, value: `${ISKCON_STATS.continents}`, label: "Continents" },
  ];

  return (
    <motion.section
      variants={staggerContainer}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
    >
      <motion.div variants={fadeInUp} className="text-center mb-10">
        <p className="text-primary font-sans text-xs uppercase tracking-[0.2em] font-bold mb-3">
          ISKCON by the Numbers
        </p>
        <h2 className="font-serif text-2xl sm:text-3xl font-black text-on-surface">
          A Movement of Global Scale
        </h2>
      </motion.div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {metrics.map((item) => (
          <motion.div
            key={item.label}
            variants={fadeInUp}
            className="bg-surface-container-low rounded-xl p-5 text-center border border-outline-variant/10 hover:border-primary/20 transition-colors"
          >
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mx-auto mb-3">
              {item.icon}
            </div>
            <p className="text-2xl sm:text-3xl font-black text-on-surface font-serif">{item.value}</p>
            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold mt-1">{item.label}</p>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}

// ── Programs Section ─────────────────────────────────────────────────────────

function ProgramsSection() {
  const icons = [
    <Utensils className="w-6 h-6" key="food" />,
    <GraduationCap className="w-6 h-6" key="akshaya" />,
    <BookOpen className="w-6 h-6" key="books" />,
    <Users className="w-6 h-6" key="gurukula" />,
  ];

  return (
    <motion.section
      variants={staggerContainer}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
    >
      <motion.div variants={fadeInUp} className="text-center mb-10">
        <p className="text-primary font-sans text-xs uppercase tracking-[0.2em] font-bold mb-3">
          Key Programs
        </p>
        <h2 className="font-serif text-2xl sm:text-3xl font-black text-on-surface">
          Serving Humanity, Nourishing the Soul
        </h2>
      </motion.div>

      <div className="grid sm:grid-cols-2 gap-6">
        {ISKCON_PROGRAMS.map((program, i) => (
          <motion.div
            key={program.name}
            variants={fadeInUp}
            className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/10 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                {icons[i]}
              </div>
              <div>
                <h3 className="font-serif text-lg font-bold text-on-surface mb-2">{program.name}</h3>
                <p className="text-sm text-on-surface-variant leading-relaxed">{program.description}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}

// ── Global Directory (Region Accordion) ──────────────────────────────────────

function RegionAccordion({ region, index }: { region: typeof ISKCON_REGIONS[number]; index: number }) {
  const [open, setOpen] = useState(false);

  return (
    <motion.div variants={fadeInUp} className="border border-outline-variant/10 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 bg-surface-container-low hover:bg-surface-container transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
            {region.centers.length}
          </span>
          <h3 className="font-serif text-base sm:text-lg font-bold text-on-surface">{region.name}</h3>
        </div>
        <ChevronDown className={`w-5 h-5 text-on-surface-variant transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="p-4 sm:p-5 grid gap-3">
              {region.centers.map((center) => (
                <div
                  key={center.name}
                  className="bg-surface rounded-lg p-4 border border-outline-variant/5 hover:border-primary/15 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <h4 className="font-bold text-sm text-on-surface">{center.name}</h4>
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        <MapPin className="w-3 h-3 inline mr-1 relative -top-px" />
                        {center.city}, {center.country}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {center.website && (
                        <a
                          href={center.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:text-primary/80 transition-colors"
                          title="Visit website"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                      {center.donateUrl && (
                        <a
                          href={center.donateUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full font-bold hover:bg-primary/20 transition-colors"
                        >
                          Donate
                        </a>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-on-surface-variant leading-relaxed">{center.insight}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function GlobalDirectorySection() {
  return (
    <motion.section
      variants={staggerContainer}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
    >
      <motion.div variants={fadeInUp} className="text-center mb-10">
        <p className="text-primary font-sans text-xs uppercase tracking-[0.2em] font-bold mb-3">
          Global Directory
        </p>
        <h2 className="font-serif text-2xl sm:text-3xl font-black text-on-surface mb-2">
          {TOTAL_CATALOGUED} ISKCON Centres Catalogued
        </h2>
        <p className="text-sm text-on-surface-variant max-w-xl mx-auto">
          Browse ISKCON's presence across {ISKCON_REGIONS.length} regions worldwide.
          Each centre listed includes direct links to their website and donation portal.
        </p>
      </motion.div>

      <div className="space-y-3">
        {ISKCON_REGIONS.map((region, i) => (
          <RegionAccordion key={region.name} region={region} index={i} />
        ))}
      </div>
    </motion.section>
  );
}

// ── Governance Section ───────────────────────────────────────────────────────

function GovernanceSection() {
  return (
    <motion.section
      variants={staggerContainer}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
      className="bg-gradient-to-br from-amber-50/60 to-orange-50/40 rounded-2xl p-8 sm:p-10 border border-amber-200/20"
    >
      <motion.div variants={fadeInUp}>
        <p className="text-primary font-sans text-xs uppercase tracking-[0.2em] font-bold mb-3">
          Governance
        </p>
        <h2 className="font-serif text-2xl sm:text-3xl font-black text-on-surface mb-6">
          The Governing Body Commission (GBC)
        </h2>
      </motion.div>

      <motion.div variants={fadeInUp} className="space-y-4 text-on-surface-variant text-sm leading-relaxed max-w-3xl">
        <p>
          ISKCON is governed by the <strong className="text-on-surface">Governing Body Commission (GBC)</strong>,
          the ultimate managing authority established by Srila Prabhupada in 1970. The GBC oversees
          all ISKCON centres, temples, and projects worldwide through a system of zonal assignments.
        </p>
        <p>
          The organization is structured into regional governing bureaus, national councils, and local
          temple management. Each temple is led by a Temple President who reports to regional GBC
          secretaries, ensuring accountability and spiritual standards across all centres.
        </p>
        <p>
          ISKCON's global headquarters are located at <strong className="text-on-surface">Sri Dham Mayapur, West Bengal, India</strong>,
          where the Governing Body Commission meets annually to set organizational direction and resolve matters
          of spiritual governance.
        </p>
      </motion.div>
    </motion.section>
  );
}

// ── CTA Section ──────────────────────────────────────────────────────────────

function CTASection() {
  return (
    <motion.section
      variants={staggerContainer}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
      className="text-center"
    >
      <motion.div variants={fadeInUp}>
        <h2 className="font-serif text-2xl sm:text-3xl font-black text-on-surface mb-4">
          Be Part of the Mission
        </h2>
        <p className="text-sm text-on-surface-variant max-w-lg mx-auto mb-8 leading-relaxed">
          Whether through volunteering, donating, or simply visiting a local temple,
          there are countless ways to participate in Srila Prabhupada's vision of a
          more conscious world.
        </p>
      </motion.div>

      <motion.div variants={fadeInUp} className="flex flex-wrap justify-center gap-4">
        <Link
          href="/temples"
          className="inline-flex items-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-xl font-bold text-sm hover:bg-primary/90 transition-all active:scale-95"
        >
          <Building2 className="w-4 h-4" />
          View Temple Projects
        </Link>
        <a
          href="https://www.iskcon.org/donate"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 border-2 border-primary/30 text-primary px-6 py-3 rounded-xl font-bold text-sm hover:bg-primary/5 transition-all active:scale-95"
        >
          <Heart className="w-4 h-4" />
          Donate to ISKCON
        </a>
        <a
          href="https://centres.iskcon.org"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 border-2 border-primary/30 text-primary px-6 py-3 rounded-xl font-bold text-sm hover:bg-primary/5 transition-all active:scale-95"
        >
          <MapPin className="w-4 h-4" />
          Find a Centre Near You
        </a>
      </motion.div>
    </motion.section>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function AboutISKCON() {
  return (
    <Layout>
      <SEOHead
        title="About ISKCON"
        description="Learn about the International Society for Krishna Consciousness (ISKCON) — its founding by Srila Prabhupada, global presence across 100+ countries, key programs like Food For Life, and a directory of 84 catalogued centres worldwide."
        canonicalPath="/about"
      />

      <div className="px-4 md:px-8 max-w-screen-2xl mx-auto space-y-16 sm:space-y-20">
        <HeroSection />
        <FoundingStorySection />
        <MetricsGrid />
        <ProgramsSection />
        <GlobalDirectorySection />
        <GovernanceSection />
        <CTASection />
      </div>
    </Layout>
  );
}
