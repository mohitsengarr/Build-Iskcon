import { useState } from "react";
import { motion } from "framer-motion";
import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { fadeInUp, staggerContainer, viewportOnce } from "@/lib/animations";
import { Link, useParams } from "wouter";
import { ArrowLeft, Clock, User, CalendarDays, BookOpen, ChevronRight } from "lucide-react";

// ── Blog Data ─────────────────────────────────────────────────────────────────

interface BlogPost {
  slug: string;
  title: string;
  subtitle: string;
  author: string;
  authorRole: string;
  date: string;
  readTime: number;
  category: string;
  body: { type: "p" | "h2" | "blockquote"; text: string }[];
  relatedSlugs: string[];
}

const BLOGS: BlogPost[] = [
  {
    slug: "iskcon-temple-construction-merging-devotion-with-design",
    title: "ISKCON Temple Construction: Merging Devotion with Design",
    subtitle: "Explore how ISKCON temples around the world blend sacred architecture with spiritual intention, creating spaces that inspire devotion through design.",
    author: "Ananya Devika Rao",
    authorRole: "Temple Architect & Cultural Preservation Blogger",
    date: "July 7, 2025",
    readTime: 6,
    category: "Architecture",
    body: [
      { type: "p", text: "The International Society for Krishna Consciousness (ISKCON), also known as the Hare Krishna movement, is renowned not only for its devotional practices but also for its grand and meticulously crafted temples. These temples are more than just places of worship — they are architectural embodiments of sacred philosophy, designed to uplift the soul through form, space, and symbolism." },
      { type: "p", text: "ISKCON temple construction is guided by the principles of Vastu Shastra, an ancient Indian science of architecture that emphasizes harmony with natural elements and cosmic energies. Each structural element — from the temple's orientation to the placement of the deities — is planned to enhance spiritual resonance and facilitate a deep connection with the divine." },
      { type: "h2", text: "Tradition Meets Modern Engineering" },
      { type: "p", text: "One of the defining characteristics of ISKCON temples is the fusion of traditional Indian temple architecture with modern engineering. While preserving classic elements such as ornate shikharas (spires), intricately carved pillars, and domes, architects also incorporate sustainable technologies, seismic considerations, and accessibility features to make temples inclusive and enduring." },
      { type: "p", text: "The centerpiece of most ISKCON temples is the main altar, where deities of Radha-Krishna, Gaura-Nitai, or Jagannath-Baladeva-Subhadra are housed. The design ensures an uninterrupted line of sight to the deities from any corner of the temple hall, reflecting the centrality of darshan (spiritual viewing) in the worship experience." },
      { type: "h2", text: "Light, Sound, and Sacred Space" },
      { type: "p", text: "Lighting and acoustics are also meticulously planned. Natural light is often channeled through skylights and high windows, bathing the sanctum in a serene glow. Acoustic treatments enhance the reverberation of kirtans (devotional chants), making the spiritual ambiance immersive and uplifting." },
      { type: "blockquote", text: "\"Architecture transcends function in an ISKCON temple. Every stone, beam, and ornament carries the intent to inspire spiritual awakening.\"" },
      { type: "h2", text: "The Vrindavan Chandrodaya Mandir — World's Tallest Temple" },
      { type: "p", text: "Temples like the upcoming Vrindavan Chandrodaya Mandir — poised to be the world's tallest temple — exemplify ISKCON's vision of combining scale with sanctity. Standing at 210 meters, this architectural marvel integrates traditional design motifs with cutting-edge structural engineering, symbolizing the timeless relevance of Krishna consciousness." },
      { type: "h2", text: "Community at the Heart of Design" },
      { type: "p", text: "Community spaces are integral to ISKCON temple designs. Beyond the sanctum, there are halls for spiritual discourses, prasadam (sanctified food) dining areas, libraries, classrooms, and guest accommodations — all aimed at fostering a holistic spiritual ecosystem that serves both devotees and the wider public." },
      { type: "p", text: "ISKCON temples are often built through global collaboration. Architects, engineers, and artisans from different countries come together, united by a shared spiritual vision. This international synergy echoes the movement's global mission to promote unity through devotion." },
      { type: "h2", text: "Architecture as Offering" },
      { type: "p", text: "Ultimately, ISKCON temple construction is a sacred art form where design becomes a vehicle for devotion. Every stone, beam, and ornament carries the intent to inspire spiritual awakening. It is a process where architecture transcends function, becoming an offering to the divine and a beacon for humanity's spiritual journey." },
    ],
    relatedSlugs: ["temple-donation-tax-exemption", "seva-through-prasadam", "becoming-a-member-at-iskcon"],
  },
  {
    slug: "temple-donation-tax-exemption",
    title: "Temple Donation Tax Exemption: What Every Devotee Should Know",
    subtitle: "Donating to ISKCON temples not only supports spiritual and social causes but can also offer tax benefits under Section 80G of the Indian Income Tax Act.",
    author: "Rishi Narayan Mehta",
    authorRole: "Financial Consultant & Devotee",
    date: "June 20, 2025",
    readTime: 5,
    category: "Giving",
    body: [
      { type: "p", text: "Many devotees who generously support ISKCON temple construction and welfare activities are unaware that their contributions may qualify for significant tax deductions under Indian law. Section 80G of the Income Tax Act, 1961 provides for deductions on donations made to approved charitable institutions." },
      { type: "h2", text: "Understanding Section 80G" },
      { type: "p", text: "Under Section 80G, donations to approved funds and charitable institutions are eligible for a deduction of 50% or 100% of the donated amount, subject to certain qualifying conditions. ISKCON's registered temples and charitable arms typically hold 80G approval, making your donation tax-deductible." },
      { type: "p", text: "To claim the deduction, you will need the donation receipt issued by the temple, which includes the trust's PAN number, registration number, and the amount donated. This receipt must be retained and submitted with your income tax return." },
      { type: "h2", text: "FCRA and International Donations" },
      { type: "p", text: "For devotees based outside India who wish to donate to Indian ISKCON temples, the Foreign Contribution Regulation Act (FCRA) governs such contributions. Temples with FCRA registration can legally accept donations from abroad. Always verify the FCRA status before donating from overseas." },
      { type: "blockquote", text: "\"When you donate to build a temple, you are not just giving money — you are contributing to a permanent spiritual beacon that will uplift thousands for generations.\"" },
      { type: "h2", text: "Practical Steps Before Donating" },
      { type: "p", text: "Before making a contribution, confirm the temple's 80G registration validity, request an official receipt, and consult your tax advisor for the most current rules. Tax laws are subject to amendment, and a qualified professional can guide you to maximize both your spiritual merit and financial benefit." },
    ],
    relatedSlugs: ["iskcon-temple-construction-merging-devotion-with-design", "seva-through-prasadam", "iskcon-vision-2051"],
  },
  {
    slug: "seva-through-prasadam",
    title: "Seva Through Prasadam: Feeding the Body, Nourishing the Soul",
    subtitle: "Offering prasadam is more than food distribution — it is an act of love and spiritual service. Discover how ISKCON's food relief programs touch lives across the world.",
    author: "Gopika Devi Dasi",
    authorRole: "Food for Life Coordinator",
    date: "June 5, 2025",
    readTime: 5,
    category: "Seva",
    body: [
      { type: "p", text: "Prasadam — food offered to Krishna with devotion — is at the heart of ISKCON's service to humanity. The simple act of cooking with love, offering it to the Lord, and distributing it freely transforms an ordinary meal into a spiritually charged gift that nourishes both body and soul." },
      { type: "h2", text: "Food for Life: The World's Largest Vegan Food Relief" },
      { type: "p", text: "ISKCON's Food for Life program is recognized as the world's largest plant-based food relief organization. Founded by Srila Prabhupada on the principle that 'no one within ten miles of a temple should go hungry,' the program distributes hundreds of millions of free meals every year across more than 60 countries." },
      { type: "p", text: "In India, Food for Life programs operate in partnership with government disaster relief efforts, distributing prasadam in flood zones, drought-affected regions, and urban slums. The distribution is entirely free, funded by donations from devotees and well-wishers around the world." },
      { type: "blockquote", text: "\"By feeding people prasadam, we are not only satisfying their hunger — we are planting seeds of Krishna consciousness in their hearts.\" — Srila Prabhupada" },
      { type: "h2", text: "How Temple Construction Enables More Seva" },
      { type: "p", text: "Every new ISKCON temple built under the Vision 2051 plan will include a dedicated prasadam hall and community kitchen. This ensures that as the movement expands geographically, so too does its capacity to feed the hungry and serve the community." },
    ],
    relatedSlugs: ["becoming-a-member-at-iskcon", "iskcon-temple-construction-merging-devotion-with-design", "gita-live-learning"],
  },
  {
    slug: "becoming-a-member-at-iskcon",
    title: "Becoming a Member at ISKCON: Joining a Global Family of Devotees",
    subtitle: "Joining ISKCON as a member offers more than spiritual benefits — it connects you with a worldwide network of seva, sanga, and spiritual growth.",
    author: "Madhava Dasa",
    authorRole: "ISKCON Member Relations",
    date: "May 18, 2025",
    readTime: 5,
    category: "Community",
    body: [
      { type: "p", text: "ISKCON is not merely a religious institution — it is a worldwide family of seekers, practitioners, and devotees united by their love for Krishna and commitment to spiritual growth. Becoming a member opens the door to an extraordinary community spanning over 700 temples and 100 countries." },
      { type: "h2", text: "What Membership Offers" },
      { type: "p", text: "ISKCON membership provides regular access to temple programs, priority invitations to spiritual retreats, subscription to publications, and the opportunity to participate in governance through elected regional councils. Members are also invited to exclusive events during major festivals like Janmashtami and Ratha Yatra." },
      { type: "p", text: "Beyond formal benefits, membership is a commitment to the values of Vaishnava life: chanting the Hare Krishna maha-mantra, reading Srila Prabhupada's books, following the four regulative principles, and associating with devotees in sanga." },
      { type: "blockquote", text: "\"The highest form of charity is to give people Krishna consciousness. By building temples and welcoming members, we create the infrastructure for this gift.\"" },
      { type: "h2", text: "How to Join" },
      { type: "p", text: "Interested individuals can visit their nearest ISKCON temple, attend a Sunday Feast program, and speak with the temple president or membership coordinator. There is no complex initiation process for basic membership — a sincere desire to participate in Krishna's service is the only qualification." },
    ],
    relatedSlugs: ["seva-through-prasadam", "temple-donation-tax-exemption", "gita-live-learning"],
  },
  {
    slug: "gita-live-learning",
    title: "The Experience of Learning Gita Live: Transforming Wisdom Into Practice",
    subtitle: "Live classes on the Bhagavad Gita are more than lectures — they are windows into spiritual transformation. Explore how learning the Gita with ISKCON teachers shapes hearts and habits.",
    author: "Vrindavan Das",
    authorRole: "Bhagavad Gita Teacher, ISKCON",
    date: "April 30, 2025",
    readTime: 6,
    category: "Learning",
    body: [
      { type: "p", text: "The Bhagavad Gita — the 700-verse dialogue between Krishna and Arjuna on the battlefield of Kurukshetra — is among the most studied spiritual texts in human history. Yet its wisdom, when presented live by a realized teacher, takes on a dimension that no written commentary can fully replicate." },
      { type: "h2", text: "Why Live Learning Transforms" },
      { type: "p", text: "In a live Gita class, the teacher responds to the unique questions and life situations of those present. The dialogue format mirrors the original Gita itself — a conversation between a seeker and a guide. Students report that understanding deepens exponentially when they can ask, listen, and reflect in real time." },
      { type: "p", text: "ISKCON's Bhaktivedanta Institute and temple-based Gita courses offer structured learning from introductory to advanced levels. Many programs are now available both in-person and online, making the Gita's wisdom accessible to sincere seekers everywhere." },
      { type: "blockquote", text: "\"The Bhagavad Gita is not a book about war — it is a manual for living. When you understand it, every challenge becomes an opportunity for spiritual growth.\"" },
      { type: "h2", text: "Gita Study at New Temples Under Vision 2051" },
      { type: "p", text: "Each temple planned under ISKCON's Vision 2051 expansion will include a dedicated learning center where Gita study programs, brahminical training, and devotional arts can be taught. The physical space of the temple creates the ideal environment for this kind of deep, embodied learning." },
    ],
    relatedSlugs: ["becoming-a-member-at-iskcon", "iskcon-temple-construction-merging-devotion-with-design", "iskcon-vision-2051"],
  },
  {
    slug: "iskcon-vision-2051",
    title: "Vision 2051: 211 ISKCON Temples Across Every State in India",
    subtitle: "A bold spiritual infrastructure plan to plant the seed of Krishna consciousness in every major city across all 28 states and 8 Union Territories of India.",
    author: "Build Iskcon Editorial Team",
    authorRole: "Strategic Planning Desk",
    date: "March 24, 2026",
    readTime: 8,
    category: "Vision",
    body: [
      { type: "p", text: "ISKCON's Vision 2051 is one of the most ambitious spiritual infrastructure projects in modern history: 211 temples across every state and major Union Territory of India, ensuring that at least 7 major cities in each region have a living center of Krishna consciousness by the centenary of ISKCON's founding." },
      { type: "h2", text: "Why 2051?" },
      { type: "p", text: "The year 2051 marks the 85th anniversary of ISKCON's founding in 1966 by His Divine Grace A.C. Bhaktivedanta Swami Prabhupada. It also aligns with India's own centennial of independence in 2047 and a generation of devotees who have grown up with the dream of transforming India into a spiritually conscious civilization." },
      { type: "p", text: "The 211-temple target is not arbitrary. It is computed from the map of India's states and Union Territories, assigning 7 priority cities per state — cities with educational institutions, commercial activity, cultural heritage, or spiritual history — where an ISKCON temple would have maximum transformative impact." },
      { type: "h2", text: "Criteria for City Selection" },
      { type: "p", text: "Cities were selected based on four key criteria: population density and growth trajectory, presence of educational institutions and youth engagement potential, proximity to pilgrimage corridors or spiritual heritage sites, and absence of existing ISKCON presence. Priority is given to cities where no ISKCON temple currently exists." },
      { type: "blockquote", text: "\"Srila Prabhupada wanted a temple in every town and village. Vision 2051 is our generation's commitment to that dream.\"" },
      { type: "h2", text: "Phased Implementation" },
      { type: "p", text: "The project is divided into three phases. Phase 1 (2026–2031) focuses on state capitals and tier-1 cities where land acquisition is feasible and devotee communities already exist. Phase 2 (2031–2041) expands to tier-2 cities and completes the northeast and island territories. Phase 3 (2041–2051) fills the remaining gaps, completing the full 211-temple network." },
      { type: "p", text: "Each temple in the network will be built to a standard that includes the main deity hall, a community prasadam kitchen, a Gita study center, accommodation for visiting devotees, and a cow protection program where land permits." },
    ],
    relatedSlugs: ["iskcon-temple-construction-merging-devotion-with-design", "temple-donation-tax-exemption", "seva-through-prasadam"],
  },
];

const CATEGORY_COLORS: Record<string, string> = {
  Architecture: "bg-amber-900/30 text-amber-300 border border-amber-700/40",
  Giving: "bg-emerald-900/30 text-emerald-300 border border-emerald-700/40",
  Seva: "bg-rose-900/30 text-rose-300 border border-rose-700/40",
  Community: "bg-blue-900/30 text-blue-300 border border-blue-700/40",
  Learning: "bg-purple-900/30 text-purple-300 border border-purple-700/40",
  Vision: "bg-primary/20 text-primary border border-primary/30",
};

// ── Blog Listing ─────────────────────────────────────────────────────────────

function BlogCard({ post, index }: { post: BlogPost; index: number }) {
  return (
    <motion.div variants={fadeInUp} custom={index}>
      <Link href={`/blogs/${post.slug}`}>
        <div className="group cursor-pointer bg-surface-container rounded-2xl border border-on-surface-variant/10 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 overflow-hidden">
          <div className="p-6 flex flex-col gap-3 h-full">
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full ${CATEGORY_COLORS[post.category] || "bg-surface text-on-surface-variant"}`}>
                {post.category}
              </span>
              <div className="flex items-center gap-1.5 text-on-surface-variant/50 text-xs">
                <Clock className="w-3.5 h-3.5" />
                {post.readTime} min read
              </div>
            </div>

            <h3 className="font-serif text-xl font-bold text-on-surface group-hover:text-primary transition-colors leading-snug mt-1">
              {post.title}
            </h3>
            <p className="text-sm text-on-surface-variant leading-relaxed line-clamp-3">
              {post.subtitle}
            </p>

            <div className="mt-auto pt-4 border-t border-on-surface-variant/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                  <User className="w-3.5 h-3.5 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-on-surface">{post.author}</p>
                  <p className="text-xs text-on-surface-variant/60">{post.date}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

export function BlogsListing() {
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const categories = ["All", ...Array.from(new Set(BLOGS.map((b) => b.category)))];
  const filtered = activeCategory === "All" ? BLOGS : BLOGS.filter((b) => b.category === activeCategory);

  return (
    <Layout>
      <SEOHead
        title="Insights & Articles | Build Iskcon"
        description="Explore articles on ISKCON temple construction, devotional life, seva, and the Vision 2051 expansion plan."
      />
      <div className="max-w-screen-xl mx-auto px-4 sm:px-8">
        {/* Hero */}
        <motion.div
          className="text-center py-12 mb-4"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={fadeInUp} className="inline-flex items-center gap-2 bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-full mb-6">
            <BookOpen className="w-3.5 h-3.5" />
            Knowledge & Inspiration
          </motion.div>
          <motion.h1 variants={fadeInUp} className="font-serif text-4xl sm:text-5xl font-black text-on-surface mb-4">
            Insights & Articles
          </motion.h1>
          <motion.p variants={fadeInUp} className="text-on-surface-variant max-w-2xl mx-auto text-lg">
            Stories, wisdom, and perspectives from the world of ISKCON — architecture, devotion, seva, and the vision for a spiritually conscious India.
          </motion.p>
        </motion.div>

        {/* Category Filter */}
        <motion.div
          className="flex gap-2 flex-wrap justify-center mb-10"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {categories.map((cat) => (
            <motion.button
              key={cat}
              variants={fadeInUp}
              onClick={() => setActiveCategory(cat)}
              className={`text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-full border transition-all duration-200 ${
                activeCategory === cat
                  ? "bg-primary text-on-primary border-primary"
                  : "border-on-surface-variant/20 text-on-surface-variant hover:border-primary/40 hover:text-primary"
              }`}
            >
              {cat}
            </motion.button>
          ))}
        </motion.div>

        {/* Grid */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-16"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          {...viewportOnce}
        >
          {filtered.map((post, i) => (
            <BlogCard key={post.slug} post={post} index={i} />
          ))}
        </motion.div>
      </div>
    </Layout>
  );
}

// ── Blog Detail ───────────────────────────────────────────────────────────────

export function BlogDetail() {
  const { slug } = useParams<{ slug: string }>();
  const post = BLOGS.find((b) => b.slug === slug);

  if (!post) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <h1 className="font-serif text-3xl font-bold text-on-surface">Article not found</h1>
          <Link href="/blogs">
            <span className="text-primary font-semibold hover:underline cursor-pointer">← Back to all articles</span>
          </Link>
        </div>
      </Layout>
    );
  }

  const related = BLOGS.filter((b) => post.relatedSlugs.includes(b.slug));

  return (
    <Layout>
      <SEOHead title={`${post.title} | Build Iskcon`} description={post.subtitle} />
      <div className="max-w-3xl mx-auto px-4 sm:px-8 pb-20">
        {/* Back */}
        <motion.div variants={fadeInUp} initial="hidden" animate="visible" className="mb-8">
          <Link href="/blogs">
            <span className="inline-flex items-center gap-2 text-sm text-on-surface-variant hover:text-primary transition-colors cursor-pointer font-semibold">
              <ArrowLeft className="w-4 h-4" /> All Articles
            </span>
          </Link>
        </motion.div>

        {/* Header */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="mb-10"
        >
          <motion.span
            variants={fadeInUp}
            className={`inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-4 ${CATEGORY_COLORS[post.category] || ""}`}
          >
            {post.category}
          </motion.span>
          <motion.h1
            variants={fadeInUp}
            className="font-serif text-3xl sm:text-4xl font-black text-on-surface leading-tight mb-4"
          >
            {post.title}
          </motion.h1>
          <motion.p variants={fadeInUp} className="text-lg text-on-surface-variant leading-relaxed mb-6">
            {post.subtitle}
          </motion.p>

          <motion.div variants={fadeInUp} className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <User className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-bold text-on-surface">{post.author}</p>
                <p className="text-xs text-on-surface-variant/70">{post.authorRole}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-on-surface-variant/60 ml-auto">
              <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" />{post.date}</span>
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{post.readTime} min read</span>
            </div>
          </motion.div>
        </motion.div>

        {/* Divider */}
        <div className="h-px bg-on-surface-variant/10 mb-10" />

        {/* Body */}
        <motion.div
          className="space-y-5"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {post.body.map((block, i) => {
            if (block.type === "h2") return (
              <motion.h2 key={i} variants={fadeInUp} className="font-serif text-2xl font-bold text-on-surface mt-8 mb-2">
                {block.text}
              </motion.h2>
            );
            if (block.type === "blockquote") return (
              <motion.blockquote key={i} variants={fadeInUp} className="border-l-4 border-primary/60 pl-6 py-2 my-6 bg-primary/5 rounded-r-xl">
                <p className="text-on-surface-variant italic text-lg leading-relaxed">{block.text}</p>
              </motion.blockquote>
            );
            return (
              <motion.p key={i} variants={fadeInUp} className="text-on-surface-variant leading-loose text-base">
                {block.text}
              </motion.p>
            );
          })}
        </motion.div>

        {/* Related */}
        {related.length > 0 && (
          <motion.div
            className="mt-16"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            {...viewportOnce}
          >
            <div className="h-0.5 w-16 bg-primary rounded-full mb-4" />
            <h2 className="font-serif text-2xl font-bold text-on-surface mb-6">More Articles</h2>
            <div className="flex flex-col gap-4">
              {related.map((r, i) => (
                <motion.div key={r.slug} variants={fadeInUp} custom={i}>
                  <Link href={`/blogs/${r.slug}`}>
                    <div className="group p-5 rounded-xl bg-surface-container border border-on-surface-variant/10 hover:border-primary/30 transition-all cursor-pointer flex items-center justify-between gap-4">
                      <div>
                        <span className="text-xs font-bold uppercase tracking-widest text-primary mb-1 block">{r.category}</span>
                        <h3 className="font-semibold text-on-surface group-hover:text-primary transition-colors text-sm leading-snug">{r.title}</h3>
                        <p className="text-xs text-on-surface-variant/60 mt-1">{r.readTime} min · {r.author}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-primary shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </Layout>
  );
}

// Default export for listing page
export default BlogsListing;
