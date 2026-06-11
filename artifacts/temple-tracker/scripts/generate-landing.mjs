/**
 * Generates the SEO landing pages for Srimad Bhagavatam — one per locale —
 * plus a fresh sitemap.xml:
 *
 *   /shrimad-bhagavatam/  → Hindi   (lang="hi", targets "श्रीमद्भागवत हिंदी में पढ़ें")
 *   /srimad-bhagavatam/   → English (lang="en", targets "read Srimad Bhagavatam online")
 *
 * Each page declares hreflang alternates to the other + x-default, so the
 * two pages rank for their own language instead of competing.
 *
 * Why static: the site is a client-rendered SPA on Vercel — crawlers get an
 * empty <div id="root"> shell for every route. This script runs in the
 * Vercel buildCommand AFTER generate-static-api.mjs and emits fully
 * pre-rendered, zero-JS HTML documents built from the same chapter-index
 * data the reader uses. Vercel serves filesystem matches before SPA
 * rewrites — the exact mechanism /api/bhagwatham/* already relies on.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");
const SITE = "https://buildiskcon.com";

const HI_PATH = "/shrimad-bhagavatam/";
const EN_PATH = "/srimad-bhagavatam/";

// ── Data ─────────────────────────────────────────────────────────────────────
const chapterIndex = JSON.parse(
  fs.readFileSync(path.join(PUBLIC_DIR, "api", "bhagwatham", "chapter-index"), "utf-8"),
);
const chapters = chapterIndex.chapters || chapterIndex;

const bySkandh = new Map();
for (const c of chapters) {
  if (!bySkandh.has(c.skandh)) bySkandh.set(c.skandh, []);
  bySkandh.get(c.skandh).push(c);
}

let imageCount = 0;
try {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(PUBLIC_DIR, "api", "bhagwatham", "image-manifest"), "utf-8"),
  );
  imageCount = (manifest.images || []).length;
} catch { /* manifest optional */ }

const totalChapters = chapters.length;
const canto10Count = bySkandh.get(10)?.length || 86;
const today = new Date().toISOString().slice(0, 10);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Chapter art per skandh (all verified to exist as static files).
const SKANDH_ART = {
  1: "chapter-001.jpg", 2: "chapter-020.jpg", 3: "chapter-030.jpg",
  4: "chapter-063.jpg", 5: "chapter-097.jpg", 6: "chapter-120.jpg",
  7: "chapter-139.jpg", 8: "chapter-155.jpg", 9: "chapter-177.jpg",
  10: "chapter-201.jpg", 11: "chapter-287.jpg", 12: "chapter-294.jpg",
};
const artFor = (s) => {
  const f = SKANDH_ART[s];
  return f && fs.existsSync(path.join(PUBLIC_DIR, "api", "bhagwatham", "images", f))
    ? `/api/bhagwatham/images/${f}` : null;
};

// ── Locales ──────────────────────────────────────────────────────────────────
// Canto subtitles follow the standard BBT edition names in each language.
const LOCALES = {
  hi: {
    lang: "hi",
    ogLocale: "hi_IN",
    path: HI_PATH,
    title: `श्रीमद्भागवत हिंदी में पढ़ें — 12 स्कंध, ${totalChapters} अध्याय निःशुल्क | Build Iskcon`,
    description: `श्रीमद्भागवत महापुराण ऑनलाइन हिंदी में पढ़ें — सभी 12 स्कंध, ${totalChapters} अध्याय। देवनागरी श्लोक, शब्दार्थ, अनुवाद, तात्पर्य, AI ऑडियो और बुकमार्क। BBT संस्करण, बिल्कुल निःशुल्क।`,
    bookName: "श्रीमद्भागवत महापुराण (Srimad Bhagavatam)",
    bookDescription: `श्रीमद्भागवत महापुराण के सभी 12 स्कंध और ${totalChapters} अध्याय हिंदी में — मूल देवनागरी श्लोक, शब्दार्थ, अनुवाद एवं तात्पर्य सहित, बिल्कुल निःशुल्क।`,
    breadcrumbName: "श्रीमद्भागवत",
    skandhNames: {
      1: "सृष्टि", 2: "ब्रह्मांडीय अभिव्यक्ति", 3: "यथास्थिति",
      4: "चतुर्थ वर्ग की सृष्टि", 5: "सृष्टि की प्रेरणा", 6: "मानवता के निर्धारित कर्तव्य",
      7: "ईश्वर का विज्ञान", 8: "ब्रह्मांडीय सृष्टियों का प्रलय", 9: "मुक्ति",
      10: "परम कल्याण", 11: "सामान्य इतिहास", 12: "पतन का युग",
    },
    nav: { home: "होम", read: "भागवत पढ़ें", chaitanya: "चैतन्य चरितामृत", gallery: "गैलरी" },
    pill: "हिंदी · देवनागरी · निःशुल्क",
    h1: `श्रीमद्भागवत महापुराण — सम्पूर्ण ${totalChapters} अध्याय हिंदी में ऑनलाइन पढ़ें`,
    heroSub: "मूल देवनागरी श्लोक, शब्दार्थ, अनुवाद एवं तात्पर्य — भक्तिवेदान्त बुक ट्रस्ट (BBT) संस्करण। AI ऑडियो वाचन, शब्दकोश और बुकमार्क के साथ।",
    ctaRead: "📖 पढ़ना शुरू करें",
    ctaGallery: "चित्र गैलरी देखें →",
    stats: ["स्कंध", "अध्याय", "पृष्ठ", "AI चित्र"],
    aboutH2: "श्रीमद्भागवत क्या है?",
    aboutP: [
      `श्रीमद्भागवत महापुराण (भागवत पुराण) वेदव्यास रचित अठारह पुराणों में सर्वोच्च माना जाता है — इसे "अमल पुराण" अर्थात् निर्मल पुराण कहा गया है। इसमें भगवान श्रीकृष्ण की लीलाओं, भक्ति योग, सृष्टि की उत्पत्ति, अवतारों और परम सत्य के विज्ञान का विस्तृत वर्णन है।`,
      `यह संस्करण भक्तिवेदान्त बुक ट्रस्ट (BBT) के हिंदी अनुवाद पर आधारित है — श्रील ए.सी. भक्तिवेदान्त स्वामी प्रभुपाद के तात्पर्य सहित। प्रत्येक अध्याय में मूल संस्कृत श्लोक देवनागरी में, शब्द-दर-शब्द अर्थ (शब्दार्थ), हिंदी अनुवाद और विस्तृत तात्पर्य दिया गया है।`,
      `दशम स्कंध — श्रीकृष्ण की बाल लीलाओं से लेकर द्वारका लीला तक — ${canto10Count} अध्यायों के साथ सबसे विस्तृत है। प्रथम स्कंध से क्रमशः पढ़ें या किसी भी स्कंध से सीधे आरम्भ करें।`,
    ],
    skandhH2: "बारह स्कंध",
    skandhSub: "हर स्कंध पर क्लिक करके सीधे पाठक में पढ़ना आरम्भ करें।",
    skandhWord: "स्कंध",
    chaptersWord: "अध्याय",
    featuresH2: "पाठक की विशेषताएँ",
    features: [
      ["🔊 AI ऑडियो वाचन", "कोई भी पंक्ति चुनें और शुद्ध हिंदी उच्चारण में सुनें।"],
      ["📚 शब्दकोश", "कठिन शब्द पर एक क्लिक — तुरंत अर्थ।"],
      ["🔖 बुकमार्क", "जहाँ छोड़ा था, वहीं से आगे — हर डिवाइस पर।"],
      ["🎨 AI चित्र गैलरी", "हर अध्याय के लिए शास्त्रीय शैली के देवनात्मक चित्र।"],
      ["📱 मोबाइल अनुकूल", "फ़ॉन्ट, थीम और पंक्ति-दूरी अपनी पसंद से।"],
      ["🆓 बिल्कुल निःशुल्क", "न पंजीकरण, न शुल्क, न विज्ञापन।"],
    ],
    faqH2: "अक्सर पूछे जाने वाले प्रश्न",
    faqs: [
      ["क्या श्रीमद्भागवत हिंदी में निःशुल्क पढ़ सकते हैं?",
       `हाँ — सभी 12 स्कंध और ${totalChapters} अध्याय बिल्कुल निःशुल्क उपलब्ध हैं। न कोई पंजीकरण, न कोई शुल्क। मूल देवनागरी श्लोक, शब्दार्थ, अनुवाद और तात्पर्य सहित।`],
      ["यह किसका अनुवाद है?",
       "यह भक्तिवेदान्त बुक ट्रस्ट (BBT) का हिंदी संस्करण है — श्रील ए.सी. भक्तिवेदान्त स्वामी प्रभुपाद के अनुवाद एवं तात्पर्य पर आधारित।"],
      ["क्या श्लोकों को सुन भी सकते हैं?",
       "हाँ — किसी भी पंक्ति को चुनकर 'Listen' दबाइए। AI आधारित वाचन (टेक्स्ट-टू-स्पीच) शुद्ध हिंदी उच्चारण में सुनाता है।"],
      ["श्रीमद्भागवत में कुल कितने स्कंध और अध्याय हैं?",
       `श्रीमद्भागवत महापुराण में 12 स्कंध हैं। इस संस्करण में ${totalChapters} अध्याय उपलब्ध हैं — दशम स्कंध (श्रीकृष्ण की लीलाएँ) सबसे बड़ा है, जिसमें ${canto10Count} अध्याय हैं।`],
      ["क्या मोबाइल पर पढ़ना सुविधाजनक है?",
       "हाँ — पाठक मोबाइल के लिए विशेष रूप से बनाया गया है: फ़ॉन्ट आकार, पंक्ति-दूरी और थीम बदल सकते हैं, बुकमार्क लगा सकते हैं, और जहाँ छोड़ा था वहीं से आगे पढ़ सकते हैं।"],
    ],
    bandH2: "आज ही पढ़ना आरम्भ करें",
    bandSub: `प्रथम स्कंध, प्रथम अध्याय — "मुनियों की जिज्ञासा" से आपकी भागवत यात्रा शुरू होती है।`,
    bandCta: "श्रीमद्भागवत पढ़ें →",
    footerTag: "श्रीमद्भागवत हिंदी (BBT संस्करण)",
    altLangLabel: "Read this page in English",
    cardArtAlt: (s, name) => `स्कंध ${s} — ${name} चित्र`,
  },
  en: {
    lang: "en",
    ogLocale: "en_US",
    path: EN_PATH,
    title: `Read Srimad Bhagavatam Online Free — 12 Cantos, ${totalChapters} Chapters | Build Iskcon`,
    description: `Read the complete Srimad Bhagavatam (Bhagavata Purana) online, free — all 12 cantos, ${totalChapters} chapters. Original Devanagari verses with Hindi translation & purports (BBT edition), AI audio narration, dictionary and bookmarks. No signup.`,
    bookName: "Srimad Bhagavatam (Bhagavata Purana)",
    bookDescription: `The complete Srimad Bhagavatam — all 12 cantos and ${totalChapters} chapters, free to read online. Original Devanagari verses with word-for-word meanings, Hindi translation and purports from the Bhaktivedanta Book Trust (BBT) edition.`,
    breadcrumbName: "Srimad Bhagavatam",
    skandhNames: {
      1: "Creation", 2: "The Cosmic Manifestation", 3: "The Status Quo",
      4: "The Creation of the Fourth Order", 5: "The Creative Impetus", 6: "Prescribed Duties for Mankind",
      7: "The Science of God", 8: "Withdrawal of the Cosmic Creations", 9: "Liberation",
      10: "The Summum Bonum", 11: "General History", 12: "The Age of Deterioration",
    },
    nav: { home: "Home", read: "Read Bhagavatam", chaitanya: "Chaitanya Charitamrit", gallery: "Gallery" },
    pill: "Free · Online · No signup",
    h1: `Read the Complete Srimad Bhagavatam Online — All ${totalChapters} Chapters, Free`,
    heroSub: "Original Devanagari verses with word-for-word meanings, Hindi translation and purports — the Bhaktivedanta Book Trust (BBT) edition by Srila A.C. Bhaktivedanta Swami Prabhupada. With AI audio narration, an instant dictionary and bookmarks.",
    ctaRead: "📖 Start Reading",
    ctaGallery: "Browse the Art Gallery →",
    stats: ["Cantos", "Chapters", "Pages", "AI Artworks"],
    aboutH2: "What is the Srimad Bhagavatam?",
    aboutP: [
      `The Srimad Bhagavatam (also called the Bhagavata Purana) is regarded as the ripened fruit of all Vedic literature — the "spotless Purana" composed by Srila Vyasadeva. Across twelve cantos it describes the pastimes of Lord Krishna, the science of bhakti-yoga, the creation of the universe, the avatars of the Lord, and the nature of the Absolute Truth.`,
      `This online edition presents the Bhaktivedanta Book Trust (BBT) text: every chapter carries the original Sanskrit verses in Devanagari script, word-for-word meanings (shabdartha), Hindi translation, and the detailed purports of Srila A.C. Bhaktivedanta Swami Prabhupada — the most widely read edition of the Bhagavatam in the world.`,
      `The Tenth Canto — Krishna's childhood pastimes in Vrindavan through His pastimes in Dwarka — is the heart of the work and the largest, with ${canto10Count} chapters. Read sequentially from Canto 1, or jump straight into any canto below.`,
    ],
    skandhH2: "The Twelve Cantos",
    skandhSub: "Click any canto to start reading it in the online reader.",
    skandhWord: "Canto",
    chaptersWord: "chapters",
    featuresH2: "Reader Features",
    features: [
      ["🔊 AI Audio Narration", "Select any line and listen to it in clear Hindi pronunciation."],
      ["📚 Instant Dictionary", "One tap on a difficult word shows its meaning."],
      ["🔖 Bookmarks", "Continue exactly where you left off, on any device."],
      ["🎨 AI Art Gallery", "Classical-style devotional paintings for every chapter."],
      ["📱 Mobile Friendly", "Adjustable font size, line spacing and themes."],
      ["🆓 Completely Free", "No registration, no fees, no ads."],
    ],
    faqH2: "Frequently Asked Questions",
    faqs: [
      ["Can I read the Srimad Bhagavatam online for free?",
       `Yes — all 12 cantos and ${totalChapters} chapters are completely free. No registration and no fees, with the original Devanagari verses, word meanings, translation and purports.`],
      ["Which edition and translation is this?",
       "It is the Bhaktivedanta Book Trust (BBT) edition — the translation and purports of Srila A.C. Bhaktivedanta Swami Prabhupada, presented in Devanagari with Hindi translation. The reader includes an English toggle where English text is available."],
      ["Is the text in English or Hindi?",
       "The scripture is presented in its original Devanagari with the BBT Hindi translation and purports. The reader interface works in English, and an English view can be toggled for chapters where the English text is available."],
      ["How many cantos and chapters does the Srimad Bhagavatam have?",
       `The Srimad Bhagavatam has 12 cantos (skandhas). This edition contains ${totalChapters} chapters — the Tenth Canto, describing Lord Krishna's own pastimes, is the largest with ${canto10Count} chapters.`],
      ["Can I listen to the verses?",
       "Yes — select any passage and press Listen. AI text-to-speech reads it aloud in clear Hindi pronunciation, ideal for learning correct recitation."],
    ],
    bandH2: "Start Reading Today",
    bandSub: `Your journey begins with Canto 1, Chapter 1 — "Questions by the Sages."`,
    bandCta: "Read the Srimad Bhagavatam →",
    footerTag: "Srimad Bhagavatam online (BBT edition)",
    altLangLabel: "यह पृष्ठ हिंदी में पढ़ें",
    cardArtAlt: (s, name) => `Canto ${s} — ${name}, devotional oil painting`,
  },
};

// ── Renderer ─────────────────────────────────────────────────────────────────
function renderLanding(locale) {
  const L = LOCALES[locale];
  const other = LOCALES[locale === "hi" ? "en" : "hi"];
  const canonical = `${SITE}${L.path}`;

  const skandhCards = [...bySkandh.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([s, list]) => {
      const art = artFor(s);
      const name = L.skandhNames[s] || `${L.skandhWord} ${s}`;
      const first = list[0]?.title || "";
      return `      <a class="card" href="/bhagwatham">
        ${art ? `<img src="${art}" alt="${esc(L.cardArtAlt(s, name))}" loading="lazy" width="336" height="272">` : ""}
        <div class="card-body">
          <div class="card-kicker">${esc(L.skandhWord)} ${s}</div>
          <h3>${esc(name)}</h3>
          <p>${list.length} ${esc(L.chaptersWord)} · ${esc(first.slice(0, 52))}${first.length > 52 ? "…" : ""}</p>
        </div>
      </a>`;
    }).join("\n");

  const faqHtml = L.faqs.map(([q, a]) => `      <details>
        <summary>${esc(q)}</summary>
        <p>${esc(a)}</p>
      </details>`).join("\n");

  const featuresHtml = L.features.map(([b, s]) => `      <div class="feature"><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join("\n");

  const jsonLd = [
    {
      "@context": "https://schema.org", "@type": "Book",
      name: L.bookName,
      alternateName: ["Srimad Bhagavatam", "Bhagavata Purana", "श्रीमद्भागवत महापुराण", "भागवत पुराण"],
      author: { "@type": "Person", name: "Srila Vyasadeva (श्रील व्यासदेव)" },
      translator: { "@type": "Organization", name: "Bhaktivedanta Book Trust (BBT)" },
      inLanguage: "hi",
      numberOfPages: 9500,
      isAccessibleForFree: true,
      url: canonical,
      image: `${SITE}/api/bhagwatham/images/chapter-001.jpg`,
      description: L.bookDescription,
      workExample: { "@type": "Book", bookFormat: "https://schema.org/EBook", potentialAction: { "@type": "ReadAction", target: `${SITE}/bhagwatham` } },
    },
    {
      "@context": "https://schema.org", "@type": "FAQPage",
      mainEntity: L.faqs.map(([q, a]) => ({
        "@type": "Question", name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    },
    {
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Build Iskcon", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: L.breadcrumbName, item: canonical },
      ],
    },
  ];

  return `<!DOCTYPE html>
<html lang="${L.lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(L.title)}</title>
<meta name="description" content="${esc(L.description)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${canonical}">
<link rel="alternate" hreflang="${L.lang}" href="${canonical}">
<link rel="alternate" hreflang="${other.lang}" href="${SITE}${other.path}">
<link rel="alternate" hreflang="x-default" href="${SITE}${EN_PATH}">
<meta property="og:site_name" content="Build Iskcon">
<meta property="og:title" content="${esc(L.title)}">
<meta property="og:description" content="${esc(L.description)}">
<meta property="og:type" content="book">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE}/api/bhagwatham/images/chapter-001.jpg">
<meta property="og:locale" content="${L.ogLocale}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(L.title)}">
<meta name="twitter:description" content="${esc(L.description)}">
<meta name="twitter:image" content="${SITE}/api/bhagwatham/images/chapter-001.jpg">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif:wght@700;900&family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap" rel="stylesheet">
${jsonLd.map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join("\n")}
<style>
  :root{--saffron:#c2410c;--saffron-dark:#9a3412;--gold:#f59e0b;--ink:#292524;--muted:#78716c;--bg:#fafaf9;--card:#ffffff;--line:#e7e5e4}
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Noto Sans Devanagari',system-ui,sans-serif;background:var(--bg);color:var(--ink);line-height:1.75}
  a{color:inherit;text-decoration:none}
  .wrap{max-width:1080px;margin:0 auto;padding:0 20px}
  header{background:#fffbf5;border-bottom:1px solid var(--line)}
  header .wrap{display:flex;align-items:center;justify-content:space-between;height:64px}
  .logo{font-family:'Noto Serif',serif;font-weight:900;letter-spacing:.06em;color:var(--saffron);font-size:18px}
  nav a{font-size:14px;font-weight:600;color:var(--muted);margin-left:22px}
  nav a:hover{color:var(--saffron)}
  .hero{background:linear-gradient(180deg,#fffbf5 0%,var(--bg) 100%);padding:64px 0 48px;text-align:center}
  .pill{display:inline-block;background:#ffedd5;color:var(--saffron-dark);font-size:12px;font-weight:700;letter-spacing:.08em;padding:6px 16px;border-radius:999px;margin-bottom:18px}
  h1{font-size:clamp(28px,5vw,44px);font-weight:700;line-height:1.35;max-width:780px;margin:0 auto 14px}
  .hero p{max-width:660px;margin:0 auto 28px;color:var(--muted);font-size:17px}
  .cta{display:inline-block;background:var(--saffron);color:#fff;font-weight:700;font-size:16px;padding:14px 34px;border-radius:12px;box-shadow:0 6px 18px rgba(194,65,12,.25)}
  .cta:hover{background:var(--saffron-dark)}
  .cta-alt{display:inline-block;margin-left:12px;font-weight:600;color:var(--saffron);padding:14px 18px}
  .stats{display:flex;flex-wrap:wrap;justify-content:center;gap:14px;margin-top:40px}
  .stat{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 26px;min-width:130px}
  .stat b{display:block;font-family:'Noto Serif',serif;font-size:26px;color:var(--saffron)}
  .stat span{font-size:13px;color:var(--muted)}
  section{padding:52px 0}
  h2{font-family:'Noto Serif',serif;font-size:clamp(22px,3.4vw,30px);margin-bottom:10px}
  .sub{color:var(--muted);margin-bottom:30px;max-width:680px}
  .prose p{margin-bottom:14px;max-width:780px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:18px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden;transition:box-shadow .2s,transform .2s}
  .card:hover{box-shadow:0 10px 28px rgba(41,37,36,.10);transform:translateY(-2px)}
  .card img{width:100%;height:140px;object-fit:cover;display:block}
  .card-body{padding:14px 16px 16px}
  .card-kicker{font-size:11px;font-weight:700;letter-spacing:.1em;color:var(--gold);text-transform:uppercase}
  .card h3{font-size:17px;margin:3px 0 5px}
  .card p{font-size:13px;color:var(--muted);line-height:1.6}
  .features{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
  .feature{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px}
  .feature b{display:block;margin-bottom:5px;font-size:15px}
  .feature span{font-size:13.5px;color:var(--muted)}
  details{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin-bottom:10px}
  summary{font-weight:600;cursor:pointer;font-size:15.5px}
  details p{margin-top:10px;color:var(--muted);font-size:14.5px}
  .band{background:var(--saffron);color:#fff;text-align:center;padding:48px 20px;border-radius:20px;margin:20px auto}
  .band h2{color:#fff}
  .band .cta{background:#fff;color:var(--saffron)}
  .langswitch{font-size:13px;font-weight:600}
  footer{border-top:1px solid var(--line);padding:28px 0;margin-top:30px;font-size:13.5px;color:var(--muted)}
  footer .wrap{display:flex;flex-wrap:wrap;gap:18px;justify-content:space-between}
  footer a{margin-right:16px}
  footer a:hover{color:var(--saffron)}
</style>
</head>
<body>
<header>
  <div class="wrap">
    <a class="logo" href="/">BUILD ISKCON</a>
    <nav>
      <a href="/">${esc(L.nav.home)}</a>
      <a href="/bhagwatham">${esc(L.nav.read)}</a>
      <a href="/chaitanya">${esc(L.nav.chaitanya)}</a>
      <a href="/gallery">${esc(L.nav.gallery)}</a>
      <a class="langswitch" href="${other.path}" hreflang="${other.lang}" title="${esc(L.altLangLabel)}">${other.lang === "hi" ? "हिंदी" : "English"}</a>
    </nav>
  </div>
</header>

<main>
  <div class="hero">
    <div class="wrap">
      <span class="pill">${esc(L.pill)}</span>
      <h1>${esc(L.h1)}</h1>
      <p>${esc(L.heroSub)}</p>
      <a class="cta" href="/bhagwatham">${esc(L.ctaRead)}</a>
      <a class="cta-alt" href="/gallery">${esc(L.ctaGallery)}</a>
      <div class="stats">
        <div class="stat"><b>12</b><span>${esc(L.stats[0])}</span></div>
        <div class="stat"><b>${totalChapters}</b><span>${esc(L.stats[1])}</span></div>
        <div class="stat"><b>9,500+</b><span>${esc(L.stats[2])}</span></div>
        <div class="stat"><b>${imageCount}</b><span>${esc(L.stats[3])}</span></div>
      </div>
    </div>
  </div>

  <section class="wrap prose">
    <h2>${esc(L.aboutH2)}</h2>
${L.aboutP.map(p => `    <p>${esc(p)}</p>`).join("\n")}
  </section>

  <section class="wrap">
    <h2>${esc(L.skandhH2)}</h2>
    <p class="sub">${esc(L.skandhSub)}</p>
    <div class="grid">
${skandhCards}
    </div>
  </section>

  <section class="wrap">
    <h2>${esc(L.featuresH2)}</h2>
    <div class="features">
${featuresHtml}
    </div>
  </section>

  <section class="wrap">
    <h2>${esc(L.faqH2)}</h2>
${faqHtml}
  </section>

  <section class="wrap">
    <div class="band">
      <h2>${esc(L.bandH2)}</h2>
      <p style="margin:10px auto 24px;max-width:560px">${esc(L.bandSub)}</p>
      <a class="cta" href="/bhagwatham">${esc(L.bandCta)}</a>
    </div>
  </section>
</main>

<footer>
  <div class="wrap">
    <div>© Build Iskcon · ${esc(L.footerTag)}</div>
    <div>
      <a href="${other.path}" hreflang="${other.lang}">${other.lang === "hi" ? "हिंदी संस्करण" : "English version"}</a>
      <a href="/chaitanya">${esc(L.nav.chaitanya)}</a>
      <a href="/bhaktigram">Bhaktigram</a>
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
    </div>
  </div>
</footer>
</body>
</html>
`;
}

// ── Emit both locales ────────────────────────────────────────────────────────
for (const [locale, outPath] of [["hi", HI_PATH], ["en", EN_PATH]]) {
  const html = renderLanding(locale);
  const outDir = path.join(PUBLIC_DIR, outPath.replace(/\//g, ""));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "index.html"), html);
  console.log(`✓ ${locale} landing (${(html.length / 1024).toFixed(1)} KB) → ${outPath}`);
}

// ── sitemap.xml ──────────────────────────────────────────────────────────────
const urls = [
  ["/", "weekly", "1.0"],
  [HI_PATH, "weekly", "0.9"],
  [EN_PATH, "weekly", "0.9"],
  ["/bhagwatham", "weekly", "0.9"],
  ["/chaitanya", "weekly", "0.8"],
  ["/gallery", "weekly", "0.7"],
  ["/bhaktigram", "weekly", "0.7"],
  ["/japa", "monthly", "0.5"],
  ["/privacy", "yearly", "0.2"],
  ["/terms", "yearly", "0.2"],
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.map(([u, freq, pri]) => {
  const isLanding = u === HI_PATH || u === EN_PATH;
  const alternates = isLanding
    ? `\n    <xhtml:link rel="alternate" hreflang="hi" href="${SITE}${HI_PATH}"/>\n    <xhtml:link rel="alternate" hreflang="en" href="${SITE}${EN_PATH}"/>\n    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${EN_PATH}"/>`
    : "";
  return `  <url>
    <loc>${SITE}${u}</loc>${alternates}
    <lastmod>${today}</lastmod>
    <changefreq>${freq}</changefreq>
    <priority>${pri}</priority>
  </url>`;
}).join("\n")}
</urlset>
`;
fs.writeFileSync(path.join(PUBLIC_DIR, "sitemap.xml"), sitemap);
console.log(`✓ sitemap.xml (${urls.length} URLs incl. hreflang alternates, lastmod ${today})`);
