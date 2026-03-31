import { motion } from "framer-motion";
import { SEOHead } from "@/components/SEOHead";
import { fadeInUp, fadeIn, staggerContainer, scaleIn, viewportOnce } from "@/lib/animations";
import {
  BookOpen, Landmark, Scale, Shield, Users, Globe,
  ArrowLeft, ChevronRight, AlertTriangle, CheckCircle2,
  ExternalLink, MapPin, Calendar, ScrollText, Gavel,
} from "lucide-react";

// ── Data ────────────────────────────────────────────────────────────────────

const SITUATION_AT_GLANCE = [
  { dimension: "Location", facts: "Katra Keshavdeva, Mathura, Uttar Pradesh, India" },
  { dimension: "Religious Significance", facts: "Believed birthplace of Lord Krishna; one of Hinduism's holiest sites" },
  { dimension: "Current Structures", facts: "Keshavdeva Temple (1958), Garbha Griha Shrine, Bhagavata Bhavan, Shahi Eidgah Mosque (1670)" },
  { dimension: "Total Land Area", facts: "5.41 hectares (13.37 acres) under Shri Krishna Janmasthan Seva Sansthan" },
  { dimension: "Annual Footfall", facts: "Estimated 10–15 million pilgrims per year" },
  { dimension: "Legal Status", facts: "18 civil suits pending; Supreme Court stay on HC survey order; Places of Worship Act 1991 applicability under review" },
  { dimension: "Key Legal Provision", facts: "Places of Worship (Special Provisions) Act, 1991 — freezes religious character of sites as of August 15, 1947" },
];

const DESTRUCTION_TIMELINE = [
  { period: "c. 400 CE", event: "Grand temple complex constructed at Katra Keshavdeva", actors: "Emperor Chandragupta II (Gupta Dynasty)" },
  { period: "8th century CE", event: "Donations and patronage recorded through inscriptions", actors: "Rashtrakuta rulers" },
  { period: "1017–1018 CE", event: "Temple destroyed; city sacked for 20 days; gold and jewels plundered", actors: "Sultan Mahmud of Ghazni" },
  { period: "1150 CE", event: 'New Vishnu temple constructed, described as "brilliantly white and touching the clouds"', actors: "Jajja, under King Vijayapala Dev" },
  { period: "Mid-14th century", event: "Temple destroyed again", actors: "Sultan Firuz Shah Tughlaq" },
  { period: "c. 1489–1517", event: "Temple destroyed; Hindu religious practices restricted in Mathura", actors: "Sultan Sikandar Lodi (Delhi Sultanate)" },
  { period: "Early 16th century", event: "Vaishnava saints visit and revive worship at Mathura", actors: "Chaitanya Mahaprabhu, Vallabhacharya" },
  { period: "1618 CE", event: "Grand temple rebuilt at significant expense", actors: "Raja Veer Singh Deva Bundela (with Mughal permission under Jahangir)" },
  { period: "1650 CE", event: 'French traveler documents temple as "one of the most sumptuous edifices in all India"', actors: "Jean Baptiste Tavernier (documentation)" },
  { period: "1669–1670 CE", event: "Temple demolished; Shahi Eidgah mosque constructed on the site", actors: "Emperor Aurangzeb" },
  { period: "1807 CE", event: "British auction 13.37 acres of Katra land", actors: "East India Company" },
  { period: "1935 CE", event: "Allahabad High Court confirms land ownership of Hindu descendants", actors: "Rai Krishna Das (descendant of Raja Patnimal)" },
  { period: "1944 CE", event: "Land acquired for Rs 13,000", actors: "Madan Mohan Malaviya, Jugal Kishore Birla" },
  { period: "1951 CE", event: "Shri Krishna Janmasthan Seva Sansthan trust established", actors: "Jugal Kishore Birla" },
  { period: "1953–1958", event: "Keshavdeva Temple construction; inaugurated September 6, 1958", actors: "Trust / Hanuman Prasad Poddar" },
  { period: "1982", event: "Entire modern temple complex completed", actors: "Shri Krishna Janmasthan Seva Sansthan" },
];

const LEGAL_TIMELINE = [
  { date: "1968", event: "Compromise agreement signed; subsequently formalized by court decree", forum: "Mathura Civil Court" },
  { date: "1992", event: "Post-Babri demolition: Manohar Lal Sharma files petition challenging 1968 agreement", forum: "Mathura Court" },
  { date: "Sept 2020", event: "Ranjana Agnihotri and 6 others file suit seeking removal of Shahi Eidgah", forum: "Civil Judge, Mathura" },
  { date: "Feb 2021", event: '"Bhagwan Sri Krishna Virajman" suit filed against UP Sunni Central Waqf Board', forum: "Civil Judge, Mathura" },
  { date: "2020–2023", event: "Multiple additional suits filed (18 total), challenging the 1968 compromise", forum: "Various Mathura courts" },
  { date: "May 2023", event: "Allahabad HC transfers all 18 suits to itself", forum: "Allahabad High Court" },
  { date: "Dec 14, 2023", event: "HC orders court-monitored survey of Shahi Eidgah mosque", forum: "Allahabad High Court" },
  { date: "Jan 2024", event: 'Supreme Court stays HC survey order, calling purpose "vague"', forum: "Supreme Court of India" },
  { date: "Aug 1, 2024", event: "HC rules all 18 suits are maintainable; rejects Muslim side's objections", forum: "Allahabad High Court" },
  { date: "Jan 22, 2025", event: "SC extends stay on survey; defers hearing", forum: "Supreme Court of India" },
  { date: "Feb 2025", event: "SC hears challenges to Places of Worship Act; bars all interim orders including surveys", forum: "Supreme Court of India" },
  { date: "April 2025", event: "SC hears mosque committee's plea against impleading ASI and Union of India", forum: "Supreme Court of India" },
];

const COMPROMISE_TERMS = [
  "Ownership of the entire land remained with the Shri Krishna Janmasthan Seva Sansthan (temple trust)",
  "The Trust Shahi Masjid Idgah received management rights to operate the mosque on a demarcated portion",
  "The temple trust relinquished any legal claims to the Shahi Eidgah structure",
  "Boundaries were redrawn so both places of worship could operate simultaneously",
  "A wall was erected separating the two complexes",
  "The mosque would have no window, door, or open drain facing the temple",
  "Tenants of the Idgah were asked to vacate to allow construction of the new temple",
];

const HINDU_ARGUMENTS = [
  "The 1968 compromise was signed fraudulently and without proper authority, and is therefore void",
  "The Shahi Eidgah was built after demolishing the Keshavdeva temple in 1670, constituting illegal encroachment",
  "ASI records from 1920 confirm the temple's prior existence and Aurangzeb's demolition",
  "The Places of Worship Act's exemption of only Ram Janmabhoomi is discriminatory under Article 14",
  "The garbha griha (sanctum) of the original temple survives, proving the site's continuous sacred character",
];

const MUSLIM_ARGUMENTS = [
  "The 1968 compromise is a valid, court-decreed settlement that has maintained peace for over 50 years",
  "The Places of Worship Act, 1991 bars any alteration to the mosque's status",
  "The suits are not maintainable as they seek to relitigate a settled legal agreement",
  "The mosque is a protected structure and has operated continuously since the 17th century",
];

const SCENARIOS = [
  { scenario: "Status Quo Maintained", description: "Supreme Court upholds Places of Worship Act; surveys and suits are dismissed or suspended indefinitely", probability: "Moderate", implications: "Preserves existing coexistence; may leave underlying tensions unresolved" },
  { scenario: "Negotiated Settlement", description: "Both parties reach a new compromise, potentially involving land-sharing or structural modifications", probability: "Low", implications: "Would require extraordinary political will and community consensus" },
  { scenario: "Judicial Determination", description: "Courts rule on merits after full hearing, potentially ordering archaeological survey", probability: "Moderate–High", implications: "Could take years; outcome uncertain; sets precedent for other disputes" },
  { scenario: "Legislative Intervention", description: "Parliament amends or repeals the Places of Worship Act", probability: "Low", implications: "Highly polarizing; would open floodgates for similar claims nationwide" },
];

const KEY_VARIABLES = [
  "Supreme Court's ruling on the constitutional validity of the Places of Worship Act, 1991 — this is the single most consequential pending decision",
  "Whether the SC permits a court-monitored ASI survey of the Shahi Eidgah",
  "Political developments, particularly around national and state election cycles",
  "Community-level dialogue and interfaith engagement in Mathura",
  "Precedential impact from other similar disputes (e.g., Gyanvapi Mosque, Varanasi)",
];

const SOURCES = [
  "Archaeological Survey of India (ASI) — RTI response (February 2024) containing historical records from 1920 survey",
  "Mahabharata, Bhagavata Purana, Harivamsha, Vishnu Purana — primary Hindu scriptures on Krishna's birth narrative",
  "Al-Utbi, Tarikh-i-Yamini — contemporary account of Mahmud of Ghazni's invasion of Mathura (1018 CE)",
  "Al-Biruni, Kitab al-Hind — 11th-century documentation of Mathura as a pilgrimage center",
  "Jean Baptiste Tavernier, Travels in India (c. 1650) — description of the Bundela-era temple",
  "Allahabad High Court orders (2023–2025) — judicial proceedings in the Krishna Janmabhoomi case",
  "Supreme Court of India orders (2024–2025) — stay on survey orders and Places of Worship Act hearings",
  "Places of Worship (Special Provisions) Act, 1991 — legislative text",
  "Krishna Janmasthan Temple Complex — Wikipedia (accessed March 2026)",
  'Live History India — "Mathura and its Krishna Janmabhoomi Dispute"',
  'Outlook India — "Shahi Eidgah - Krishna Janmabhoomi Dispute: A Timeline"',
  "LiveLaw.in — Legal reporting on Supreme Court and High Court proceedings (2023–2025)",
  "Business Standard — Court rulings and ASI records coverage",
  "The Wire — Community impact reporting from Mathura",
  "Shri Krishna Janmasthan Seva Sansthan — Official trust records",
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

function QuoteBlock({ quote, author }: { quote: string; author?: string }) {
  return (
    <motion.blockquote
      className="border-l-4 border-primary/60 bg-primary/5 rounded-r-xl px-6 py-5 my-8"
      variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce}
    >
      <p className="font-serif text-lg sm:text-xl italic text-on-surface leading-relaxed">{quote}</p>
      {author && <cite className="block mt-3 text-sm font-semibold text-primary not-italic">— {author}</cite>}
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
  { id: "mythology", label: "Religious Foundations" },
  { id: "archaeology", label: "Archaeological Evidence" },
  { id: "chronology", label: "Destruction & Reconstruction" },
  { id: "modern-era", label: "Modern Era" },
  { id: "compromise", label: "1968 Compromise" },
  { id: "legal", label: "Legal Disputes" },
  { id: "socio-political", label: "Socio-Political Dynamics" },
  { id: "forward-looking", label: "Forward Assessment" },
  { id: "conclusion", label: "Conclusions" },
];

function scrollTo(hash: string) {
  const el = document.querySelector(`#${hash}`);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Structured Data ─────────────────────────────────────────────────────────

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Krishna Janmabhoomi, Mathura — Complete Research Report",
  description: "A comprehensive research report on Krishna Janmabhoomi in Mathura: history, religious significance, archaeological evidence, chronology of destruction and reconstruction, legal disputes, and socio-political dynamics.",
  author: { "@type": "Organization", name: "Build Iskcon" },
  publisher: { "@type": "Organization", name: "Build Iskcon", url: "https://buildiskcon.com" },
  datePublished: "2026-03-01",
  dateModified: "2026-03-31",
};

// ── Main Page ───────────────────────────────────────────────────────────────

export default function KrishnaJanmabhoomi() {
  return (
    <>
      <SEOHead
        title="Krishna Janmabhoomi, Mathura"
        description="A comprehensive research report on Krishna Janmabhoomi in Mathura — covering history, religious significance, archaeological evidence, the chronology of temple destruction and reconstruction, legal disputes, and socio-political dynamics."
        canonicalPath="/krishna-janmabhoomi"
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
            href="https://www.iskcon.org/donate"
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
              <ScrollText className="w-3.5 h-3.5" /> Research Report
            </motion.span>
            <motion.h1 variants={fadeInUp} className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-on-surface leading-[1.1] mb-6">
              Krishna Janmabhoomi,<br />
              <span className="text-primary">Mathura</span>
            </motion.h1>
            <motion.p variants={fadeInUp} className="text-on-surface-variant text-base sm:text-lg md:text-xl leading-relaxed max-w-3xl mb-8">
              History, significance, legal disputes & socio-political dynamics of one of Hinduism's holiest sites — the believed birthplace of Lord Krishna.
            </motion.p>
            <motion.div variants={fadeInUp} className="flex flex-wrap gap-3 text-xs text-on-surface-variant">
              <span className="px-3 py-1.5 rounded-full bg-surface-variant/50 flex items-center gap-1.5"><MapPin className="w-3 h-3" /> Mathura, Uttar Pradesh</span>
              <span className="px-3 py-1.5 rounded-full bg-surface-variant/50 flex items-center gap-1.5"><Calendar className="w-3 h-3" /> March 2026</span>
              <span className="px-3 py-1.5 rounded-full bg-surface-variant/50">10 Chapters</span>
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
                  Krishna Janmabhoomi in Mathura, Uttar Pradesh, is one of the most historically significant and legally contested religious sites in India. Believed by Hindus to be the exact birthplace of Lord Krishna, the site has been a focal point of devotion, destruction, reconstruction, and dispute for over two millennia. The site today comprises the <strong className="text-on-surface">Krishna Janmasthan Temple Complex</strong> and the <strong className="text-on-surface">Shahi Eidgah Mosque</strong>, standing adjacent to each other — a physical embodiment of India's layered religious and political history.
                </p>
                <p>
                  This report presents a comprehensive, evidence-based analysis of the site across six dimensions: mythological and religious foundations, archaeological and historical evidence, the chronology of destruction and reconstruction, the modern legal and institutional framework, the current socio-political dynamics, and a forward-looking assessment of the dispute's trajectory.
                </p>
              </motion.div>

              <KeyInsight>
                <strong>Key Finding:</strong> The site has witnessed at least four major episodes of temple destruction over a millennium (1018, 14th century, early 16th century, and 1670 CE), each followed by reconstruction, reflecting both the site's enduring religious significance and its vulnerability to political power shifts.
              </KeyInsight>

              {/* Situation at a Glance */}
              <motion.div className="overflow-x-auto rounded-xl border border-outline-variant/15 bg-white mt-8" variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-primary/5 border-b border-outline-variant/10">
                      <th className="text-left px-4 py-3 font-bold text-on-surface w-44">Dimension</th>
                      <th className="text-left px-4 py-3 font-bold text-on-surface">Key Facts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SITUATION_AT_GLANCE.map((row) => (
                      <tr key={row.dimension} className="border-b border-outline-variant/5 hover:bg-primary/3 transition-colors">
                        <td className="px-4 py-3 font-semibold text-on-surface">{row.dimension}</td>
                        <td className="px-4 py-3 text-on-surface-variant">{row.facts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </motion.div>
            </section>

            {/* 2. Mythological and Religious Foundations */}
            <section className="mb-20">
              <SectionHeading
                id="mythology" icon={BookOpen} label="Chapter 2"
                title="Mythological and Religious Foundations"
                subtitle="The birth narrative of Lord Krishna and the theological basis for identifying this site as the sacred Janmabhoomi."
              />

              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="space-y-4 text-on-surface-variant text-sm sm:text-base leading-relaxed mb-8">
                <h3 className="font-serif text-xl font-bold text-on-surface">2.1 The Birth of Lord Krishna</h3>
                <p>
                  According to the <em>Mahabharata</em>, the <em>Bhagavata Purana</em>, the <em>Harivamsha</em>, and the <em>Vishnu Purana</em>, Lord Krishna was born in the city of Mathura to Devaki and Vasudeva. The birth is traditionally dated to approximately <strong className="text-on-surface">3228 BCE</strong> in Hindu chronology, corresponding to the end of the Dvapara Yuga.
                </p>
                <p>
                  Kamsa, the tyrannical king of Mathura and maternal uncle of Krishna, had imprisoned Devaki and Vasudeva after receiving a prophecy that Devaki's eighth son would be his slayer. When Krishna was born at midnight on Ashtami (the eighth day of the dark fortnight of Bhadrapada), divine miracles unfolded: the prison doors opened of their own accord, the guards fell into deep slumber, and Vasudeva carried the newborn across the flooded Yamuna River to Gokul.
                </p>
              </motion.div>

              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="space-y-4 text-on-surface-variant text-sm sm:text-base leading-relaxed mb-8">
                <h3 className="font-serif text-xl font-bold text-on-surface">2.2 Why It Is Called "Krishna Janmabhoomi"</h3>
                <p>
                  The term <strong className="text-on-surface">"Janmabhoomi"</strong> literally translates to "birthplace" or "birth-land" in Sanskrit. The site is specifically called Krishna Janmabhoomi because Hindu tradition identifies the underground cell (now the <strong className="text-on-surface">Garbha Griha</strong> shrine) as the exact location of the prison where Krishna was born. The Garbha Griha, situated against the rear wall of the Shahi Eidgah, contains a marble pavilion and an underground cell with a shrine to Yogmaya (the eight-armed goddess). This identification has been maintained in unbroken religious memory for centuries and is corroborated by literary, epigraphic, and archaeological sources.
                </p>
              </motion.div>

              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="space-y-4 text-on-surface-variant text-sm sm:text-base leading-relaxed">
                <h3 className="font-serif text-xl font-bold text-on-surface">2.3 Significance in Hindu Theology</h3>
                <p>Krishna, as the eighth avatar of Vishnu and the speaker of the Bhagavad Gita, occupies a central place in Hindu worship. The site's importance extends beyond mere historical interest — it is a living pilgrimage center (<em>tirtha</em>) where devotees believe the divine literally manifested in the material world.</p>
                <ul className="list-disc pl-6 space-y-1.5">
                  <li>One of the <strong className="text-on-surface">seven sacred cities (Sapta Puri)</strong> of Hinduism, Mathura is venerated as Krishna's birthplace</li>
                  <li>The site anchors the broader <strong className="text-on-surface">Braj region</strong> pilgrimage circuit, which includes Vrindavan, Gokul, Govardhan, and Barsana</li>
                  <li><strong className="text-on-surface">Janmashtami</strong>, the festival celebrating Krishna's birth, draws millions of devotees to Mathura annually</li>
                  <li>The <em>Bhagavata Purana</em> describes Mathura as a place where the earth itself is sacred, charged with the divine presence of Krishna</li>
                </ul>
              </motion.div>
            </section>

            {/* 3. Archaeological Evidence */}
            <section className="mb-20">
              <SectionHeading
                id="archaeology" icon={Landmark} label="Chapter 3"
                title="Archaeological and Historical Evidence"
                subtitle="From 6th century BCE artifacts to ASI records confirming the temple's existence and demolition."
              />

              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="space-y-4 text-on-surface-variant text-sm sm:text-base leading-relaxed mb-8">
                <h3 className="font-serif text-xl font-bold text-on-surface">3.1 Pre-Historic and Early Historic Period</h3>
                <p>
                  Archaeological excavations at the Katra Keshavdeva mound have yielded artifacts dating back to the <strong className="text-on-surface">6th century BCE</strong>, including pottery, terracotta figurines, and structural remains indicating continuous human habitation and religious activity. The site also yielded Jain sculptures and evidence of a substantial Buddhist complex called <strong className="text-on-surface">Yasha Vihara</strong>, demonstrating its multi-religious significance in ancient India.
                </p>
                <p>
                  The earliest textual reference to Krishna worship at Mathura comes from Greek writers <strong className="text-on-surface">Megasthenes and Arrian</strong>, who documented the worship of "Heracles" (identified with Krishna) during the Mauryan period (4th–3rd century BCE). Numismatic evidence from the Indo-Scythian and Kushana periods confirms that Bhagavatism (worship of Krishna as Vasudeva) thrived at Mathura.
                </p>
              </motion.div>

              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="space-y-4 text-on-surface-variant text-sm sm:text-base leading-relaxed mb-8">
                <h3 className="font-serif text-xl font-bold text-on-surface">3.2 Classical Period: The Gupta Temple</h3>
                <p>
                  The first major temple construction at the site is attributed to <strong className="text-on-surface">Vajranabha</strong>, Krishna's great-grandson, according to Hindu tradition. More reliably, Emperor <strong className="text-on-surface">Chandragupta II (Vikramaditya)</strong> of the Gupta Dynasty constructed a magnificent temple complex around <strong className="text-on-surface">400 CE</strong>, establishing Mathura as one of the premier centers of Hindu worship. Late 8th-century inscriptions document donations by Rashtrakuta rulers to the temple, confirming its continued importance.
                </p>
              </motion.div>

              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="space-y-4 text-on-surface-variant text-sm sm:text-base leading-relaxed">
                <h3 className="font-serif text-xl font-bold text-on-surface">3.3 ASI Records and Modern Archaeological Evidence</h3>
                <p>
                  In February 2024, the Archaeological Survey of India (ASI), responding to an RTI query, provided historical records from <strong className="text-on-surface">1920</strong> confirming the demolition of the Keshavdeva temple by Mughal Emperor Aurangzeb. The ASI's survey records listed the Krishna Janmabhoomi temple complex at <strong className="text-on-surface">number 37</strong> among a group of 39 monuments in Mathura.
                </p>
              </motion.div>

              <KeyInsight>
                <strong>ASI Evidence:</strong> The Archaeological Survey of India's 1920 records confirm the existence and subsequent Mughal-era demolition of the Keshavdeva temple, providing an official institutional basis for the historical claims made by Hindu petitioners.
              </KeyInsight>
            </section>

            {/* 4. Chronology of Destruction */}
            <section className="mb-20">
              <SectionHeading
                id="chronology" icon={Calendar} label="Chapter 4"
                title="Chronology of Destruction and Reconstruction"
                subtitle="A cyclical pattern spanning over a thousand years — construction, destruction by invading forces, and rebuilding."
              />

              <motion.div className="overflow-x-auto rounded-xl border border-outline-variant/15 bg-white mb-10" variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-primary/5 border-b border-outline-variant/10">
                      <th className="text-left px-4 py-3 font-bold text-on-surface w-36">Period / Date</th>
                      <th className="text-left px-4 py-3 font-bold text-on-surface">Event</th>
                      <th className="text-left px-4 py-3 font-bold text-on-surface hidden md:table-cell">Key Actors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DESTRUCTION_TIMELINE.map((row, i) => (
                      <tr key={i} className="border-b border-outline-variant/5 hover:bg-primary/3 transition-colors">
                        <td className="px-4 py-3 font-semibold text-primary whitespace-nowrap">{row.period}</td>
                        <td className="px-4 py-3 text-on-surface-variant">{row.event}</td>
                        <td className="px-4 py-3 text-on-surface-variant hidden md:table-cell">{row.actors}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </motion.div>

              {/* Mahmud of Ghazni */}
              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="space-y-4 text-on-surface-variant text-sm sm:text-base leading-relaxed mb-10">
                <h3 className="font-serif text-xl font-bold text-on-surface">4.2 The Mahmud of Ghazni Invasion (1017–1018 CE)</h3>
                <p>
                  The most devastating pre-modern assault on Mathura. The chronicler <strong className="text-on-surface">Al-Utbi</strong> recorded that Mahmud's forces remained in Mathura for approximately 20 days, during which <em>"the city suffered greatly from fire, besides the damage inflicted by pillage."</em> Al-Utbi described the principal temple as being of such magnificence that reconstructing it <em>"would not be able to do it without expending an hundred thousand red dinars."</em>
                </p>
                <p>
                  The invaders broke up multiple statues, including a large golden image weighing approximately <strong className="text-on-surface">456 kilograms</strong>, and carried away a sapphire weighing about <strong className="text-on-surface">2.09 kilograms</strong>. However, the resilience of the worshipping community is evidenced by Al-Biruni's subsequent mention of Mathura as one of India's foremost pilgrimage centers, <em>"crowded with Brahmins."</em>
                </p>
              </motion.div>

              {/* Bundela Temple */}
              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="space-y-4 text-on-surface-variant text-sm sm:text-base leading-relaxed mb-10">
                <h3 className="font-serif text-xl font-bold text-on-surface">4.3 The Bundela Temple and Tavernier's Account (1618–1670 CE)</h3>
                <p>
                  <strong className="text-on-surface">Raja Veer Singh Deva Bundela</strong>, with permission from Mughal Emperor Jahangir, constructed a grand new temple at the site in 1618. French merchant-traveler <strong className="text-on-surface">Jean Baptiste Tavernier</strong> visited Mathura around 1650 and described it as <em>"one of the most sumptuous edifices in all India"</em> with an octagonal structure built in red sandstone, visible from <em>"five or six kos"</em> (approximately 11 kilometers) away. Mughal prince <strong className="text-on-surface">Dara Shikoh</strong> patronized the temple, donating a stone railing.
                </p>
              </motion.div>

              {/* Aurangzeb */}
              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="space-y-4 text-on-surface-variant text-sm sm:text-base leading-relaxed">
                <h3 className="font-serif text-xl font-bold text-on-surface">4.4 Aurangzeb's Destruction and the Shahi Eidgah (1669–1670 CE)</h3>
                <p>
                  In 1669, Emperor Aurangzeb issued orders for the destruction of the Keshavdeva temple, part of a broader campaign that also affected the Vishwanath Temple in Varanasi. The destruction occurred in the context of suppressing a <strong className="text-on-surface">Jat revolt led by Gokul in 1669</strong>. A mosque, the Shahi Eidgah, was constructed on the site of the temple's <em>mandapa</em> (public ritual pavilion).
                </p>
              </motion.div>

              <KeyInsight>
                <strong>Architectural Note:</strong> The Shahi Eidgah was built on the site of the temple's <em>mandapa</em> (pavilion for public rituals), while the actual <em>garbha griha</em> (birth-cell sanctum) survived and stands adjacent to the mosque's rear wall — a crucial detail in the ongoing legal proceedings.
              </KeyInsight>
            </section>

            {/* 5. Modern Era */}
            <section className="mb-20">
              <SectionHeading
                id="modern-era" icon={Landmark} label="Chapter 5"
                title="Modern Era: Land Acquisition, Trust Formation & Temple Reconstruction"
              />

              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="space-y-4 text-on-surface-variant text-sm sm:text-base leading-relaxed mb-8">
                <h3 className="font-serif text-xl font-bold text-on-surface">5.1 British Colonial Period and Land Records</h3>
                <p>Following the British conquest of the region in 1804, the East India Company auctioned <strong className="text-on-surface">5.41 hectares (13.37 acres)</strong> of Katra land in 1807. The land was purchased by <strong className="text-on-surface">Raja Patnimal</strong>, a wealthy banker from Banaras, for Rs 1,410. His descendant, Rai Krishna Das, successfully defended ownership claims at the Allahabad High Court in 1935.</p>
              </motion.div>

              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="space-y-4 text-on-surface-variant text-sm sm:text-base leading-relaxed mb-8">
                <h3 className="font-serif text-xl font-bold text-on-surface">5.2 Malaviya-Birla Acquisition (1944)</h3>
                <p><strong className="text-on-surface">Pandit Madan Mohan Malaviya</strong> acquired the entire Katra Keshavdeva land on February 7, 1944, at a cost of Rs 13,000, with financial support from industrialist <strong className="text-on-surface">Jugal Kishore Birla</strong>.</p>
              </motion.div>

              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="space-y-4 text-on-surface-variant text-sm sm:text-base leading-relaxed mb-8">
                <h3 className="font-serif text-xl font-bold text-on-surface">5.3 Trust Formation and Temple Construction</h3>
                <p>Birla established the <strong className="text-on-surface">Shri Krishna Janmasthan Seva Sansthan</strong> on February 21, 1951. Construction commenced in October 1953. The Keshavdeva Temple was inaugurated on <strong className="text-on-surface">September 6, 1958</strong>, by Hanuman Prasad Poddar. The full complex was completed in February 1982.</p>
              </motion.div>

              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce}>
                <h3 className="font-serif text-xl font-bold text-on-surface mb-4">5.4 Current Temple Complex</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { title: "Keshavdeva Temple", desc: "Constructed south of the Shahi Eidgah, this is the main temple dedicated to Lord Krishna, inaugurated in 1958." },
                    { title: "Garbha Griha (Birth Shrine)", desc: "Located against the Eidgah's rear wall. Features a marble pavilion above and an underground cell with a shrine to Yogmaya. The most sacred spot in the complex." },
                    { title: "Bhagavata Bhavan", desc: "The largest structure, housing five shrines with 180-cm statues of Radha-Krishna, Balarama, Subhadra, Jagannatha, Rama, Lakshmana, Sita, Durga, and a Shivalinga." },
                    { title: "Potra Kund", desc: "A stepped water tank where Krishna is believed to have received his first bath after birth. Current steps constructed by Mahadji Scindia in 1782." },
                  ].map((item) => (
                    <motion.div key={item.title} variants={fadeInUp} className="bg-white rounded-xl border border-outline-variant/15 p-5">
                      <h4 className="font-bold text-sm text-on-surface mb-2">{item.title}</h4>
                      <p className="text-xs text-on-surface-variant leading-relaxed">{item.desc}</p>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </section>

            {/* 6. 1968 Compromise */}
            <section className="mb-20">
              <SectionHeading
                id="compromise" icon={Shield} label="Chapter 6"
                title="The 1968 Compromise Agreement"
                subtitle="The negotiated settlement that governed coexistence of the temple and mosque for over 50 years."
              />

              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="space-y-4 text-on-surface-variant text-sm sm:text-base leading-relaxed mb-8">
                <p>On <strong className="text-on-surface">October 12, 1968</strong>, Deodhar Shastri of the Shri Krishna Janmasthan Seva Sansthan and Shah Mir Malih and Abdul Ghaffar, representing the Shahi Masjid Idgah Trust, signed a formal compromise agreement. The compromise was subsequently formalized through a court decree, giving it legal standing.</p>
              </motion.div>

              <motion.div className="bg-white rounded-xl border border-outline-variant/15 p-6 mb-8" variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce}>
                <h4 className="font-bold text-sm text-on-surface mb-4">Terms of the Agreement</h4>
                <ul className="space-y-3 text-sm text-on-surface-variant">
                  {COMPROMISE_TERMS.map((term, i) => (
                    <li key={i} className="flex gap-2">
                      <ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span>{term}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>

              <KeyInsight>
                <strong>The 1968 Compromise:</strong> For over 50 years, this agreement maintained peaceful coexistence. Its current legal challenge marks the central axis of the ongoing dispute.
              </KeyInsight>
            </section>

            {/* 7. Legal Framework */}
            <section className="mb-20">
              <SectionHeading
                id="legal" icon={Gavel} label="Chapter 7"
                title="Legal Framework and Ongoing Disputes"
              />

              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="space-y-4 text-on-surface-variant text-sm sm:text-base leading-relaxed mb-8">
                <h3 className="font-serif text-xl font-bold text-on-surface">7.1 The Places of Worship (Special Provisions) Act, 1991</h3>
                <p>The primary legal framework governing the dispute:</p>
                <ul className="list-disc pl-6 space-y-1.5">
                  <li><strong className="text-on-surface">Section 3:</strong> Prohibits conversion of any place of worship from one religious denomination to another</li>
                  <li><strong className="text-on-surface">Section 4(1):</strong> Declares that the religious character shall continue to be the same as it existed on August 15, 1947</li>
                  <li><strong className="text-on-surface">Section 4(2):</strong> Bars any legal proceedings for converting the religious character of any place of worship</li>
                  <li><strong className="text-on-surface">Section 5:</strong> Expressly exempts the Ram Janmabhoomi-Babri Masjid case from the Act's application</li>
                </ul>
              </motion.div>

              {/* Legal Timeline */}
              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="mb-10">
                <h3 className="font-serif text-xl font-bold text-on-surface mb-4">7.2 Timeline of Modern Legal Proceedings</h3>
                <div className="overflow-x-auto rounded-xl border border-outline-variant/15 bg-white">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-primary/5 border-b border-outline-variant/10">
                        <th className="text-left px-4 py-3 font-bold text-on-surface w-28">Date</th>
                        <th className="text-left px-4 py-3 font-bold text-on-surface">Event</th>
                        <th className="text-left px-4 py-3 font-bold text-on-surface hidden sm:table-cell w-44">Forum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {LEGAL_TIMELINE.map((row, i) => (
                        <tr key={i} className="border-b border-outline-variant/5 hover:bg-primary/3 transition-colors">
                          <td className="px-4 py-3 font-semibold text-primary whitespace-nowrap">{row.date}</td>
                          <td className="px-4 py-3 text-on-surface-variant">{row.event}</td>
                          <td className="px-4 py-3 text-on-surface-variant hidden sm:table-cell">{row.forum}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>

              {/* Arguments */}
              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="mb-8">
                <h3 className="font-serif text-xl font-bold text-on-surface mb-4">7.3 Key Legal Arguments</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white rounded-xl border border-outline-variant/15 p-5">
                    <h4 className="font-bold text-sm text-on-surface mb-3">Hindu Petitioners' Arguments</h4>
                    <ul className="space-y-2 text-sm text-on-surface-variant">
                      {HINDU_ARGUMENTS.map((arg, i) => (
                        <li key={i} className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />{arg}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="bg-white rounded-xl border border-outline-variant/15 p-5">
                    <h4 className="font-bold text-sm text-on-surface mb-3">Muslim Side's Arguments</h4>
                    <ul className="space-y-2 text-sm text-on-surface-variant">
                      {MUSLIM_ARGUMENTS.map((arg, i) => (
                        <li key={i} className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />{arg}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </motion.div>

              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="text-on-surface-variant text-sm sm:text-base leading-relaxed">
                <h3 className="font-serif text-xl font-bold text-on-surface mb-4">7.4 The ASI Impleadment Issue</h3>
                <p>In 2025, the Allahabad High Court allowed the Hindu petitioners' application to implead the <strong className="text-on-surface">Archaeological Survey of India (ASI)</strong> and the <strong className="text-on-surface">Union of India</strong> as parties to the suit. The Supreme Court, hearing the mosque committee's challenge, observed that the HC order appeared <em>"prima facie correct."</em> This development is significant because ASI involvement could lead to formal archaeological examination of the site.</p>
              </motion.div>
            </section>

            {/* 8. Socio-Political Dynamics */}
            <section className="mb-20">
              <SectionHeading
                id="socio-political" icon={Users} label="Chapter 8"
                title="Socio-Political Dynamics and Community Impact"
              />

              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="space-y-4 text-on-surface-variant text-sm sm:text-base leading-relaxed mb-8">
                <h3 className="font-serif text-xl font-bold text-on-surface">8.1 The Ayodhya Precedent</h3>
                <p>The November 2019 Supreme Court verdict granting the disputed Ayodhya site to the Hindu side emboldened similar claims at other contested sites. A political slogan — <em>"Ayodhya toh jhanki hai, Kashi-Mathura baaki hai"</em> (Ayodhya is just the beginning; Kashi and Mathura remain) — gained traction among Hindu nationalist groups.</p>
              </motion.div>

              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="space-y-4 text-on-surface-variant text-sm sm:text-base leading-relaxed mb-8">
                <h3 className="font-serif text-xl font-bold text-on-surface">8.2 Impact on Mathura's Muslim Community</h3>
                <p>The politicization of the Janmabhoomi dispute has created anxiety within the local Muslim community. Since the Ayodhya verdict, Muslims in Mathura have expressed concern that the legal and political mobilization around the Eidgah could affect their daily lives and community standing.</p>
              </motion.div>

              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="space-y-4 text-on-surface-variant text-sm sm:text-base leading-relaxed mb-8">
                <h3 className="font-serif text-xl font-bold text-on-surface">8.3 Shift in Conflict Resolution Approaches</h3>
                <p>In contrast to the mass mobilization of the 1980s and 1990s, Muslim scholars, clergy, and community leaders now emphasize reliance on <strong className="text-on-surface">legal processes</strong> rather than political agitation. This reflects lessons learned from the Ayodhya experience.</p>
              </motion.div>

              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="space-y-4 text-on-surface-variant text-sm sm:text-base leading-relaxed mb-8">
                <h3 className="font-serif text-xl font-bold text-on-surface">8.4 Political Dimensions</h3>
                <p>The dispute reflects broader tensions between the imperative of preserving India's secular legal framework (as embodied in the Places of Worship Act) and the demands of religious sentiment and historical grievance. It surfaces prominently during election cycles.</p>
              </motion.div>

              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="space-y-4 text-on-surface-variant text-sm sm:text-base leading-relaxed">
                <h3 className="font-serif text-xl font-bold text-on-surface">8.5 Economic and Tourism Impact</h3>
                <p>Mathura's economy is significantly intertwined with religious tourism. The Krishna Janmasthan Temple Complex draws an estimated <strong className="text-on-surface">10–15 million pilgrims annually</strong>. The broader Braj region pilgrimage circuit generates substantial economic activity. Any resolution (or escalation) of the dispute would have material implications for the region's economy.</p>
              </motion.div>
            </section>

            {/* 9. Forward-Looking Assessment */}
            <section className="mb-20">
              <SectionHeading
                id="forward-looking" icon={Globe} label="Chapter 9"
                title="Forward-Looking Assessment"
              />

              <motion.div className="overflow-x-auto rounded-xl border border-outline-variant/15 bg-white mb-8" variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-primary/5 border-b border-outline-variant/10">
                      <th className="text-left px-4 py-3 font-bold text-on-surface">Scenario</th>
                      <th className="text-left px-4 py-3 font-bold text-on-surface hidden sm:table-cell">Description</th>
                      <th className="text-left px-4 py-3 font-bold text-on-surface w-28">Probability</th>
                      <th className="text-left px-4 py-3 font-bold text-on-surface hidden md:table-cell">Implications</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SCENARIOS.map((row) => (
                      <tr key={row.scenario} className="border-b border-outline-variant/5 hover:bg-primary/3 transition-colors">
                        <td className="px-4 py-3 font-semibold text-on-surface">{row.scenario}</td>
                        <td className="px-4 py-3 text-on-surface-variant hidden sm:table-cell">{row.description}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${
                            row.probability === "Low" ? "bg-green-100 text-green-700" :
                            row.probability === "Moderate" ? "bg-amber-100 text-amber-700" :
                            "bg-red-100 text-red-700"
                          }`}>{row.probability}</span>
                        </td>
                        <td className="px-4 py-3 text-on-surface-variant hidden md:table-cell">{row.implications}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </motion.div>

              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce}>
                <h3 className="font-serif text-xl font-bold text-on-surface mb-4">Key Variables to Monitor</h3>
                <div className="bg-white rounded-xl border border-outline-variant/15 p-5">
                  <ul className="space-y-2 text-sm text-on-surface-variant">
                    {KEY_VARIABLES.map((v, i) => (
                      <li key={i} className="flex gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />{v}</li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            </section>

            {/* 10. Conclusions */}
            <section className="mb-20">
              <SectionHeading id="conclusion" icon={BookOpen} label="Chapter 10" title="Conclusions" />

              <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={viewportOnce} className="space-y-4 text-on-surface-variant text-sm sm:text-base leading-relaxed">
                <p>
                  Krishna Janmabhoomi in Mathura represents one of the most complex intersections of religion, history, law, and politics in contemporary India. The site's significance is layered: it is simultaneously a <strong className="text-on-surface">living center of devotion</strong> for hundreds of millions of Hindus, a site of <strong className="text-on-surface">documented historical violence and reconstruction</strong>, a <strong className="text-on-surface">legal battleground</strong> testing the limits of India's secular constitutional framework, and a <strong className="text-on-surface">barometer of Hindu-Muslim relations</strong> in northern India.
                </p>
                <p>
                  The historical record is clear that a significant Hindu temple existed at the site for centuries before its demolition by Aurangzeb in 1670 and the construction of the Shahi Eidgah. The archaeological and literary evidence supporting this is substantial and has been acknowledged by institutions including the ASI. At the same time, the mosque has stood for over 350 years and is protected under the Places of Worship Act, 1991.
                </p>
                <p>
                  The resolution of this dispute will be determined primarily by the Indian judiciary, with the Supreme Court's pending decision on the Places of Worship Act serving as the decisive legal variable. Whatever the outcome, its implications will extend far beyond Mathura, shaping how India navigates the tension between historical claims and constitutional principle for decades to come.
                </p>
              </motion.div>

              <KeyInsight>
                The Krishna Janmabhoomi case is not merely a local dispute — it is a bellwether for India's approach to reconciling religious heritage with secular governance. Its resolution will set precedents affecting numerous contested sites nationwide.
              </KeyInsight>
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
              <h2 className="font-serif text-2xl sm:text-3xl font-black text-on-surface mb-4">Explore ISKCON Temple Projects</h2>
              <p className="text-on-surface-variant text-sm sm:text-base max-w-xl mx-auto mb-6">
                Discover active ISKCON temple construction projects worldwide and learn how sacred temples are being built for future generations.
              </p>
              <div className="flex flex-wrap gap-4 justify-center">
                <a href="/" className="inline-flex items-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-xl font-bold text-sm tracking-wide hover:bg-primary/90 transition-all active:scale-95">
                  View All Projects <ArrowLeft className="w-4 h-4 rotate-180" />
                </a>
                <a href="/how-to-build-temple" className="inline-flex items-center gap-2 border-2 border-primary/40 text-primary px-6 py-3 rounded-xl font-bold text-sm tracking-wide hover:bg-primary/5 transition-all active:scale-95">
                  How to Build a Temple <ArrowLeft className="w-4 h-4 rotate-180" />
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
              <a href="/"><div className="font-serif text-lg font-black text-primary uppercase tracking-wider mb-2">Build Iskcon</div></a>
              <p className="text-white/60 font-sans text-xs font-medium leading-relaxed max-w-sm">Tracking ISKCON's global temple construction mission — town by town, continent by continent.</p>
            </div>
            <div className="flex gap-8">
              <div className="flex flex-col gap-3">
                <span className="font-sans text-[10px] uppercase tracking-[0.15em] font-bold text-primary mb-1">Explore</span>
                <a href="/" className="text-white/70 hover:text-primary text-xs font-medium transition-colors">Home</a>
                <a href="/how-to-build-temple" className="text-white/70 hover:text-primary text-xs font-medium transition-colors">How to Build</a>
                <a href="/krishna-janmabhoomi" className="text-white/70 hover:text-primary text-xs font-medium transition-colors">Krishna Janmabhoomi</a>
              </div>
              <div className="flex flex-col gap-3">
                <span className="font-sans text-[10px] uppercase tracking-[0.15em] font-bold text-primary mb-1">Give</span>
                <a href="https://www.iskcon.org/donate" target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-primary text-xs font-medium transition-colors">Donate to ISKCON</a>
                <a href="https://tovp.org/donate/" target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-primary text-xs font-medium transition-colors">Donate to TOVP</a>
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 px-6 sm:px-12 py-5 max-w-screen-2xl mx-auto">
          <p className="text-white/40 font-sans text-[10px] tracking-wide font-medium">&copy; {new Date().getFullYear()} Build Iskcon — Global Temple Construction Intelligence. An independent initiative tracking ISKCON's global construction mission.</p>
        </div>
      </footer>
    </>
  );
}
