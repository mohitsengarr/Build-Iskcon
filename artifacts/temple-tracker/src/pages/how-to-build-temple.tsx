import { motion } from "framer-motion";
import { SEOHead } from "@/components/SEOHead";
import { fadeInUp, fadeIn, staggerContainer, scaleIn, viewportOnce } from "@/lib/animations";
import {
  BookOpen, Building2, Scale, Landmark, Users, IndianRupee,
  Compass, ShieldCheck, TrendingUp, ArrowLeft, ChevronRight,
  AlertTriangle, CheckCircle2, Globe, Heart, ExternalLink,
} from "lucide-react";

// ── Data ────────────────────────────────────────────────────────────────────

const SEVEN_PURPOSES = [
  { num: 1, purpose: "Propagate Spiritual Knowledge", description: "Educate society in spiritual techniques to achieve unity and peace", implementation: "Education programmes, public lectures, seminars" },
  { num: 2, purpose: "Propagate Krishna Consciousness", description: "Disseminate the teachings of Bhagavad-gita and Srimad Bhagavatam", implementation: "Scripture study, Bhakti Vriksha groups, online courses" },
  { num: 3, purpose: "Unite Members with Krishna", description: "Develop understanding that each soul is part of the Supreme", implementation: "Deity worship, kirtan, personal sadhana support" },
  { num: 4, purpose: "Teach Sankirtan Movement", description: "Encourage congregational chanting as taught by Lord Chaitanya", implementation: "Daily kirtans, Rath Yatra festivals, public Harinamas" },
  { num: 5, purpose: "Erect Holy Places", description: "Build transcendental places dedicated to Krishna for all of society", implementation: "Temple construction, sacred space design, guest houses" },
  { num: 6, purpose: "Simpler Way of Life", description: "Bring members together to learn a more natural lifestyle", implementation: "Farm communities, eco-villages, Govardhan programmes" },
  { num: 7, purpose: "Publish & Distribute Literature", description: "Produce and distribute books, periodicals, and writings", implementation: "Book distribution (Sankirtan), BBT publishing, digital media" },
];

const ECOSYSTEM_COMPONENTS = [
  { component: "Sanctum Sanctorum", function: "Primary deity worship space", purpose: "Spiritual core" },
  { component: "Congregational Hall", function: "Kirtan, lectures, festivals", purpose: "Community worship" },
  { component: "Prasadam Kitchen & Restaurant", function: "Sacred food preparation and distribution", purpose: "Service & outreach" },
  { component: "Guest House / Bhakti Residency", function: "Accommodation for visiting devotees", purpose: "Hospitality" },
  { component: "Education Centre", function: "Bhagavad-gita classes, youth programs", purpose: "Knowledge dissemination" },
  { component: "Library & Book Store", function: "BBT literature distribution point", purpose: "Publishing mission" },
  { component: "Administrative Offices", function: "Temple management, GBC coordination", purpose: "Governance" },
  { component: "Community Hall / Auditorium", function: "Cultural programmes, weddings, festivals", purpose: "Cultural integration" },
  { component: "Cow Protection / Farm", function: "Gau Seva and sustainable living", purpose: "Ecological stewardship" },
];

const GOVERNANCE_DOMAINS = [
  { domain: "Spiritual Standards", authority: "GBC (Global)", activities: "Deity worship standards, initiation, sannyasa" },
  { domain: "Strategic Direction", authority: "GBC + Zonal Secretary", activities: "Expansion priorities, regional planning" },
  { domain: "Temple Approval", authority: "GBC + Regional Body", activities: "New project feasibility and compliance review" },
  { domain: "Financial Management", authority: "Temple President (Local)", activities: "Revenue, expenses, fundraising" },
  { domain: "Daily Operations", authority: "Temple President + Council", activities: "Programmes, staff, community engagement" },
  { domain: "Property & Legal", authority: "GBC Legal Division + Local", activities: "Land titles, registrations, compliance" },
  { domain: "Construction", authority: "Local + Temple Dev. Committee", activities: "Design, contracting, project management" },
];

const REVENUE_MODEL = [
  { stream: "Individual Donations", description: "Congregation tithing, major donors, diaspora giving", share: "40-50%" },
  { stream: "Festival & Event Sponsorship", description: "Janmashtami, Rath Yatra, Gaura Purnima sponsorships", share: "10-15%" },
  { stream: "Prasadam & Restaurant Revenue", description: "Temple restaurant, catering, food distribution", share: "10-15%" },
  { stream: "Book Distribution (Sankirtan)", description: "BBT literature sales and distribution", share: "5-10%" },
  { stream: "Guest House & Accommodation", description: "Pilgrim and visitor accommodation fees", share: "5-10%" },
  { stream: "Corporate & Institutional Grants", description: "CSR partnerships, charitable foundations", share: "5-10%" },
  { stream: "Digital & Online Donations", description: "Website, apps, cryptocurrency, crowdfunding", share: "5-8%" },
  { stream: "Life Membership Programme", description: "One-time membership fees with ongoing benefits", share: "5-8%" },
];

const JUHU_TIMELINE = [
  { year: "1965", milestone: "Prabhupada envisions a temple on a 4-acre Juhu Beach plot while passing through Bombay" },
  { year: "1970-71", milestone: "Initial land negotiations with landlord Mr. Nair; agreement to purchase" },
  { year: "1972", milestone: "Giriraj das appointed temple president; formal Juhu operations begin" },
  { year: "1972-76", milestone: "Six years of legal battles: landlord reneges, demolition raid, political corruption" },
  { year: "1973", milestone: "Bal Thackeray intervenes to stop demolition of the temporary temple structure" },
  { year: "Dec 1975", milestone: "Srila Prabhupada lays the foundation stone" },
  { year: "Nov 1977", milestone: "Srila Prabhupada departs this world" },
  { year: "Jan 14, 1978", milestone: "Sri Sri Radha-Rasabihari temple inaugurated on Makara Sankranti" },
];

const RISK_MATRIX = [
  { risk: "Land/Legal Disputes", likelihood: "HIGH", impact: "Litigation, project abandonment", mitigation: "Rigorous due diligence, GBC Legal Division review, reputable local counsel" },
  { risk: "Fundraising Shortfall", likelihood: "HIGH", impact: "Construction delays, half-built structures", mitigation: "Diversified revenue, phased construction, milestone-based spending" },
  { risk: "Leadership Vacuum", likelihood: "HIGH", impact: "Organisational collapse, community attrition", mitigation: "Succession planning, GBC mentorship, leadership development programmes" },
  { risk: "Regulatory / Zoning Issues", likelihood: "MEDIUM", impact: "Permits denied, costly redesigns", mitigation: "Early engagement with planning authorities, community relations" },
  { risk: "Construction Cost Overruns", likelihood: "MEDIUM", impact: "Budget exhaustion, quality compromises", mitigation: "Fixed-price contracts, contingency reserves (15-20%), independent auditing" },
  { risk: "Community Opposition", likelihood: "MEDIUM", impact: "Protests, political interference", mitigation: "Proactive community outreach, interfaith dialogue, local benefit programmes" },
  { risk: "Congregation Fatigue", likelihood: "MEDIUM", impact: "Donor burnout, volunteer attrition", mitigation: "Realistic timelines, regular progress communication, celebration of milestones" },
  { risk: "Spiritual Standards Decline", likelihood: "LOW-MED", impact: "Loss of devotee confidence, GBC intervention", mitigation: "Clear worship protocols, pujari training, regular spiritual audits" },
];

const RECOMMENDATIONS = [
  { num: 1, title: "Begin with Community, Not Construction", text: "Establish Bhakti Vriksha groups, Nama Hatta programmes, and a Sunday Feast in rented premises for at least 2-3 years before initiating a temple construction project. Validate demand and build the donor base first." },
  { num: 2, title: "Conduct a Rigorous Feasibility Study", text: "Before committing to land purchase, complete a comprehensive feasibility study covering demographics, financial projections, regulatory environment, and competitive landscape." },
  { num: 3, title: "Secure GBC & Zonal Alignment Early", text: "Engage the zonal secretary, Temple Development Committee, and relevant GBC members at the concept stage. Their blessing, guidance, and network access are invaluable." },
  { num: 4, title: "Invest in Legal Excellence", text: "Retain top-tier local legal counsel from Day 1. Every land transaction, registration, trust formation, and zoning application must be legally impeccable. The Juhu lesson: legal shortcuts create decade-long nightmares." },
  { num: 5, title: "Design for All Seven Purposes", text: "The architectural brief must explicitly address all seven ISKCON purposes — worship, education, community, kirtan, literature, simpler living, and outreach. A worship-only building is strategically incomplete." },
  { num: 6, title: "Embrace Vastu and Vedic Architecture Principles", text: "Engage architects with temple design experience or Vedic consultants. East-facing entrances, proper shikhara design, cardinal alignment of the sanctum, and appropriate mandapa proportions are non-negotiable." },
  { num: 7, title: "Build for Permanence and Adaptability", text: "Use high-quality materials and engineering designed for multi-generational use. Simultaneously, design spaces that can adapt to changing community needs over decades." },
  { num: 8, title: "Implement Professional Project Governance", text: "Establish a project steering committee, define clear milestones, conduct regular independent cost audits, and maintain transparent reporting to donors and the GBC." },
  { num: 9, title: "Adopt Phased Construction", text: "Break the project into fundable, usable phases. Open a functional hall or temporary temple early to maintain community momentum while the larger complex develops." },
  { num: 10, title: "Diversify Revenue from Inception", text: "Do not rely solely on capital campaign donations. Build recurring revenue streams (memberships, prasadam restaurant, guest house, cultural programmes) from the earliest operational stages." },
  { num: 11, title: "Prioritise Devotee Care & Leadership Development", text: "Invest in the spiritual and material wellbeing of the devotees who will sustain the temple. Burnout and attrition are the silent killers of temple projects." },
  { num: 12, title: "Engage the Surrounding Community", text: "Launch prasadam distribution, cultural festivals, yoga and meditation programmes, and interfaith dialogues that make the temple a valued community asset, not an isolated institution." },
  { num: 13, title: "Leverage Digital Infrastructure", text: "Build a strong online presence (website, social media, streaming of programmes) from the earliest stages. Digital channels expand the potential donor base and attract seekers who may not initially visit in person." },
  { num: 14, title: "Plan for Deity Worship Standards from Day One", text: "The commitment to install deities is a commitment in perpetuity. Ensure that a trained pujari team, daily worship schedule, and sufficient ongoing funding for deity seva are all in place before Prana Pratishtha." },
  { num: 15, title: "Create a 10-Year Strategic Plan", text: "New temple projects should develop a comprehensive 10-year plan covering construction phases, community growth milestones, financial projections, leadership succession, and programme expansion." },
];

const THREE_PILLARS = [
  { pillar: "Empowered Devotees", objective: "Invest in devotee spiritual growth, education, and leadership development", initiatives: "Training programmes, mentorship, retreat centres" },
  { pillar: "Strong Communities", objective: "Build resilient local congregations with robust support systems", initiatives: "Devotee care, youth engagement, Bhakti Vriksha groups" },
  { pillar: "Effective Outreach", objective: "Expand the reach of Krishna consciousness to new audiences", initiatives: "Kirtan events, prasadam distribution, digital media, university programmes" },
];

const SOURCES = [
  "Giriraj Swami. I'll Build You a Temple: The Juhu Story. 2021.",
  "ISKCON Governing Body Commission. GBC Strategic Plan. gbc.iskcon.org",
  "GBC Temple Development/Systems Administration Committee. Temple Best Practices Resource Directory.",
  "ISKCON GBC. Governance Structure. gbc.iskcon.org/governance-structure/",
  "ISKCON Mumbai. Our Mission: Seven Purposes of ISKCON. iskconmumbai.com",
  "ISKCON News. North American 3/35 Vision Advances with Growth Acceleration Teams. 2024.",
  "ISKCON News. Collaborative Leadership: Inside ISKCON's New North America Regional Governing Body Model.",
  "Temple of the Vedic Planetarium. 12 Reasons to Build the TOVP. tovp.org",
  "ISKCON Dwarka. Blending Devotion with Temple Construction. iskcondwarka.org",
  "ISKCON Dublin. New Centre Project. iskcondublin.com",
  "Dakshinpuri. Srila Prabhupada on Temple Construction. dakshinpuri.com",
  "Vaniquotes. Category: Constructing ISKCON Temples. vaniquotes.org",
  "ISKCON Bangalore. Governance. iskconbangalore.org",
  "Dandavats. ISKCON Future Forward: A Bold Vision of Growth, Unity, and Spiritual Empowerment.",
];

// ── Reusable sub-components ─────────────────────────────────────────────────

function SectionHeading({ id, icon: Icon, label, title, subtitle }: {
  id?: string; icon: React.ElementType; label: string; title: string; subtitle?: string;
}) {
  return (
    <motion.div id={id} className="mb-10 scroll-mt-28" variants={fadeInUp} initial="hidden" whileInView="visible" viewport={viewportOnce}>
      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/8 text-primary text-xs font-bold tracking-wide uppercase mb-4">
        <Icon className="w-3.5 h-3.5" /> {label}
      </span>
      <h2 className="font-serif text-2xl sm:text-3xl md:text-4xl font-black text-on-surface leading-tight mb-3">{title}</h2>
      {subtitle && <p className="text-on-surface-variant text-base sm:text-lg max-w-3xl leading-relaxed">{subtitle}</p>}
    </motion.div>
  );
}

function QuoteBlock({ quote, author }: { quote: string; author: string }) {
  return (
    <motion.blockquote
      className="border-l-4 border-primary/60 bg-primary/5 rounded-r-xl px-6 py-5 my-8"
      variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce}
    >
      <p className="font-serif text-lg sm:text-xl italic text-on-surface leading-relaxed">"{quote}"</p>
      <cite className="block mt-3 text-sm font-semibold text-primary not-italic">— {author}</cite>
    </motion.blockquote>
  );
}

function KeyInsight({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="bg-amber-50 border border-amber-200/60 rounded-xl px-6 py-5 my-8"
      variants={scaleIn} initial="hidden" whileInView="visible" viewport={viewportOnce}
    >
      <div className="flex gap-3 items-start">
        <div className="mt-0.5 shrink-0 w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
          <CheckCircle2 className="w-4 h-4 text-amber-700" />
        </div>
        <div className="text-sm sm:text-base text-amber-900 leading-relaxed font-medium">{children}</div>
      </div>
    </motion.div>
  );
}

// ── Sidebar Table of Contents ───────────────────────────────────────────────

const TOC = [
  { id: "executive-summary", label: "Executive Summary" },
  { id: "seven-purposes", label: "Prabhupada's Seven Purposes" },
  { id: "architecture", label: "Spiritual Architecture" },
  { id: "governance", label: "Governance & Structure" },
  { id: "lifecycle", label: "Temple Establishment Lifecycle" },
  { id: "community", label: "Community Building" },
  { id: "fundraising", label: "Fundraising Engine" },
  { id: "case-studies", label: "Case Studies" },
  { id: "growth-vision", label: "3/35 Growth Vision" },
  { id: "risk-management", label: "Risk Management" },
  { id: "recommendations", label: "15 Recommendations" },
  { id: "conclusion", label: "Conclusion" },
];

function scrollTo(hash: string) {
  const el = document.querySelector(`#${hash}`);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Main Page ───────────────────────────────────────────────────────────────

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "How to Build an ISKCON Temple — Complete Strategic Guide",
  description: "A comprehensive guide on ISKCON temple building: from Srila Prabhupada's foundational vision to modern execution frameworks covering philosophy, architecture, governance, fundraising, and operations.",
  author: { "@type": "Organization", name: "Build Iskcon" },
  publisher: { "@type": "Organization", name: "Build Iskcon", url: "https://buildiskcon.com" },
  datePublished: "2026-03-01",
  dateModified: "2026-03-31",
};

export default function HowToBuildTemple() {
  return (
    <>
      <SEOHead
        title="How to Build an ISKCON Temple"
        description="A comprehensive strategic guide on building ISKCON temples worldwide — covering Prabhupada's Seven Purposes, Vedic architecture, governance, fundraising, case studies from Juhu, Bangalore & Mayapur, and 15 actionable recommendations."
        canonicalPath="/how-to-build-temple"
        structuredData={STRUCTURED_DATA}
      />

      {/* ── Top Nav ──────────────────────────────────────────────────── */}
      <nav className="fixed top-0 z-50 w-full bg-surface/90 backdrop-blur-md shadow-[0_4px_24px_rgba(27,28,28,0.06)] border-b border-outline-variant/10">
        <div className="flex justify-between items-center w-full px-4 sm:px-8 py-4 max-w-screen-2xl mx-auto">
          <div className="flex items-center gap-4 sm:gap-8">
            <a href="/" className="flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors text-sm font-medium">
              <ArrowLeft className="w-4 h-4" /> Back
            </a>
            <a href="/">
              <div className="font-serif text-lg sm:text-2xl font-black text-primary uppercase tracking-wider">Build Iskcon</div>
            </a>
          </div>
          <a
            href="https://tovp.org/donate/"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center bg-primary text-on-primary px-4 py-2 rounded-lg font-bold text-xs tracking-wide hover:bg-primary/90 transition-all active:scale-95"
          >
            Donate
          </a>
        </div>
      </nav>

      <main className="pt-24 pb-20 bg-surface text-on-surface min-h-screen">
        {/* ── Hero ──────────────────────────────────────────────────── */}
        <section className="px-4 sm:px-8 max-w-screen-2xl mx-auto mb-16">
          <motion.div className="max-w-4xl" initial="hidden" animate="visible" variants={staggerContainer}>
            <motion.span variants={fadeInUp} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/8 text-primary text-xs font-bold tracking-wide uppercase mb-6">
              <BookOpen className="w-3.5 h-3.5" /> Strategic Guide
            </motion.span>
            <motion.h1 variants={fadeInUp} className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-on-surface leading-[1.1] mb-6">
              How to Build an<br />
              <span className="text-primary">ISKCON Temple</span>
            </motion.h1>
            <motion.p variants={fadeInUp} className="text-on-surface-variant text-base sm:text-lg md:text-xl leading-relaxed max-w-3xl mb-8">
              A comprehensive strategic analysis of how ISKCON establishes temples worldwide — from Srila Prabhupada's foundational vision to modern execution frameworks covering philosophy, architecture, governance, fundraising, and operations.
            </motion.p>
            <motion.div variants={fadeInUp} className="flex flex-wrap gap-3 text-xs text-on-surface-variant">
              <span className="px-3 py-1.5 rounded-full bg-surface-variant/50">Prepared for ISKCON Leadership & GBC</span>
              <span className="px-3 py-1.5 rounded-full bg-surface-variant/50">March 2026</span>
              <span className="px-3 py-1.5 rounded-full bg-surface-variant/50">12 Chapters</span>
            </motion.div>
          </motion.div>
        </section>

        <div className="px-4 sm:px-8 max-w-screen-2xl mx-auto flex gap-12">
          {/* ── Sticky Sidebar TOC (desktop) ──────────────────────── */}
          <aside className="hidden xl:block w-64 shrink-0">
            <div className="sticky top-28">
              <p className="text-[10px] uppercase tracking-[0.15em] font-bold text-primary mb-4">Contents</p>
              <nav className="flex flex-col gap-0.5">
                {TOC.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => scrollTo(item.id)}
                    className="text-left text-sm py-1.5 px-3 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/5 transition-colors font-medium"
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
            </div>
          </aside>

          {/* ── Content ───────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 max-w-4xl">

            {/* 1. Executive Summary */}
            <section className="mb-20">
              <SectionHeading id="executive-summary" icon={BookOpen} label="Chapter 1" title="Executive Summary" />
              <motion.div className="space-y-4 text-on-surface-variant text-sm sm:text-base leading-relaxed" variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce}>
                <p>
                  The International Society for Krishna Consciousness (ISKCON), founded by His Divine Grace A.C. Bhaktivedanta Swami Prabhupada in 1966, has grown from a single storefront in New York City to a global confederation of over <strong className="text-on-surface">650 temples</strong>, <strong className="text-on-surface">65 farm communities and eco-villages</strong>, and <strong className="text-on-surface">110 vegetarian restaurants</strong> worldwide.
                </p>
                <p>
                  This report presents a comprehensive strategic analysis of how ISKCON conceives, plans, funds, builds, and sustains new temples in cities around the world. Drawing on Srila Prabhupada's foundational teachings, the GBC's institutional frameworks, and real-world case studies from Juhu (Mumbai), Bangalore, Mayapur, and Dublin, we present an end-to-end operational blueprint that balances spiritual authenticity with strategic rigour.
                </p>
              </motion.div>

              <motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8" variants={staggerContainer} initial="hidden" whileInView="visible" viewport={viewportOnce}>
                {[
                  { icon: BookOpen, title: "Philosophical Foundation", desc: "Grounding every decision in Prabhupada's Seven Purposes and Gaudiya Vaishnava theology" },
                  { icon: Building2, title: "Architectural Integrity", desc: "Designing temples aligned with Vedic shastras, Vastu Shastra, and Shilpa Shastra standards" },
                  { icon: Scale, title: "Governance Excellence", desc: "Operating within the GBC framework while empowering local leadership" },
                  { icon: IndianRupee, title: "Financial Sustainability", desc: "Building diversified revenue streams beyond initial capital campaigns" },
                  { icon: Users, title: "Community Centricity", desc: "Establishing the temple as a living hub for congregational development" },
                ].map((pillar) => (
                  <motion.div key={pillar.title} variants={fadeInUp} className="bg-white rounded-xl border border-outline-variant/15 p-5 hover:shadow-md transition-shadow">
                    <pillar.icon className="w-5 h-5 text-primary mb-3" />
                    <h3 className="font-bold text-sm text-on-surface mb-1.5">{pillar.title}</h3>
                    <p className="text-xs text-on-surface-variant leading-relaxed">{pillar.desc}</p>
                  </motion.div>
                ))}
              </motion.div>

              <KeyInsight>
                <strong>Key Finding:</strong> The most successful ISKCON temples are those that treat construction as a spiritual process, not merely a real estate project. Prabhupada's approach at Juhu — spending 554 days in Bombay over seven years, more than any other city — demonstrates that leadership presence and spiritual investment are as critical as financial capital.
              </KeyInsight>
            </section>

            {/* 2. Seven Purposes */}
            <section className="mb-20">
              <SectionHeading
                id="seven-purposes" icon={Heart} label="Chapter 2"
                title="Foundational Philosophy: Prabhupada's Seven Purposes"
                subtitle="On July 11, 1966, Srila Prabhupada incorporated ISKCON with seven explicit purposes that serve as the constitutional bedrock for every temple initiative."
              />
              <QuoteBlock
                quote="To erect for the members, and for society at large, a holy place of transcendental pastimes, dedicated to the personality of Krishna."
                author="Srila Prabhupada — Fifth Purpose of ISKCON"
              />
              <motion.div className="overflow-x-auto rounded-xl border border-outline-variant/15 bg-white" variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-primary/5 border-b border-outline-variant/10">
                      <th className="text-left px-4 py-3 font-bold text-on-surface w-8">#</th>
                      <th className="text-left px-4 py-3 font-bold text-on-surface">Purpose</th>
                      <th className="text-left px-4 py-3 font-bold text-on-surface hidden sm:table-cell">Description</th>
                      <th className="text-left px-4 py-3 font-bold text-on-surface hidden md:table-cell">Temple Implementation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SEVEN_PURPOSES.map((p) => (
                      <tr key={p.num} className="border-b border-outline-variant/5 hover:bg-primary/3 transition-colors">
                        <td className="px-4 py-3 font-bold text-primary">{p.num}</td>
                        <td className="px-4 py-3 font-semibold text-on-surface">{p.purpose}</td>
                        <td className="px-4 py-3 text-on-surface-variant hidden sm:table-cell">{p.description}</td>
                        <td className="px-4 py-3 text-on-surface-variant hidden md:table-cell">{p.implementation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </motion.div>

              <KeyInsight>
                <strong>Strategic Implication:</strong> Every new temple must be designed to simultaneously serve all seven purposes. A temple that excels at deity worship (Purpose 3) but neglects education (Purpose 1) or book distribution (Purpose 7) is structurally incomplete by Prabhupada's own definition.
              </KeyInsight>

              <motion.p className="text-on-surface-variant text-sm sm:text-base leading-relaxed mt-6" variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce}>
                Prabhupada described temples as <em>"an oasis in the middle of the desert which would provide much-needed relief from the blazing fire of material existence."</em> This metaphor encapsulates the holistic vision: a temple is not a building but a transformative environment.
              </motion.p>
            </section>

            {/* 3. Architecture */}
            <section className="mb-20">
              <SectionHeading
                id="architecture" icon={Building2} label="Chapter 3"
                title="The Spiritual Architecture Framework"
                subtitle="ISKCON temple construction is not merely an architectural endeavour — it is a spiritual practice."
              />
              <QuoteBlock
                quote="If you build a temple of Lord Krishna in this world, He will build a palace for you in the spiritual world — Vaikuntha."
                author="Srila Prabhupada"
              />

              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce}>
                <h3 className="font-serif text-xl font-bold text-on-surface mb-4">3.1 Vedic Design Principles & Vastu Shastra</h3>
                <p className="text-on-surface-variant text-sm sm:text-base leading-relaxed mb-6">
                  ISKCON temple architecture draws from two primary textual traditions: the <strong className="text-on-surface">Shilpa Shastras</strong> (treatises on sacred arts and craftsmanship) and <strong className="text-on-surface">Vastu Shastra</strong> (the Vedic science of spatial arrangement and directional alignment).
                </p>
              </motion.div>

              <motion.div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10" variants={staggerContainer} initial="hidden" whileInView="visible" viewport={viewportOnce}>
                {[
                  { title: "East-Facing Entrance", desc: "The main entrance must face east, welcoming the sun's first rays as a symbol of enlightenment and spiritual awakening." },
                  { title: "Cardinal Alignment", desc: "The sanctum sanctorum (garbha griha) is aligned meticulously with cardinal directions to channel prana (life force)." },
                  { title: "Shikhara (Spire)", desc: "The curvilinear conical spire above the main deity symbolises Mount Meru — the cosmic axis — guiding consciousness heavenward." },
                  { title: "Mandapa (Assembly Hall)", desc: "Spacious congregational halls designed for collective worship. Acoustic properties are critical for kirtan resonance." },
                  { title: "Jali Screens", desc: "Intricate lattice screens that filter natural light into sacred geometric patterns within the temple interior." },
                  { title: "Bhoomi Pujan", desc: "Ground consecration ceremonies infuse the earth with sacred vibrations, purifying the foundation before construction begins." },
                ].map((item) => (
                  <motion.div key={item.title} variants={fadeInUp} className="bg-white rounded-xl border border-outline-variant/15 p-5">
                    <h4 className="font-bold text-sm text-on-surface mb-2">{item.title}</h4>
                    <p className="text-xs text-on-surface-variant leading-relaxed">{item.desc}</p>
                  </motion.div>
                ))}
              </motion.div>

              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce}>
                <h3 className="font-serif text-xl font-bold text-on-surface mb-4">3.2 Deity Installation & Sacred Standards</h3>
                <p className="text-on-surface-variant text-sm sm:text-base leading-relaxed mb-4">
                  The <strong className="text-on-surface">Prana Pratishtha</strong> ritual is the culminating spiritual event in temple establishment — the ceremony that invites Krishna's divine presence into the deity forms. This is not a symbolic act within Gaudiya Vaishnava theology; it is understood as a literal invitation to God to take up residence.
                </p>
                <p className="text-on-surface-variant text-sm sm:text-base leading-relaxed mb-6">
                  The standards for deity forms follow precise Vedic proportions: <strong className="text-on-surface">Dasatala</strong> (ten talas) for the male deity's height, <strong className="text-on-surface">Navatala</strong> (nine talas) for the consort, and <strong className="text-on-surface">Astatala</strong> (eight talas) for the devotee figure. Every detail — from the shape of the nose and ears to the curvature of the fingers — is specified in the shastras.
                </p>
              </motion.div>

              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce}>
                <h3 className="font-serif text-xl font-bold text-on-surface mb-4">3.3 Temple as a Living Ecosystem</h3>
                <p className="text-on-surface-variant text-sm sm:text-base leading-relaxed mb-6">
                  A critical insight from Prabhupada's approach is that a temple is not a standalone worship hall — it is a multi-functional spiritual ecosystem. The most successful ISKCON temple complexes include:
                </p>
              </motion.div>

              <motion.div className="overflow-x-auto rounded-xl border border-outline-variant/15 bg-white" variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-primary/5 border-b border-outline-variant/10">
                      <th className="text-left px-4 py-3 font-bold text-on-surface">Component</th>
                      <th className="text-left px-4 py-3 font-bold text-on-surface hidden sm:table-cell">Primary Function</th>
                      <th className="text-left px-4 py-3 font-bold text-on-surface">Strategic Purpose</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ECOSYSTEM_COMPONENTS.map((c) => (
                      <tr key={c.component} className="border-b border-outline-variant/5 hover:bg-primary/3 transition-colors">
                        <td className="px-4 py-3 font-semibold text-on-surface">{c.component}</td>
                        <td className="px-4 py-3 text-on-surface-variant hidden sm:table-cell">{c.function}</td>
                        <td className="px-4 py-3 text-on-surface-variant">{c.purpose}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </motion.div>
            </section>

            {/* 4. Governance */}
            <section className="mb-20">
              <SectionHeading
                id="governance" icon={Landmark} label="Chapter 4"
                title="Governance & Organisational Structure"
                subtitle="ISKCON's governance model balances global spiritual standards with local operational autonomy."
              />

              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="space-y-4 text-on-surface-variant text-sm sm:text-base leading-relaxed mb-8">
                <h3 className="font-serif text-xl font-bold text-on-surface">4.1 GBC Oversight Model</h3>
                <p>The Governing Body Commission (GBC), established by Srila Prabhupada as the "ultimate managing authority" of ISKCON, currently comprises <strong className="text-on-surface">32 elected members</strong>. Their responsibilities include:</p>
                <ul className="list-disc pl-6 space-y-1.5">
                  <li>Preserving and executing the instructions of Srila Prabhupada</li>
                  <li>Overseeing spiritual and managerial standards across all ISKCON centres</li>
                  <li>Approving new temple projects and major capital expenditures</li>
                  <li>Ensuring compliance with internal and external legal, accounting, and regulatory requirements</li>
                  <li>Appointing and supervising zonal secretaries for geographic regions</li>
                </ul>
                <p>Nine divisional directors support the GBC Executive Director, covering administrative/systems development, devotee care, legal affairs, accounting, regulatory compliance, and community relations.</p>
              </motion.div>

              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="space-y-4 text-on-surface-variant text-sm sm:text-base leading-relaxed mb-8">
                <h3 className="font-serif text-xl font-bold text-on-surface">4.2 Temple Development Committee</h3>
                <p>The Temple Development/Systems Administration Committee is a specialised GBC body that has created:</p>
                <ul className="list-disc pl-6 space-y-1.5">
                  <li>A resource directory covering best practices of successful temples</li>
                  <li>Guidelines for environmentally friendly temple design</li>
                  <li>Financial management templates and benchmarking tools</li>
                  <li>Mentorship programmes pairing new temple projects with experienced temple presidents</li>
                </ul>
              </motion.div>

              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="mb-6">
                <h3 className="font-serif text-xl font-bold text-on-surface mb-4">4.3 Local vs. Global Authority Balance</h3>
                <p className="text-on-surface-variant text-sm sm:text-base leading-relaxed mb-6">All temples are <strong className="text-on-surface">financially independent</strong> yet function under the ecclesiastical management of the GBC. Each temple is locally managed by a temple president who holds day-to-day operational authority.</p>
              </motion.div>

              <motion.div className="overflow-x-auto rounded-xl border border-outline-variant/15 bg-white" variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-primary/5 border-b border-outline-variant/10">
                      <th className="text-left px-4 py-3 font-bold text-on-surface">Domain</th>
                      <th className="text-left px-4 py-3 font-bold text-on-surface">Authority Level</th>
                      <th className="text-left px-4 py-3 font-bold text-on-surface hidden sm:table-cell">Key Activities</th>
                    </tr>
                  </thead>
                  <tbody>
                    {GOVERNANCE_DOMAINS.map((d) => (
                      <tr key={d.domain} className="border-b border-outline-variant/5 hover:bg-primary/3 transition-colors">
                        <td className="px-4 py-3 font-semibold text-on-surface">{d.domain}</td>
                        <td className="px-4 py-3 text-on-surface-variant">{d.authority}</td>
                        <td className="px-4 py-3 text-on-surface-variant hidden sm:table-cell">{d.activities}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </motion.div>
            </section>

            {/* 5. Lifecycle */}
            <section className="mb-20">
              <SectionHeading
                id="lifecycle" icon={Compass} label="Chapter 5"
                title="The Temple Establishment Lifecycle"
                subtitle="A five-phase lifecycle framework for establishing a new ISKCON temple, with distinct objectives, activities, and critical success factors."
              />

              {/* Phase 1 */}
              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="mb-10">
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center font-bold text-primary text-sm">1</span>
                  <h3 className="font-serif text-xl font-bold text-on-surface">Vision & Feasibility Assessment</h3>
                </div>
                <p className="text-on-surface-variant text-sm sm:text-base leading-relaxed mb-4">Every successful ISKCON temple begins with a clear spiritual vision anchored in a realistic assessment of local conditions.</p>
                <div className="bg-white rounded-xl border border-outline-variant/15 p-5">
                  <h4 className="font-bold text-sm text-on-surface mb-3">Key Assessment Criteria</h4>
                  <ul className="space-y-2 text-sm text-on-surface-variant">
                    <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /><span><strong className="text-on-surface">Devotee Base:</strong> Minimum congregation of 50-100 active families</span></li>
                    <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /><span><strong className="text-on-surface">Leadership Readiness:</strong> Qualified leader with temple management experience</span></li>
                    <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /><span><strong className="text-on-surface">Geographic Demand:</strong> Distance from nearest centre, population, university presence</span></li>
                    <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /><span><strong className="text-on-surface">Financial Capacity:</strong> Fundraising potential from local congregation and donors</span></li>
                    <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /><span><strong className="text-on-surface">Regulatory Environment:</strong> Zoning laws, building codes, government disposition</span></li>
                    <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /><span><strong className="text-on-surface">GBC Zonal Approval:</strong> Formal endorsement from zonal secretary and GBC members</span></li>
                  </ul>
                </div>
                <KeyInsight>
                  <strong>Lesson from Prabhupada:</strong> "Native devotees construct the Hare Krishna temples in their respective localities." Temples imposed from outside without grassroots support consistently underperform.
                </KeyInsight>
              </motion.div>

              {/* Phase 2 */}
              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="mb-10">
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center font-bold text-primary text-sm">2</span>
                  <h3 className="font-serif text-xl font-bold text-on-surface">Land Acquisition & Legal Structuring</h3>
                </div>
                <p className="text-on-surface-variant text-sm sm:text-base leading-relaxed mb-4">
                  Land acquisition is often the most protracted and risk-laden phase. The ISKCON Juhu experience — six years of battling a dishonest landlord, corrupt municipal officials, and legal obstacles — remains the definitive cautionary tale.
                </p>
                <div className="bg-white rounded-xl border border-outline-variant/15 p-5">
                  <h4 className="font-bold text-sm text-on-surface mb-3">Critical Considerations</h4>
                  <ul className="space-y-2 text-sm text-on-surface-variant">
                    <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />Conduct thorough title searches and legal due diligence before any commitment</li>
                    <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />Engage reputable local legal counsel experienced in religious property</li>
                    <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />Register under a legally constituted ISKCON trust or society, not individual names</li>
                    <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />Ensure compliance with all zoning and land-use regulations</li>
                    <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />GBC Legal Division should review all major property transactions</li>
                    <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />Consider phased acquisition — smaller property first, larger land for eventual complex</li>
                  </ul>
                </div>
              </motion.div>

              {/* Phase 3 */}
              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="mb-10">
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center font-bold text-primary text-sm">3</span>
                  <h3 className="font-serif text-xl font-bold text-on-surface">Fundraising & Financial Planning</h3>
                </div>
                <p className="text-on-surface-variant text-sm sm:text-base leading-relaxed mb-4">
                  Modern temple projects employ a diversified approach combining individual donations, institutional grants, corporate sponsorship, digital campaigns, and innovative revenue streams.
                </p>
                <motion.div className="overflow-x-auto rounded-xl border border-outline-variant/15 bg-white" variants={fadeIn}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-primary/5 border-b border-outline-variant/10">
                        <th className="text-left px-4 py-3 font-bold text-on-surface">Revenue Stream</th>
                        <th className="text-left px-4 py-3 font-bold text-on-surface hidden sm:table-cell">Description</th>
                        <th className="text-left px-4 py-3 font-bold text-on-surface w-24">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {REVENUE_MODEL.map((r) => (
                        <tr key={r.stream} className="border-b border-outline-variant/5 hover:bg-primary/3 transition-colors">
                          <td className="px-4 py-3 font-semibold text-on-surface">{r.stream}</td>
                          <td className="px-4 py-3 text-on-surface-variant hidden sm:table-cell">{r.description}</td>
                          <td className="px-4 py-3 font-bold text-primary">{r.share}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </motion.div>
                <KeyInsight>
                  The ISKCON Dublin case: their campaign raised over <strong>EUR 310,000</strong> from the local congregation, which — combined with a bank loan — enabled land purchase. Even smaller communities can achieve major milestones through focused, multi-year fundraising.
                </KeyInsight>
              </motion.div>

              {/* Phase 4 */}
              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="mb-10">
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center font-bold text-primary text-sm">4</span>
                  <h3 className="font-serif text-xl font-bold text-on-surface">Design, Construction & Project Management</h3>
                </div>
                <div className="bg-white rounded-xl border border-outline-variant/15 p-5">
                  <h4 className="font-bold text-sm text-on-surface mb-3">Design & Construction Best Practices</h4>
                  <ul className="space-y-2 text-sm text-on-surface-variant">
                    <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />Engage architects with temple experience or partner with Vedic consultants</li>
                    <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />Consult Temple Development Committee's resource directory for eco-friendly design</li>
                    <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />Prioritise durability — the TOVP in Mayapur is designed to last at least <strong className="text-on-surface">1,000 years</strong></li>
                    <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />Design for multifunctionality: worship hall, education centre, kitchen, guest house, offices</li>
                    <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />Implement proper project management: milestones, progress reviews, independent cost auditing</li>
                    <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />Consider phased construction to allow early programmes before full complex completion</li>
                    <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />Incorporate modern amenities — climate control, accessibility, digital infrastructure</li>
                  </ul>
                </div>
              </motion.div>

              {/* Phase 5 */}
              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="mb-10">
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center font-bold text-primary text-sm">5</span>
                  <h3 className="font-serif text-xl font-bold text-on-surface">Inauguration & Operational Launch</h3>
                </div>
                <p className="text-on-surface-variant text-sm sm:text-base leading-relaxed mb-4">
                  The inauguration is centred on the <strong className="text-on-surface">Prana Pratishtha ceremony</strong>. Once deities are installed, the temple must maintain daily worship, food offerings, and festival observances in perpetuity.
                </p>
                <div className="bg-white rounded-xl border border-outline-variant/15 p-5">
                  <h4 className="font-bold text-sm text-on-surface mb-3">Operational Readiness at Launch</h4>
                  <ul className="space-y-2 text-sm text-on-surface-variant">
                    <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />Fully trained pujari (priest) team for daily worship schedule</li>
                    <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />Committed temple president and management council in place</li>
                    <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />Minimum six months of operating funds secured</li>
                    <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />Defined programme calendar for the first year</li>
                    <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />Active outreach: Harinams, prasadam distribution, Sunday feasts</li>
                    <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />Clear standard operating procedures for all temple functions</li>
                  </ul>
                </div>
              </motion.div>
            </section>

            {/* 6. Community */}
            <section className="mb-20">
              <SectionHeading
                id="community" icon={Users} label="Chapter 6"
                title="Community Building & Congregational Development"
                subtitle="A temple without a thriving congregation is an architectural achievement but a spiritual failure."
              />

              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="space-y-4 text-on-surface-variant text-sm sm:text-base leading-relaxed mb-8">
                <p>The GBC's current strategic framework recognises three reinforcing pillars: <strong className="text-on-surface">Empowered Devotees</strong>, <strong className="text-on-surface">Strong Communities</strong>, and <strong className="text-on-surface">Effective Outreach</strong>.</p>
                <h3 className="font-serif text-xl font-bold text-on-surface !mt-8 !mb-4">The Congregational Flywheel</h3>
              </motion.div>

              <motion.div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8" variants={staggerContainer} initial="hidden" whileInView="visible" viewport={viewportOnce}>
                {[
                  { title: "Prasadam Distribution", desc: "Free or subsidised sacred food draws newcomers and creates goodwill. Food for Life has served over 70 million meals." },
                  { title: "Sunday Feast Programme", desc: "Weekly open-house events combining kirtan, philosophy, and prasadam — the primary entry point for new members." },
                  { title: "Bhakti Vriksha / Nama Hatta", desc: "Small-group home programmes extend the temple's reach into neighbourhoods, creating intimate community bonds." },
                  { title: "Youth Engagement", desc: "Dedicated programmes for children, teenagers, and young adults ensure generational continuity." },
                  { title: "Devotee Care", desc: "Systematic pastoral support — counselling, mentoring, crisis assistance — ensures members feel valued." },
                  { title: "Festival Calendar", desc: "Janmashtami, Gaura Purnima, Rath Yatra serve as cultural anchors attracting thousands." },
                ].map((item) => (
                  <motion.div key={item.title} variants={fadeInUp} className="bg-white rounded-xl border border-outline-variant/15 p-5">
                    <h4 className="font-bold text-sm text-on-surface mb-2">{item.title}</h4>
                    <p className="text-xs text-on-surface-variant leading-relaxed">{item.desc}</p>
                  </motion.div>
                ))}
              </motion.div>

              <KeyInsight>
                <strong>Strategic Insight:</strong> The temple building should be conceived as a community engagement platform, not a worship-only facility. The most vibrant ISKCON temples allocate at least <strong>40% of their built-up area</strong> to community, educational, and hospitality functions beyond the core worship space.
              </KeyInsight>
            </section>

            {/* 7. Fundraising */}
            <section className="mb-20">
              <SectionHeading
                id="fundraising" icon={IndianRupee} label="Chapter 7"
                title="The Fundraising Engine"
                subtitle="Financial sustainability is the most common point of failure for new temple projects."
              />

              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="space-y-4 text-on-surface-variant text-sm sm:text-base leading-relaxed mb-8">
                <h3 className="font-serif text-xl font-bold text-on-surface">Financial Independence Principle</h3>
                <p>Srila Prabhupada directed that all ISKCON temples are <strong className="text-on-surface">financially independent</strong>. There is no central treasury. This creates a powerful incentive for self-sufficiency but means new temples must develop robust local revenue streams from inception.</p>
              </motion.div>

              <motion.div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8" variants={staggerContainer} initial="hidden" whileInView="visible" viewport={viewportOnce}>
                {[
                  { title: "Life Membership Programme", desc: "A proven model across ISKCON India — one-time payment for lifetime benefits including accommodation, prasadam, and recognition." },
                  { title: "Digital Giving Infrastructure", desc: "Online donation portals, mobile apps, and UPI/payment gateway integration have dramatically expanded donor reach." },
                  { title: "CSR Partnerships", desc: "In India, mandatory CSR spending creates significant opportunities for temple-related education, food distribution, and cultural programmes." },
                  { title: "Recurring Donation Programmes", desc: "Monthly automated giving provides predictable cash flow — the financial backbone of operationally stable temples." },
                  { title: "Capital Campaign Structuring", desc: "Multi-year pledge campaigns with naming rights, milestone celebrations, and donor recognition walls." },
                  { title: "Prasadam as Revenue", desc: "Temple restaurants and catering services generate significant ongoing revenue while fulfilling the prasadam distribution mission." },
                ].map((item) => (
                  <motion.div key={item.title} variants={fadeInUp} className="bg-white rounded-xl border border-outline-variant/15 p-5">
                    <h4 className="font-bold text-sm text-on-surface mb-2">{item.title}</h4>
                    <p className="text-xs text-on-surface-variant leading-relaxed">{item.desc}</p>
                  </motion.div>
                ))}
              </motion.div>

              <motion.p className="text-on-surface-variant text-sm leading-relaxed italic" variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce}>
                Emerging innovation: Some ISKCON centres are exploring blockchain technology and cryptocurrency donations to engage tech-savvy donors, though this remains nascent and requires careful regulatory compliance.
              </motion.p>
            </section>

            {/* 8. Case Studies */}
            <section className="mb-20">
              <SectionHeading
                id="case-studies" icon={Globe} label="Chapter 8"
                title="Case Studies: Lessons from Landmark Temples"
              />

              {/* Juhu */}
              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="mb-12">
                <h3 className="font-serif text-xl font-bold text-on-surface mb-2">8.1 ISKCON Juhu, Mumbai — The Definitive Blueprint</h3>
                <p className="text-on-surface-variant text-sm sm:text-base leading-relaxed mb-6">
                  The Juhu temple story, documented in Giriraj Swami's <em>"I'll Build You a Temple: The Juhu Story,"</em> spans thirteen years (1965-1978) and embodies every challenge and principle relevant to modern temple establishment.
                </p>

                <div className="relative pl-6 border-l-2 border-primary/30 space-y-6 mb-8">
                  {JUHU_TIMELINE.map((item) => (
                    <div key={item.year} className="relative">
                      <div className="absolute -left-[29px] w-4 h-4 rounded-full bg-primary/20 border-2 border-primary" />
                      <span className="font-bold text-primary text-sm">{item.year}</span>
                      <p className="text-on-surface-variant text-sm leading-relaxed mt-0.5">{item.milestone}</p>
                    </div>
                  ))}
                </div>

                <div className="bg-white rounded-xl border border-outline-variant/15 p-5">
                  <h4 className="font-bold text-sm text-on-surface mb-3">Key Lessons from Juhu</h4>
                  <ul className="space-y-2 text-sm text-on-surface-variant">
                    <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /><strong className="text-on-surface">Leadership persistence is non-negotiable.</strong> Prabhupada spent 554 days in Bombay — more than any other city.</li>
                    <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /><strong className="text-on-surface">Legal due diligence saves years of pain.</strong> Failure to secure ironclad agreements led to six years of litigation.</li>
                    <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /><strong className="text-on-surface">Political relationships matter.</strong> Bal Thackeray's intervention saved the project from physical destruction.</li>
                    <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /><strong className="text-on-surface">Grassroots support is essential.</strong> A strong local base is critical for sustained effort.</li>
                    <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /><strong className="text-on-surface">The promise must be honoured.</strong> Prabhupada's vow to the deities became an unbreakable spiritual commitment.</li>
                  </ul>
                </div>
              </motion.div>

              {/* Bangalore */}
              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="mb-12">
                <h3 className="font-serif text-xl font-bold text-on-surface mb-2">8.2 ISKCON Bangalore — Scale & Operational Excellence</h3>
                <p className="text-on-surface-variant text-sm sm:text-base leading-relaxed mb-4">
                  The <strong className="text-on-surface">largest and most visited ISKCON temple globally</strong>, demonstrating how a temple can achieve massive scale while maintaining spiritual standards. Characterised by professional management, world-class infrastructure, and the <strong className="text-on-surface">Akshaya Patra programme</strong> which feeds millions of school children daily.
                </p>
                <p className="text-on-surface-variant text-sm sm:text-base leading-relaxed">
                  The planned <strong className="text-on-surface">Vrindavan Chandrodaya Mandir</strong> aims to be the tallest and largest religious structure in India with a footprint of 4.5 acres and 540,000 square feet of built-up area.
                </p>
              </motion.div>

              {/* TOVP */}
              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="mb-12">
                <h3 className="font-serif text-xl font-bold text-on-surface mb-2">8.3 Temple of the Vedic Planetarium (TOVP), Mayapur</h3>
                <p className="text-on-surface-variant text-sm sm:text-base leading-relaxed mb-4">
                  Under construction since 2009, the TOVP will be the <strong className="text-on-surface">largest religious monument in the world</strong>. Key lessons:
                </p>
                <div className="bg-white rounded-xl border border-outline-variant/15 p-5">
                  <ul className="space-y-2 text-sm text-on-surface-variant">
                    <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /><strong className="text-on-surface">Return to the founder's vision.</strong> Progress accelerated when the project returned to Prabhupada's original vision.</li>
                    <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /><strong className="text-on-surface">Design for permanence.</strong> Engineered to last at least 1,000 years.</li>
                    <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /><strong className="text-on-surface">Global fundraising for global significance.</strong> Draws donations from ISKCON's worldwide congregation.</li>
                    <li className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /><strong className="text-on-surface">Navigate local politics.</strong> Land issues in communist-era West Bengal created significant delays.</li>
                  </ul>
                </div>
              </motion.div>

              {/* Dublin */}
              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="mb-10">
                <h3 className="font-serif text-xl font-bold text-on-surface mb-2">8.4 ISKCON Dublin — A Modern Greenfield Example</h3>
                <p className="text-on-surface-variant text-sm sm:text-base leading-relaxed">
                  A contemporary, replicable model for smaller communities. The congregation raised over <strong className="text-on-surface">EUR 310,000</strong> through grassroots fundraising, supplemented by a bank loan, to purchase land outside Dublin. Now in the design and planning stage — demonstrating that the temple-building model works even for communities without access to large institutional donors or diaspora wealth.
                </p>
              </motion.div>
            </section>

            {/* 9. Growth Vision */}
            <section className="mb-20">
              <SectionHeading
                id="growth-vision" icon={TrendingUp} label="Chapter 9"
                title="The 3/35 Vision: Growth Acceleration Strategy"
                subtitle="A strategic plan to engage 3% of North America's population (~12 million individuals) in Krishna consciousness by 2035."
              />

              <motion.div className="overflow-x-auto rounded-xl border border-outline-variant/15 bg-white mb-8" variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-primary/5 border-b border-outline-variant/10">
                      <th className="text-left px-4 py-3 font-bold text-on-surface">Pillar</th>
                      <th className="text-left px-4 py-3 font-bold text-on-surface">Objective</th>
                      <th className="text-left px-4 py-3 font-bold text-on-surface hidden sm:table-cell">Key Initiatives</th>
                    </tr>
                  </thead>
                  <tbody>
                    {THREE_PILLARS.map((p) => (
                      <tr key={p.pillar} className="border-b border-outline-variant/5 hover:bg-primary/3 transition-colors">
                        <td className="px-4 py-3 font-semibold text-on-surface">{p.pillar}</td>
                        <td className="px-4 py-3 text-on-surface-variant">{p.objective}</td>
                        <td className="px-4 py-3 text-on-surface-variant hidden sm:table-cell">{p.initiatives}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </motion.div>

              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="space-y-4 text-on-surface-variant text-sm sm:text-base leading-relaxed">
                <h3 className="font-serif text-xl font-bold text-on-surface">Growth Acceleration Teams (GATs)</h3>
                <p>To operationalise the 3/35 Vision, Growth Acceleration Teams are being formed within each geographic zone. ISKCON centres in North America have grown from <strong className="text-on-surface">72 in 2014 to 121 in 2024</strong>, with book distribution doubling in the same period.</p>
                <h3 className="font-serif text-xl font-bold text-on-surface !mt-8">New North American Regional Governing Body</h3>
                <p>ISKCON has adopted a collaborative leadership model with the Regional Governing Body (RGB) incorporating GBCs, zonal supervisors, temple presidents, and ministry heads working collaboratively rather than hierarchically.</p>
              </motion.div>
            </section>

            {/* 10. Risk Management */}
            <section className="mb-20">
              <SectionHeading
                id="risk-management" icon={ShieldCheck} label="Chapter 10"
                title="Risk Management & Critical Success Factors"
              />

              <motion.div className="overflow-x-auto rounded-xl border border-outline-variant/15 bg-white mb-8" variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-primary/5 border-b border-outline-variant/10">
                      <th className="text-left px-4 py-3 font-bold text-on-surface">Risk Factor</th>
                      <th className="text-left px-4 py-3 font-bold text-on-surface w-20">Likelihood</th>
                      <th className="text-left px-4 py-3 font-bold text-on-surface hidden sm:table-cell">Potential Impact</th>
                      <th className="text-left px-4 py-3 font-bold text-on-surface hidden md:table-cell">Mitigation Strategy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {RISK_MATRIX.map((r) => (
                      <tr key={r.risk} className="border-b border-outline-variant/5 hover:bg-primary/3 transition-colors">
                        <td className="px-4 py-3 font-semibold text-on-surface">{r.risk}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${
                            r.likelihood === "HIGH" ? "bg-red-100 text-red-700" :
                            r.likelihood === "MEDIUM" ? "bg-amber-100 text-amber-700" :
                            "bg-green-100 text-green-700"
                          }`}>{r.likelihood}</span>
                        </td>
                        <td className="px-4 py-3 text-on-surface-variant hidden sm:table-cell">{r.impact}</td>
                        <td className="px-4 py-3 text-on-surface-variant hidden md:table-cell">{r.mitigation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </motion.div>

              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce}>
                <h3 className="font-serif text-xl font-bold text-on-surface mb-4">Six Critical Success Factors</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { title: "Unwavering Spiritual Vision", desc: "A compelling, Prabhupada-aligned vision that inspires sacrifice and sustained effort." },
                    { title: "Strong, Committed Local Leadership", desc: "A temple president with both spiritual maturity and managerial competence." },
                    { title: "Established Congregation Before Construction", desc: "The most successful temples are built for an existing community, not hoping one will come." },
                    { title: "Financial Prudence & Diversification", desc: "Multiple revenue streams, realistic budgets with contingencies, and phased construction." },
                    { title: "GBC Alignment & Support", desc: "Active engagement with the zonal secretary and Temple Development Committee from the start." },
                    { title: "Community Integration", desc: "Temples that integrate positively with their surrounding community build protective social capital." },
                  ].map((item) => (
                    <div key={item.title} className="bg-white rounded-xl border border-outline-variant/15 p-5">
                      <h4 className="font-bold text-sm text-on-surface mb-2">{item.title}</h4>
                      <p className="text-xs text-on-surface-variant leading-relaxed">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            </section>

            {/* 11. Recommendations */}
            <section className="mb-20">
              <SectionHeading
                id="recommendations" icon={CheckCircle2} label="Chapter 11"
                title="15 Recommendations for New Temple Establishment"
                subtitle="Actionable recommendations sequenced to follow the natural lifecycle of a temple project."
              />

              <motion.div className="space-y-4" variants={staggerContainer} initial="hidden" whileInView="visible" viewport={viewportOnce}>
                {RECOMMENDATIONS.map((rec) => (
                  <motion.div key={rec.num} variants={fadeInUp} className="bg-white rounded-xl border border-outline-variant/15 p-5 hover:shadow-md transition-shadow">
                    <div className="flex gap-4">
                      <span className="w-8 h-8 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center font-bold text-primary text-sm">{rec.num}</span>
                      <div>
                        <h4 className="font-bold text-sm text-on-surface mb-1.5">{rec.title}</h4>
                        <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">{rec.text}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </section>

            {/* 12. Conclusion */}
            <section className="mb-20">
              <SectionHeading id="conclusion" icon={Heart} label="Chapter 12" title="Conclusion" />

              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="space-y-4 text-on-surface-variant text-sm sm:text-base leading-relaxed">
                <p>
                  Building an ISKCON temple is simultaneously a spiritual act, a community-building endeavour, and a complex strategic undertaking. The genius of Srila Prabhupada's model lies in its refusal to separate these dimensions — <strong className="text-on-surface">every brick is an offering, every fundraising effort an act of devotion, every community programme an expression of the temple's spiritual purpose</strong>.
                </p>
                <p>
                  The most successful ISKCON temples — from Juhu to Bangalore to Mayapur — share common traits: unwavering spiritual vision, persistent and competent leadership, deep community roots, financial prudence, and faithful adherence to Prabhupada's instructions.
                </p>
                <p>
                  As ISKCON enters a new era of growth — with the 3/35 Vision targeting 12 million engaged participants in North America alone — the demand for new temples will only accelerate. The organisation's ability to replicate its temple-building model at scale, while maintaining the spiritual authenticity that distinguishes ISKCON, will determine whether Prabhupada's vision of a <em>"house in which the whole world can live"</em> is fully realised.
                </p>
              </motion.div>

              <QuoteBlock
                quote="If you build a temple of Lord Krishna in this world, He will build a palace for you in the spiritual world — Vaikuntha."
                author="His Divine Grace A.C. Bhaktivedanta Swami Prabhupada"
              />
            </section>

            {/* Sources */}
            <section className="mb-20">
              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce}>
                <h3 className="font-serif text-xl font-bold text-on-surface mb-4">Sources & References</h3>
                <ol className="list-decimal pl-5 space-y-1.5 text-xs sm:text-sm text-on-surface-variant">
                  {SOURCES.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </motion.div>
            </section>

            {/* CTA */}
            <motion.section
              className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent rounded-2xl p-8 sm:p-12 text-center"
              variants={scaleIn} initial="hidden" whileInView="visible" viewport={viewportOnce}
            >
              <h2 className="font-serif text-2xl sm:text-3xl font-black text-on-surface mb-4">Ready to Support a Temple Project?</h2>
              <p className="text-on-surface-variant text-sm sm:text-base max-w-xl mx-auto mb-6">
                Explore active ISKCON temple construction projects worldwide and contribute directly to the temples that inspire you.
              </p>
              <div className="flex flex-wrap gap-4 justify-center">
                <a href="/" className="inline-flex items-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-xl font-bold text-sm tracking-wide hover:bg-primary/90 transition-all active:scale-95">
                  View All Projects <ArrowLeft className="w-4 h-4 rotate-180" />
                </a>
                <a
                  href="https://tovp.org/donate/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 border-2 border-primary/40 text-primary px-6 py-3 rounded-xl font-bold text-sm tracking-wide hover:bg-primary/5 transition-all active:scale-95"
                >
                  Donate Now <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </motion.section>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-on-surface text-[#fbf9f8] w-full">
        <div className="px-6 sm:px-12 py-12 max-w-screen-2xl mx-auto">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-8">
            <div>
              <a href="/">
                <div className="font-serif text-lg font-black text-primary uppercase tracking-wider mb-2">Build Iskcon</div>
              </a>
              <p className="text-white/60 font-sans text-xs font-medium leading-relaxed max-w-sm">
                Tracking ISKCON's global temple construction mission — town by town, continent by continent.
              </p>
            </div>
            <div className="flex gap-8">
              <div className="flex flex-col gap-3">
                <span className="font-sans text-[10px] uppercase tracking-[0.15em] font-bold text-primary mb-1">Explore</span>
                <a href="/" className="text-white/70 hover:text-primary text-xs font-medium transition-colors">Home</a>
                <a href="/how-to-build-temple" className="text-white/70 hover:text-primary text-xs font-medium transition-colors">How to Build</a>
              </div>
              <div className="flex flex-col gap-3">
                <span className="font-sans text-[10px] uppercase tracking-[0.15em] font-bold text-primary mb-1">Give</span>
                <a href="https://tovp.org/donate/" target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-primary text-xs font-medium transition-colors">Donate to ISKCON</a>
                <a href="https://tovp.org/donate/" target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-primary text-xs font-medium transition-colors">Donate to TOVP</a>
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 px-6 sm:px-12 py-5 max-w-screen-2xl mx-auto">
          <p className="text-white/40 font-sans text-[10px] tracking-wide font-medium">
            &copy; {new Date().getFullYear()} Build Iskcon — Global Temple Construction Intelligence. An independent initiative tracking ISKCON's global construction mission.
          </p>
        </div>
      </footer>
    </>
  );
}
