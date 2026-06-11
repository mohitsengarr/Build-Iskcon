/**
 * Generates the SEO landing page for Srimad Bhagavatam at
 * /shrimad-bhagavatam/ plus a fresh sitemap.xml.
 *
 * Why static: the site is a client-rendered SPA on Vercel — crawlers get an
 * empty <div id="root"> shell for every route. This script runs in the
 * Vercel buildCommand AFTER generate-static-api.mjs and emits a fully
 * pre-rendered HTML document (zero JS, inline CSS, real Hindi content,
 * JSON-LD Book/FAQPage/BreadcrumbList) built from the same chapter-index
 * data the reader uses. Vercel serves filesystem matches before SPA
 * rewrites — the exact mechanism /api/bhagwatham/* already relies on.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");
const SITE = "https://buildiskcon.com";

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

// Standard BBT canto subtitles — strong keyword content for हिंदी queries.
const SKANDH_NAMES = {
  1: "सृष्टि", 2: "ब्रह्मांडीय अभिव्यक्ति", 3: "यथास्थिति",
  4: "चतुर्थ वर्ग की सृष्टि", 5: "सृष्टि की प्रेरणा", 6: "मानवता के निर्धारित कर्तव्य",
  7: "ईश्वर का विज्ञान", 8: "ब्रह्मांडीय सृष्टियों का प्रलय", 9: "मुक्ति",
  10: "परम कल्याण", 11: "सामान्य इतिहास", 12: "पतन का युग",
};
// A handful of chapter-art images for the skandh cards (all exist as static
// files under /api/bhagwatham/images/). Picked one per skandh where available.
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

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const totalChapters = chapters.length;
const today = new Date().toISOString().slice(0, 10);

// ── FAQ (rendered + mirrored in FAQPage JSON-LD) ─────────────────────────────
const FAQS = [
  ["क्या श्रीमद्भागवत हिंदी में निःशुल्क पढ़ सकते हैं?",
   `हाँ — सभी 12 स्कंध और ${totalChapters} अध्याय बिल्कुल निःशुल्क उपलब्ध हैं। न कोई पंजीकरण, न कोई शुल्क। मूल देवनागरी श्लोक, शब्दार्थ, अनुवाद और तात्पर्य सहित।`],
  ["यह किसका अनुवाद है?",
   "यह भक्तिवेदान्त बुक ट्रस्ट (BBT) का हिंदी संस्करण है — श्रील ए.सी. भक्तिवेदान्त स्वामी प्रभुपाद के अनुवाद एवं तात्पर्य पर आधारित।"],
  ["क्या श्लोकों को सुन भी सकते हैं?",
   "हाँ — किसी भी पंक्ति को चुनकर 'Listen' दबाइए। AI आधारित वाचन (टेक्स्ट-टू-स्पीच) शुद्ध हिंदी उच्चारण में सुनाता है।"],
  ["श्रीमद्भागवत में कुल कितने स्कंध और अध्याय हैं?",
   `श्रीमद्भागवत महापुराण में 12 स्कंध हैं। इस संस्करण में ${totalChapters} अध्याय उपलब्ध हैं — दशम स्कंध (श्रीकृष्ण की लीलाएँ) सबसे बड़ा है, जिसमें ${bySkandh.get(10)?.length || 86} अध्याय हैं।`],
  ["क्या मोबाइल पर पढ़ना सुविधाजनक है?",
   "हाँ — पाठक मोबाइल के लिए विशेष रूप से बनाया गया है: फ़ॉन्ट आकार, पंक्ति-दूरी और थीम बदल सकते हैं, बुकमार्क लगा सकते हैं, और जहाँ छोड़ा था वहीं से आगे पढ़ सकते हैं।"],
];

// ── Skandh cards ─────────────────────────────────────────────────────────────
const skandhCards = [...bySkandh.entries()]
  .sort((a, b) => a[0] - b[0])
  .map(([s, list]) => {
    const art = artFor(s);
    const first = list[0]?.title || "";
    return `      <a class="card" href="/bhagwatham">
        ${art ? `<img src="${art}" alt="स्कंध ${s} — ${esc(SKANDH_NAMES[s] || "")} चित्र" loading="lazy" width="336" height="272">` : ""}
        <div class="card-body">
          <div class="card-kicker">स्कंध ${s}</div>
          <h3>${esc(SKANDH_NAMES[s] || `स्कंध ${s}`)}</h3>
          <p>${list.length} अध्याय · ${esc(first.slice(0, 52))}${first.length > 52 ? "…" : ""}</p>
        </div>
      </a>`;
  }).join("\n");

const faqHtml = FAQS.map(([q, a]) => `      <details>
        <summary>${esc(q)}</summary>
        <p>${esc(a)}</p>
      </details>`).join("\n");

// ── JSON-LD ──────────────────────────────────────────────────────────────────
const jsonLd = [
  {
    "@context": "https://schema.org", "@type": "Book",
    name: "श्रीमद्भागवत महापुराण (Srimad Bhagavatam)",
    alternateName: ["Srimad Bhagavatam Hindi", "भागवत पुराण", "Bhagavata Purana"],
    author: { "@type": "Person", name: "श्रील व्यासदेव (Srila Vyasadeva)" },
    translator: { "@type": "Organization", name: "Bhaktivedanta Book Trust (BBT)" },
    inLanguage: "hi",
    numberOfPages: 9500,
    isAccessibleForFree: true,
    url: `${SITE}/shrimad-bhagavatam/`,
    image: `${SITE}/api/bhagwatham/images/chapter-001.jpg`,
    description: `श्रीमद्भागवत महापुराण के सभी 12 स्कंध और ${totalChapters} अध्याय हिंदी में — मूल देवनागरी श्लोक, शब्दार्थ, अनुवाद एवं तात्पर्य सहित, बिल्कुल निःशुल्क।`,
    workExample: { "@type": "Book", bookFormat: "https://schema.org/EBook", potentialAction: { "@type": "ReadAction", target: `${SITE}/bhagwatham` } },
  },
  {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: FAQS.map(([q, a]) => ({
      "@type": "Question", name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  },
  {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Build Iskcon", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "श्रीमद्भागवत", item: `${SITE}/shrimad-bhagavatam/` },
    ],
  },
];

// ── Page ─────────────────────────────────────────────────────────────────────
const title = `श्रीमद्भागवत हिंदी में पढ़ें — 12 स्कंध, ${totalChapters} अध्याय निःशुल्क | Build Iskcon`;
const description = `श्रीमद्भागवत महापुराण ऑनलाइन हिंदी में पढ़ें — सभी 12 स्कंध, ${totalChapters} अध्याय। देवनागरी श्लोक, शब्दार्थ, अनुवाद, तात्पर्य, AI ऑडियो और बुकमार्क। BBT संस्करण, बिल्कुल निःशुल्क।`;

const html = `<!DOCTYPE html>
<html lang="hi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${SITE}/shrimad-bhagavatam/">
<meta property="og:site_name" content="Build Iskcon">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="book">
<meta property="og:url" content="${SITE}/shrimad-bhagavatam/">
<meta property="og:image" content="${SITE}/api/bhagwatham/images/chapter-001.jpg">
<meta property="og:locale" content="hi_IN">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
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
  h1{font-size:clamp(28px,5vw,44px);font-weight:700;line-height:1.35;max-width:760px;margin:0 auto 14px}
  .hero p{max-width:620px;margin:0 auto 28px;color:var(--muted);font-size:17px}
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
      <a href="/">होम</a>
      <a href="/bhagwatham">भागवत पढ़ें</a>
      <a href="/chaitanya">चैतन्य चरितामृत</a>
      <a href="/gallery">गैलरी</a>
    </nav>
  </div>
</header>

<main>
  <div class="hero">
    <div class="wrap">
      <span class="pill">हिंदी · देवनागरी · निःशुल्क</span>
      <h1>श्रीमद्भागवत महापुराण — सम्पूर्ण ${totalChapters} अध्याय हिंदी में ऑनलाइन पढ़ें</h1>
      <p>मूल देवनागरी श्लोक, शब्दार्थ, अनुवाद एवं तात्पर्य — भक्तिवेदान्त बुक ट्रस्ट (BBT) संस्करण। AI ऑडियो वाचन, शब्दकोश और बुकमार्क के साथ।</p>
      <a class="cta" href="/bhagwatham">📖 पढ़ना शुरू करें</a>
      <a class="cta-alt" href="/gallery">चित्र गैलरी देखें →</a>
      <div class="stats">
        <div class="stat"><b>12</b><span>स्कंध</span></div>
        <div class="stat"><b>${totalChapters}</b><span>अध्याय</span></div>
        <div class="stat"><b>9,500+</b><span>पृष्ठ</span></div>
        <div class="stat"><b>${imageCount}</b><span>AI चित्र</span></div>
      </div>
    </div>
  </div>

  <section class="wrap prose">
    <h2>श्रीमद्भागवत क्या है?</h2>
    <p>श्रीमद्भागवत महापुराण (भागवत पुराण) वेदव्यास रचित अठारह पुराणों में सर्वोच्च माना जाता है — इसे "अमल पुराण" अर्थात् निर्मल पुराण कहा गया है। इसमें भगवान श्रीकृष्ण की लीलाओं, भक्ति योग, सृष्टि की उत्पत्ति, अवतारों और परम सत्य के विज्ञान का विस्तृत वर्णन है।</p>
    <p>यह संस्करण भक्तिवेदान्त बुक ट्रस्ट (BBT) के हिंदी अनुवाद पर आधारित है — श्रील ए.सी. भक्तिवेदान्त स्वामी प्रभुपाद के तात्पर्य सहित। प्रत्येक अध्याय में मूल संस्कृत श्लोक देवनागरी में, शब्द-दर-शब्द अर्थ (शब्दार्थ), हिंदी अनुवाद और विस्तृत तात्पर्य दिया गया है।</p>
    <p>दशम स्कंध — श्रीकृष्ण की बाल लीलाओं से लेकर द्वारका लीला तक — ${bySkandh.get(10)?.length || 86} अध्यायों के साथ सबसे विस्तृत है। प्रथम स्कंध से क्रमशः पढ़ें या किसी भी स्कंध से सीधे आरम्भ करें।</p>
  </section>

  <section class="wrap">
    <h2>बारह स्कंध</h2>
    <p class="sub">हर स्कंध पर क्लिक करके सीधे पाठक में पढ़ना आरम्भ करें।</p>
    <div class="grid">
${skandhCards}
    </div>
  </section>

  <section class="wrap">
    <h2>पाठक की विशेषताएँ</h2>
    <div class="features">
      <div class="feature"><b>🔊 AI ऑडियो वाचन</b><span>कोई भी पंक्ति चुनें और शुद्ध हिंदी उच्चारण में सुनें।</span></div>
      <div class="feature"><b>📚 शब्दकोश</b><span>कठिन शब्द पर एक क्लिक — तुरंत अर्थ।</span></div>
      <div class="feature"><b>🔖 बुकमार्क</b><span>जहाँ छोड़ा था, वहीं से आगे — हर डिवाइस पर।</span></div>
      <div class="feature"><b>🎨 AI चित्र गैलरी</b><span>हर अध्याय के लिए शास्त्रीय शैली के देवनात्मक चित्र।</span></div>
      <div class="feature"><b>📱 मोबाइल अनुकूल</b><span>फ़ॉन्ट, थीम और पंक्ति-दूरी अपनी पसंद से।</span></div>
      <div class="feature"><b>🆓 बिल्कुल निःशुल्क</b><span>न पंजीकरण, न शुल्क, न विज्ञापन।</span></div>
    </div>
  </section>

  <section class="wrap">
    <h2>अक्सर पूछे जाने वाले प्रश्न</h2>
${faqHtml}
  </section>

  <section class="wrap">
    <div class="band">
      <h2>आज ही पढ़ना आरम्भ करें</h2>
      <p style="margin:10px auto 24px;max-width:520px">प्रथम स्कंध, प्रथम अध्याय — "मुनियों की जिज्ञासा" से आपकी भागवत यात्रा शुरू होती है।</p>
      <a class="cta" href="/bhagwatham">श्रीमद्भागवत पढ़ें →</a>
    </div>
  </section>
</main>

<footer>
  <div class="wrap">
    <div>© Build Iskcon · श्रीमद्भागवत हिंदी (BBT संस्करण)</div>
    <div>
      <a href="/chaitanya">चैतन्य चरितामृत</a>
      <a href="/bhaktigram">Bhaktigram</a>
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
    </div>
  </div>
</footer>
</body>
</html>
`;

const outDir = path.join(PUBLIC_DIR, "shrimad-bhagavatam");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "index.html"), html);
console.log(`✓ landing page (${(html.length / 1024).toFixed(1)} KB) → /shrimad-bhagavatam/`);

// ── sitemap.xml (replaces the stale hand-written one) ────────────────────────
const urls = [
  ["/", "weekly", "1.0"],
  ["/shrimad-bhagavatam/", "weekly", "0.9"],
  ["/bhagwatham", "weekly", "0.9"],
  ["/chaitanya", "weekly", "0.8"],
  ["/gallery", "weekly", "0.7"],
  ["/bhaktigram", "weekly", "0.7"],
  ["/japa", "monthly", "0.5"],
  ["/privacy", "yearly", "0.2"],
  ["/terms", "yearly", "0.2"],
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, freq, pri]) => `  <url>
    <loc>${SITE}${u}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${freq}</changefreq>
    <priority>${pri}</priority>
  </url>`).join("\n")}
</urlset>
`;
fs.writeFileSync(path.join(PUBLIC_DIR, "sitemap.xml"), sitemap);
console.log(`✓ sitemap.xml (${urls.length} URLs, lastmod ${today})`);
