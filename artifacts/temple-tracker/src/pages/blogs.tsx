import { motion } from "framer-motion";
import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { fadeInUp, staggerContainer, viewportOnce } from "@/lib/animations";
import { Link, useParams } from "wouter";
import { ArrowLeft, ArrowRight, Clock, User, Tag, ChevronRight } from "lucide-react";

interface BlogBlock {
  type: "p" | "h2" | "blockquote";
  text: string;
}

interface Blog {
  slug: string;
  title: string;
  subtitle: string;
  author: string;
  authorRole: string;
  date: string;
  readTime: string;
  category: string;
  body: BlogBlock[];
  relatedSlugs: string[];
}

export const BLOGS: Blog[] = [
  {
    slug: "iskcon-temple-construction-merging-devotion-with-design",
    title: "ISKCON Temple Construction: Merging Devotion with Design",
    subtitle: "How sacred geometry, traditional architecture, and modern engineering converge in ISKCON's global temple-building mission.",
    author: "Govinda Dasa",
    authorRole: "Temple Architecture Correspondent",
    date: "March 15, 2026",
    readTime: "12 min read",
    category: "Architecture",
    body: [
      { type: "p", text: "The construction of an ISKCON temple is far more than an exercise in civil engineering. It is a spiritual endeavour that seeks to manifest the divine on Earth — a place where the transcendental pastimes of Sri Krishna can be experienced by every visitor who crosses the threshold. From Mayapur's Temple of the Vedic Planetarium to the upcoming centres in Corcoran, Minnesota and Dumdum, Kolkata, each project follows a design philosophy that harmonises Vedic principles with contemporary building science." },
      { type: "h2", text: "Sacred Geometry: The Blueprint of the Cosmos" },
      { type: "p", text: "Vedic temple architecture is rooted in the Vastu Shastra and Shilpa Shastra — ancient treatises that prescribe precise proportions, orientations, and spatial relationships for sacred structures. The mandala, a geometric diagram representing the cosmos, serves as the foundational plan. Every ISKCON temple begins with the Vastu Purusha Mandala, a grid that maps the cosmic order onto the building's footprint. The sanctum sanctorum (garbhagriha) sits at the Brahmasthana — the spiritual centre of the grid — ensuring that the deity's placement resonates with cosmic harmony." },
      { type: "p", text: "The proportional system extends to every detail: column heights follow the ratio of the human body to the cosmos, dome curvatures mirror the celestial sphere, and entrance thresholds are aligned with cardinal directions to channel prana (life energy). In the TOVP, this system operates at a monumental scale — the 340-foot dome is calibrated to echo the curvature described in the Surya Siddhanta, a 5th-century astronomical text." },
      { type: "h2", text: "Traditional Architecture Styles" },
      { type: "p", text: "ISKCON's global portfolio draws from three major temple architecture traditions. The Nagara style, dominant in North India, features a towering shikhara (spire) with a curvilinear profile, as seen in the Vrindavan Chandrodaya Mandir. The Dravida style of South India employs a pyramidal vimana with horizontal tiers, influencing temples in Chennai and Bengaluru. The Vesara style, a hybrid found in the Deccan, blends elements of both and can be seen in ISKCON's Pune and Hyderabad projects." },
      { type: "p", text: "Srila Prabhupada himself gave clear directives about temple aesthetics. He insisted that ISKCON temples should be 'first-class' — not merely functional halls but awe-inspiring structures that draw people through their beauty. His instruction that temples should be 'like palaces for Krishna' has guided every major project since the movement's founding in 1966." },
      { type: "blockquote", text: "\"If you build a nice temple, people will come. And if they come to the temple, they will hear about Krishna. That is our method of preaching.\" — Srila Prabhupada, 1972 lecture in Los Angeles" },
      { type: "h2", text: "Modern Engineering Meets Ancient Wisdom" },
      { type: "p", text: "While the form language is rooted in tradition, the structural systems powering today's ISKCON temples are thoroughly modern. The TOVP employs a reinforced concrete shell with post-tensioned beams capable of spanning the 120-metre-wide planetarium hall without interior columns. Seismic isolators protect the Vrindavan Chandrodaya Mandir — designed to withstand Zone IV earthquakes while preserving the delicate stone carvings of the shikhara." },
      { type: "p", text: "Building Information Modelling (BIM) is now standard across major projects, allowing architects to simulate structural loads, daylighting, and acoustics before a single brick is laid. The Dumdum Vedic Cultural Centre in Kolkata uses parametric modelling to optimise its lotus-inspired facade panels, each uniquely curved yet manufactured with CNC precision from glass-fibre reinforced concrete (GFRC)." },
      { type: "h2", text: "Prabhupada's Vision: A Temple in Every Town" },
      { type: "p", text: "The scale of ISKCON's construction ambition is directly traceable to the Founder-Acharya's vision. Prabhupada envisioned not just grand flagship temples but a network spanning 'every town and village' — a prophecy rooted in Lord Chaitanya Mahaprabhu's prediction. The current portfolio of 17 tracked projects represents the most ambitious building phase in ISKCON's history, with a combined investment exceeding $780 million." },
      { type: "p", text: "Each temple is more than a worship hall. Modern ISKCON centres integrate Govinda's restaurants, Bhaktivedanta libraries, gurukula schools, cow protection facilities, and community auditoriums. The temple becomes a complete cultural ecosystem — a self-sustaining mandala of devotional service that fulfils Prabhupada's instruction to 'make a model of the spiritual world.'" },
    ],
    relatedSlugs: ["temple-donation-tax-exemption", "iskcon-vision-2051"],
  },
  {
    slug: "temple-donation-tax-exemption",
    title: "Temple Donations & Tax Benefits: What Every Devotee Should Know",
    subtitle: "A practical guide to 80G exemptions, US 501(c)(3) deductions, and international donation channels for ISKCON temple projects.",
    author: "Radha Mohan Das",
    authorRole: "Finance & Compliance Advisor",
    date: "March 8, 2026",
    readTime: "8 min read",
    category: "Finance",
    body: [
      { type: "p", text: "Donating to ISKCON temple construction projects is not only an act of devotion but also a prudent financial decision. In India, contributions to registered ISKCON trusts qualify for deductions under Section 80G of the Income Tax Act, allowing donors to reduce their taxable income by up to 50% of the donated amount. In the United States, ISKCON entities are registered as 501(c)(3) organisations, making all donations fully tax-deductible." },
      { type: "h2", text: "Understanding 80G Exemptions in India" },
      { type: "p", text: "The 80G exemption applies to donations made to approved charitable institutions. Most ISKCON temples in India hold valid 80G registration, meaning your donation receipt can be claimed as a deduction when filing your Income Tax Return. The key requirement is that the donation must be made via cheque, bank transfer, or digital payment — cash donations above ₹2,000 are not eligible for the exemption." },
      { type: "h2", text: "International Donation Channels" },
      { type: "p", text: "For devotees outside India, ISKCON operates dedicated donation portals through local charitable entities. The TOVP Foundation in the US, ISKCON UK Charity, and ISKCON Australia all provide tax-deductible receipts under their respective country's tax laws. Cross-border donations can also be made through the ISKCON Foundation, which coordinates with local temples to ensure funds reach the intended project." },
      { type: "blockquote", text: "\"Every brick you donate becomes a step toward Goloka Vrindavan. The Lord personally accepts the service of those who build His house.\" — HH Jayapataka Swami" },
      { type: "p", text: "When planning your donations, consider spreading contributions across financial years to maximise tax benefits. Many devotees set up monthly standing instructions that provide steady funding to temple projects while distributing their tax deductions optimally." },
    ],
    relatedSlugs: ["iskcon-temple-construction-merging-devotion-with-design", "seva-through-prasadam"],
  },
  {
    slug: "seva-through-prasadam",
    title: "Seva Through Prasadam: How Temple Kitchens Feed Millions",
    subtitle: "Inside ISKCON's Annadana programme — the largest vegetarian food relief network on the planet.",
    author: "Yamuna Devi Dasi",
    authorRole: "Prasadam Distribution Coordinator",
    date: "February 28, 2026",
    readTime: "7 min read",
    category: "Seva",
    body: [
      { type: "p", text: "Every ISKCON temple is, at its heart, a kitchen. The tradition of honouring prasadam — sanctified vegetarian food offered to Lord Krishna — is central to Gaudiya Vaishnavism. What began as small Sunday feasts in Prabhupada's storefront in New York has grown into the world's largest vegetarian food relief network, serving over 1.2 billion meals annually through programmes like Annadana and ISKCON Food Relief Foundation's Midday Meal scheme." },
      { type: "h2", text: "The Spiritual Science of Prasadam" },
      { type: "p", text: "Prasadam is not merely food — it is grace. According to the Bhagavad Gita (3.13), food prepared with devotion and offered to the Supreme Lord becomes spiritually potent. ISKCON kitchens follow strict Vedic protocols: only sattvic ingredients are used, cooking is accompanied by the chanting of the Hare Krishna maha-mantra, and every dish is offered to the deity before being served." },
      { type: "h2", text: "Feeding India's Children" },
      { type: "p", text: "The Akshaya Patra Foundation, inspired by ISKCON's prasadam tradition, now serves hot lunches to over 2 million schoolchildren daily across 22 Indian states. New temple projects incorporate industrial-scale kitchens from the outset — the upcoming Ahmedabad temple, for example, includes a 50,000-meal-per-day kitchen designed to support the Gujarat state midday meal programme." },
      { type: "blockquote", text: "\"No one within a ten-mile radius of an ISKCON temple should go hungry.\" — Srila Prabhupada" },
    ],
    relatedSlugs: ["becoming-a-member-at-iskcon", "temple-donation-tax-exemption"],
  },
  {
    slug: "becoming-a-member-at-iskcon",
    title: "Becoming a Member at ISKCON: Your Path to Spiritual Community",
    subtitle: "From first darshan to lifetime membership — a complete guide to joining the Hare Krishna movement.",
    author: "Madhava Prabhu",
    authorRole: "Membership & Outreach Director",
    date: "February 18, 2026",
    readTime: "6 min read",
    category: "Community",
    body: [
      { type: "p", text: "ISKCON welcomes everyone regardless of background, nationality, or prior spiritual practice. The movement offers multiple levels of engagement — from casual Sunday feast visitors to initiated brahmacharis and grihasthas. Understanding the membership structure helps newcomers find the right level of involvement for their personal spiritual journey." },
      { type: "h2", text: "Life Membership Programme" },
      { type: "p", text: "The ISKCON Life Membership programme, established by Srila Prabhupada himself, offers devotees a formal connection to the society. Life Members receive a complete set of Srila Prabhupada's books, accommodation privileges at ISKCON guest houses worldwide, invitations to special festivals and yatras, and the spiritual merit of supporting the movement's missionary activities." },
      { type: "h2", text: "Congregational Engagement" },
      { type: "p", text: "Most devotees participate through their local temple's congregational programmes. These include weekly Bhagavad Gita study circles, Nama Hatta home programmes, Bhakti Vriksha spiritual mentorship groups, and seasonal festivals like Janmashtami and Gaura Purnima. Many temples also offer structured courses like the Bhakti Sastri programme for deeper scriptural study." },
      { type: "blockquote", text: "\"Everyone can become a devotee. There is no restriction. Simply chant Hare Krishna and your life will be perfect.\" — Srila Prabhupada" },
    ],
    relatedSlugs: ["seva-through-prasadam", "gita-live-learning"],
  },
  {
    slug: "gita-live-learning",
    title: "Gita Live Learning: Digital Devotion in the 21st Century",
    subtitle: "How ISKCON is using technology to bring the Bhagavad Gita to a new generation of seekers.",
    author: "Sacinandana Dasa",
    authorRole: "Digital Initiatives Lead",
    date: "February 5, 2026",
    readTime: "5 min read",
    category: "Education",
    body: [
      { type: "p", text: "The Bhagavad Gita — Krishna's 700-verse conversation with Arjuna on the battlefield of Kurukshetra — has been translated into over 80 languages. Yet in the digital age, ISKCON recognises that access alone is not enough. The movement has launched a series of technology-driven learning initiatives that make Vedic wisdom interactive, accessible, and relevant to contemporary seekers." },
      { type: "h2", text: "Online Courses and Virtual Retreats" },
      { type: "p", text: "Platforms like ISKCON Desire Tree, Gita Life, and the Mayapur Institute offer structured online courses ranging from introductory overviews of the Bhagavad Gita to advanced studies of the Vedanta Sutra. Virtual retreats — pioneered during the 2020 lockdowns — have become a permanent fixture, allowing devotees worldwide to participate in kirtan, lectures, and guided meditation from their homes." },
      { type: "h2", text: "AI-Powered Study Tools" },
      { type: "p", text: "Several ISKCON-affiliated teams are developing AI-powered tools that help students navigate Prabhupada's extensive commentary. These tools use natural language processing to cross-reference verses, purports, and lectures, making it possible to explore thematic connections across thousands of pages of transcendental literature in seconds." },
      { type: "blockquote", text: "\"The Bhagavad Gita is the essence of all Vedic literature. If one reads Bhagavad Gita sincerely, there is no need to read any other Vedic literature.\" — Srila Prabhupada, Gita Introduction" },
    ],
    relatedSlugs: ["becoming-a-member-at-iskcon", "iskcon-vision-2051"],
  },
  {
    slug: "iskcon-vision-2051",
    title: "ISKCON Vision 2051: 211 Temples Across Every Indian State",
    subtitle: "A strategic roadmap to establish ISKCON's presence in every state and union territory of India within 25 years.",
    author: "Build Iskcon Research",
    authorRole: "Strategic Planning Division",
    date: "January 26, 2026",
    readTime: "10 min read",
    category: "Strategy",
    body: [
      { type: "p", text: "India — the birthplace of Lord Krishna and the heartland of the Hare Krishna movement — still has vast regions without a dedicated ISKCON temple. While flagship centres in Vrindavan, Mayapur, Mumbai, and Bengaluru attract millions of visitors annually, entire states in the Northeast, Central India, and the island territories lack even a single temple. Vision 2051 is ISKCON's most ambitious expansion blueprint: 211 new temples spanning all 28 states and 8 union territories, completed in three strategic phases over 25 years." },
      { type: "h2", text: "Phase 1: 2026–2031 — Anchor States" },
      { type: "p", text: "The first phase targets India's most populous states — Uttar Pradesh, Maharashtra, Karnataka, Tamil Nadu, West Bengal, Rajasthan, and Gujarat. These states already have strong congregational bases and existing ISKCON infrastructure. Phase 1 focuses on filling gaps in tier-2 and tier-3 cities, establishing 80+ temples that can serve as regional hubs for subsequent expansion." },
      { type: "h2", text: "Phase 2: 2031–2041 — Expansion Corridor" },
      { type: "p", text: "Phase 2 extends into states with growing but underserved ISKCON communities: Himachal Pradesh, Bihar, Jharkhand, Assam, Goa, and the larger union territories. The emphasis shifts from large flagship temples to community-scaled centres — 5,000 to 15,000 sq ft complexes with a temple room, prasadam hall, and residential quarters for resident devotees." },
      { type: "h2", text: "Phase 3: 2041–2051 — Last Mile" },
      { type: "p", text: "The final decade addresses the most challenging geographies: the Northeastern hill states (Nagaland, Mizoram, Arunachal Pradesh), high-altitude union territories (Ladakh), and island territories (Andaman & Nicobar, Lakshadweep). These projects will require innovative architectural solutions — modular construction for remote areas, climate-adaptive designs for extreme environments, and community partnerships with local populations." },
      { type: "blockquote", text: "\"By 2051 — the centenary of Srila Prabhupada's arrival in New York — every Indian state should echo with the Hare Krishna maha-mantra from a dedicated ISKCON temple.\" — Vision 2051 Charter" },
      { type: "p", text: "The total estimated investment for Vision 2051 exceeds ₹15,000 crore ($1.8 billion), to be raised through a combination of life membership drives, corporate CSR partnerships, government temple development grants, NRI philanthropy, and crowdfunding campaigns. The Build Iskcon platform will serve as the central intelligence hub — tracking every project from land acquisition through consecration." },
    ],
    relatedSlugs: ["iskcon-temple-construction-merging-devotion-with-design", "temple-donation-tax-exemption"],
  },
];

const CATEGORY_COLORS: Record<string, string> = {
  Architecture: "bg-amber-100 text-amber-800",
  Finance: "bg-emerald-100 text-emerald-800",
  Seva: "bg-rose-100 text-rose-800",
  Community: "bg-blue-100 text-blue-800",
  Education: "bg-violet-100 text-violet-800",
  Strategy: "bg-primary/10 text-primary",
};

export function BlogDetail() {
  const { slug } = useParams<{ slug: string }>();
  const blog = BLOGS.find((b) => b.slug === slug);

  if (!blog) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4 px-4 text-center">
          <h2 className="font-serif text-2xl font-bold text-on-surface">Article Not Found</h2>
          <p className="text-on-surface-variant text-sm">The article you're looking for doesn't exist.</p>
          <Link href="/blogs">
            <button className="mt-2 bg-primary text-on-primary px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-primary/90 transition-colors">
              Back to Insights
            </button>
          </Link>
        </div>
      </Layout>
    );
  }

  const related = blog.relatedSlugs.map((s) => BLOGS.find((b) => b.slug === s)).filter(Boolean) as Blog[];

  return (
    <Layout>
      <SEOHead title={blog.title} description={blog.subtitle} canonicalPath={`/blogs/${blog.slug}`} />
      <article className="px-4 md:px-8 max-w-screen-md mx-auto">
        <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-8">
          <motion.div variants={fadeInUp}>
            <Link href="/blogs">
              <span className="inline-flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-widest hover:opacity-70 transition-opacity cursor-pointer mb-6">
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Insights
              </span>
            </Link>
          </motion.div>

          <motion.div variants={fadeInUp} className="space-y-4">
            <span className={`inline-block text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full ${CATEGORY_COLORS[blog.category] || "bg-surface-container text-on-surface-variant"}`}>
              {blog.category}
            </span>
            <h1 className="font-serif text-3xl sm:text-4xl font-bold text-on-surface leading-tight">{blog.title}</h1>
            <p className="text-on-surface-variant text-base leading-relaxed">{blog.subtitle}</p>
            <div className="flex flex-wrap items-center gap-4 text-xs text-on-surface-variant pt-2">
              <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> {blog.author}</span>
              <span className="text-on-surface-variant/40">|</span>
              <span>{blog.authorRole}</span>
              <span className="text-on-surface-variant/40">|</span>
              <span>{blog.date}</span>
              <span className="text-on-surface-variant/40">|</span>
              <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {blog.readTime}</span>
            </div>
          </motion.div>

          <motion.div variants={fadeInUp} className="h-px bg-outline-variant/20" />

          <motion.div variants={staggerContainer} className="space-y-6">
            {blog.body.map((block, i) => {
              if (block.type === "h2") {
                return (
                  <motion.h2 key={i} variants={fadeInUp} className="font-serif text-2xl font-bold text-on-surface mt-10 mb-4">
                    {block.text}
                  </motion.h2>
                );
              }
              if (block.type === "blockquote") {
                return (
                  <motion.blockquote key={i} variants={fadeInUp} className="border-l-2 border-primary pl-6 py-2 my-8">
                    <p className="font-serif text-lg italic text-on-surface/90 leading-relaxed">{block.text}</p>
                  </motion.blockquote>
                );
              }
              return (
                <motion.p key={i} variants={fadeInUp} className="text-on-surface-variant text-base leading-relaxed">
                  {block.text}
                </motion.p>
              );
            })}
          </motion.div>

          {related.length > 0 && (
            <motion.div variants={fadeInUp} className="mt-16 space-y-6">
              <div className="h-px bg-outline-variant/20" />
              <h3 className="font-serif text-xl font-bold text-on-surface">Related Articles</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {related.map((r) => (
                  <Link key={r.slug} href={`/blogs/${r.slug}`}>
                    <div className="bg-surface-container-low rounded-xl p-5 hover:-translate-y-0.5 transition-transform cursor-pointer">
                      <span className={`inline-block text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full mb-3 ${CATEGORY_COLORS[r.category] || "bg-surface-container text-on-surface-variant"}`}>
                        {r.category}
                      </span>
                      <h4 className="font-serif text-sm font-bold text-on-surface leading-snug line-clamp-2">{r.title}</h4>
                      <p className="text-xs text-on-surface-variant mt-2 line-clamp-2">{r.subtitle}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </motion.div>
          )}
        </motion.div>
      </article>
    </Layout>
  );
}

export default function BlogsListing() {
  return (
    <Layout>
      <SEOHead title="Insights & Articles" description="In-depth articles on ISKCON temple construction, architecture, devotional service, and the global Hare Krishna movement." canonicalPath="/blogs" />
      <div className="px-4 md:px-8 max-w-screen-2xl mx-auto">
        <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-12">
          <motion.div variants={fadeInUp} className="max-w-2xl">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Tag className="w-4 h-4 text-primary" />
              </div>
              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em]">Knowledge Base</span>
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl font-bold text-on-surface">Insights & Articles</h1>
            <p className="text-on-surface-variant text-sm mt-2 leading-relaxed">
              In-depth coverage of temple architecture, devotional service, community building, and ISKCON's strategic vision for the future.
            </p>
          </motion.div>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {BLOGS.map((blog) => (
              <motion.div key={blog.slug} variants={fadeInUp}>
                <Link href={`/blogs/${blog.slug}`}>
                  <div className="bg-surface-container-low rounded-2xl overflow-hidden flex flex-col h-full hover:-translate-y-1 transition-transform duration-300 cursor-pointer shadow-[0_4px_24px_rgba(27,28,28,0.06)]">
                    <div className="p-6 flex flex-col flex-1">
                      <div className="flex items-center justify-between mb-4">
                        <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full ${CATEGORY_COLORS[blog.category] || "bg-surface-container text-on-surface-variant"}`}>
                          {blog.category}
                        </span>
                        <span className="text-[10px] text-on-surface-variant font-medium flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {blog.readTime}
                        </span>
                      </div>
                      <h2 className="font-serif text-lg font-bold text-on-surface leading-snug mb-2 line-clamp-2">{blog.title}</h2>
                      <p className="text-xs text-on-surface-variant leading-relaxed line-clamp-3 flex-1">{blog.subtitle}</p>
                      <div className="mt-5 pt-4 flex items-center justify-between" style={{ borderTop: "1px solid color-mix(in srgb, var(--md-sys-color-outline-variant) 20%, transparent)" }}>
                        <div>
                          <p className="text-xs font-bold text-on-surface">{blog.author}</p>
                          <p className="text-[10px] text-on-surface-variant">{blog.date}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-primary" />
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </Layout>
  );
}
