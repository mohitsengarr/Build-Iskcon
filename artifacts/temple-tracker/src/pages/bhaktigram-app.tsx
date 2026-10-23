import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { BookOpen, CalendarDays, CircleDot, Flame, HeartHandshake, MessageCircle, Music2, PlayCircle, Sparkles, Users } from "lucide-react";
import { LAUNCH_LABEL, PLAY_URL, countRows, sinceLaunch } from "@/lib/bhaktigramJoined";
import { PRIVACY_PATH, SUPPORT_EMAIL, SUPPORT_WHATSAPP_DISPLAY, supportMailto, whatsappUrl } from "@/lib/bhaktigramSupport";

// buildiskcon.com/app — the Bhaktigram landing page (SEN-935).
//
// Every screen shown here is a real screenshot of the app (18 Oct 2026), with
// other devotees' names and photos blurred on the chat list and the account
// email blurred on the library. Every claim is something those screens show.
// The one number is the live join count, read the same way /livecounter reads
// it (lib/bhaktigramJoined), so the two pages cannot disagree.

const A = "/bhaktigram/app";
const C = {
  cream: "#f7f3ec",
  paper: "#ffffff",
  ink: "#1e1a2b",
  body: "#453f5a",
  mute: "#6e6880",
  indigo: "#3f2f8c",
  indigoSoft: "#efe9ff",
  amber: "#e28a2d",
  line: "rgba(30,26,43,0.08)",
};

type Feature = {
  icon: typeof BookOpen;
  title: string;
  body: string;
  shot: string;
  alt: string;
};

const FEATURES: Feature[] = [
  {
    icon: PlayCircle,
    title: "Reels that only know Krishna",
    body: "Swipe through Srila Prabhupada, kirtan and Krishna lila. No Bigg Boss, no politics, no random ads waiting one swipe later.",
    shot: "reels.webp",
    alt: "Bhaktigram Reels tab playing a Krishna reel",
  },
  {
    icon: Sparkles,
    title: "A darshan painting in every post",
    body: "The home feed is darshan art from the Srimad Bhagavatam, with a gallery of every painting to come back to.",
    shot: "home-feed.webp",
    alt: "Bhaktigram home feed showing a darshan painting from the Bhagavatam",
  },
  {
    icon: CircleDot,
    title: "Japa counter",
    body: "Tap anywhere to count a bead. 108 beads a round, your rounds for today and your lifetime count, with the Panca-tattva and Hare Krishna maha-mantra on screen.",
    shot: "japa.webp",
    alt: "Bhaktigram japa counter",
  },
  {
    icon: BookOpen,
    title: "Read the real thing",
    body: "Srimad Bhagavatam, Chaitanya Charitamrita and Bhagavad-gita As It Is. Continue reading where you left off, with bookmarks that sync with buildiskcon.com.",
    shot: "library.webp",
    alt: "Bhaktigram library with the Bhagavatam and Chaitanya Charitamrita",
  },
  {
    icon: Flame,
    title: "Aarti, with Prabhupada singing",
    body: "Mangala-arati to Gaura-arati: the words in Devanagari or Roman, the meaning of each verse, and Srila Prabhupada singing it.",
    shot: "aarti-mangala.webp",
    alt: "Mangala Arati with the Sri Sri Gurv-astaka and a button to hear Srila Prabhupada sing it",
  },
  {
    icon: Users,
    title: "Sangha, not comments",
    body: "Channels for the Bhagavatam and the Chaitanya Charitamrita, groups, and messages with devotees.",
    shot: "chats.webp",
    alt: "Bhaktigram chats with channels and messages",
  },
];

const MORE = [
  { icon: CalendarDays, title: "Vaishnava calendar", body: "Ekadashi, festivals and appearance days, with the next Ekadashi always on top.", shot: "calendar.webp" },
  { icon: Music2, title: "Prabhupada bhajans", body: "Tap a bhajan and hear Srila Prabhupada sing it.", shot: "bhajans.webp" },
  { icon: MessageCircle, title: "Ask about Krishna", body: "Questions on the Gita, the Bhagavatam and devotional life. Answers are AI-generated and can be wrong, so the app says to ask a senior devotee too.", shot: "ask-krishna.webp" },
  { icon: HeartHandshake, title: "Seva & donation", body: "51 ISKCON temple projects with their construction progress, to give where your heart calls.", shot: "seva-donation.webp" },
];

function Lotus({ size = 40 }: { size?: number }) {
  return <img src={`${A}/lotus.png`} width={size} height={Math.round(size * 441 / 670)} alt="" aria-hidden="true" style={{ display: "block" }} />;
}

function PlayButton({ big = false }: { big?: boolean }) {
  return (
    <a
      href={PLAY_URL}
      target="_blank"
      rel="noopener"
      className="inline-flex items-center gap-3 rounded-2xl font-semibold transition-transform active:scale-[0.98] hover:-translate-y-0.5"
      style={{ background: C.ink, color: "#fff", padding: big ? "16px 26px" : "11px 18px", fontSize: big ? 18 : 15, boxShadow: "0 12px 30px -12px rgba(30,26,43,.6)" }}
    >
      <svg width={big ? 24 : 20} height={big ? 24 : 20} viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#34A853" d="M3.6 2.3 13.4 12 3.6 21.7c-.4-.2-.6-.6-.6-1.1V3.4c0-.5.2-.9.6-1.1Z" />
        <path fill="#FBBC04" d="m16.7 15.3-3.3-3.3 3.3-3.3 3.7 2.1c.9.5.9 1.8 0 2.3l-3.7 2.2Z" />
        <path fill="#4285F4" d="M16.7 8.7 13.4 12 3.6 2.3c.3-.2.8-.2 1.2 0l11.9 6.4Z" />
        <path fill="#EA4335" d="M16.7 15.3 4.8 21.7c-.4.2-.9.2-1.2 0L13.4 12l3.3 3.3Z" />
      </svg>
      <span className="text-left leading-tight">
        <span className="block opacity-75" style={{ fontSize: big ? 12 : 11, fontWeight: 500 }}>Get it on</span>
        Google Play
      </span>
    </a>
  );
}

function Phone({ children, tilt = 0, width = 270 }: { children: React.ReactNode; tilt?: number; width?: number }) {
  return (
    <div
      className="relative mx-auto"
      style={{
        width,
        padding: 9,
        borderRadius: width * 0.13,
        background: "#141219",
        boxShadow: "0 40px 70px -30px rgba(30,26,43,.55), 0 14px 26px -12px rgba(30,26,43,.35)",
        transform: tilt ? `rotate(${tilt}deg)` : undefined,
      }}
    >
      <div className="overflow-hidden" style={{ borderRadius: width * 0.11, background: C.cream, aspectRatio: "946 / 2000" }}>
        {children}
      </div>
    </div>
  );
}

function Shot({ name, alt }: { name: string; alt: string }) {
  return <img src={`${A}/${name}`} alt={alt} loading="lazy" width={540} height={1142} className="block h-full w-full object-cover object-top" />;
}

function useJoined() {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    countRows(sinceLaunch).then((v) => { if (alive && v != null) setN(v); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return n;
}

export default function BhaktigramApp() {
  const joined = useJoined();
  const title = "Bhaktigram — reels, japa, darshan and the Bhagavatam in one devotional app";
  const description =
    "Bhaktigram is a free devotional app for Krishna bhaktas: reels that only know Krishna, a japa counter, darshan paintings, the Srimad Bhagavatam and Chaitanya Charitamrita to read, aarti with Srila Prabhupada singing, and sangha. Android.";

  return (
    <div style={{ background: C.cream, color: C.ink, minHeight: "100vh" }} className="bg-app font-sans">
      {/* The site styles every heading in its serif face; Bhaktigram's own type is a sans. */}
      <style>{`.bg-app h1, .bg-app h2, .bg-app h3 { font-family: Inter, ui-sans-serif, system-ui, sans-serif; }`}</style>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href="https://buildiskcon.com/app" />
        <meta property="og:title" content="Bhaktigram — five minutes of darshan that stays five minutes" />
        <meta property="og:description" content={description} />
        <meta property="og:image" content="https://buildiskcon.com/bhaktigram/app/og.jpg" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:url" content="https://buildiskcon.com/app" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://buildiskcon.com/bhaktigram/app/og.jpg" />
        <meta name="theme-color" content={C.cream} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Comfortaa:wght@700&display=swap" rel="stylesheet" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "MobileApplication",
          name: "Bhaktigram",
          operatingSystem: "ANDROID",
          applicationCategory: "LifestyleApplication",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          downloadUrl: PLAY_URL,
          description,
        })}</script>
      </Helmet>

      {/* header */}
      <header className="sticky top-0 z-30 backdrop-blur" style={{ background: "rgba(247,243,236,.82)", borderBottom: `1px solid ${C.line}` }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <a href="#top" className="flex items-center gap-2" aria-label="Bhaktigram">
            <Lotus size={34} />
            <span style={{ fontFamily: "Comfortaa, sans-serif", fontWeight: 700, fontSize: 22, color: C.indigo }}>Bhaktigram</span>
          </a>
          <PlayButton />
        </div>
      </header>

      <main id="top">
        {/* hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 sm:px-6 md:grid-cols-[1.1fr_0.9fr] md:pt-16">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold" style={{ background: C.indigoSoft, color: C.indigo }}>
              Free devotional app · Android
            </p>
            <h1 className="text-[40px] font-extrabold leading-[1.05] tracking-tight sm:text-[56px]" style={{ color: C.ink }}>
              Five minutes of darshan that <span style={{ color: C.indigo }}>stays five minutes.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed" style={{ color: C.body }}>
              You open Instagram for darshan and an hour later you are watching Bigg Boss, politics and ads.
              Bhaktigram's feed only knows Krishna: reels, darshan paintings, japa, the Bhagavatam, aarti and sangha, in one app.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <PlayButton big />
              <span className="text-sm" style={{ color: C.mute }}>Free · Android only for now</span>
            </div>
            <p className="mt-6 text-sm" style={{ color: C.mute }} aria-live="polite">
              {joined != null ? (
                <>
                  <Link href="/livecounter" className="font-bold underline-offset-4 hover:underline" style={{ color: C.amber }}>
                    {joined.toLocaleString("en-IN")} devotees
                  </Link>{" "}
                  have joined since it went live on {LAUNCH_LABEL}.
                </>
              ) : (
                <>Live on Google Play since {LAUNCH_LABEL}.</>
              )}
            </p>
          </div>
          <div className="relative">
            <div className="absolute inset-0 -z-0 mx-auto rounded-full blur-3xl" style={{ background: "radial-gradient(circle, rgba(226,138,45,.28), rgba(124,106,232,.18) 50%, transparent 70%)", maxWidth: 420 }} aria-hidden="true" />
            <Phone width={290}>
              <video
                src={`${A}/launch-reel.mp4`}
                poster={`${A}/launch-reel-poster.jpg`}
                className="block h-full w-full object-cover"
                autoPlay
                muted
                loop
                playsInline
                controls
                preload="metadata"
                aria-label="Bhaktigram launch reel"
              />
            </Phone>
            <p className="mt-4 text-center text-xs" style={{ color: C.mute }}>Tap for sound</p>
          </div>
        </section>

        {/* features */}
        <section className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            const flip = i % 2 === 1;
            return (
              <div key={f.title} className="grid items-center gap-8 border-t py-14 md:grid-cols-2 md:gap-16" style={{ borderColor: C.line }}>
                <div className={flip ? "md:order-2" : ""}>
                  <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: C.indigoSoft, color: C.indigo }}>
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{f.title}</h2>
                  <p className="mt-4 max-w-md text-lg leading-relaxed" style={{ color: C.body }}>{f.body}</p>
                </div>
                <div className={flip ? "md:order-1" : ""}>
                  <Phone width={250} tilt={flip ? -2 : 2}>
                    <Shot name={f.shot} alt={f.alt} />
                  </Phone>
                </div>
              </div>
            );
          })}
        </section>

        {/* and more */}
        <section className="py-16" style={{ background: C.paper, borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">And more</h2>
            <div className="mt-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
              {MORE.map((m) => {
                const Icon = m.icon;
                return (
                  <div key={m.title}>
                    <Phone width={190}>
                      <Shot name={m.shot} alt={`Bhaktigram ${m.title}`} />
                    </Phone>
                    <div className="mt-6 flex items-center gap-2" style={{ color: C.indigo }}>
                      <Icon size={18} aria-hidden="true" />
                      <h3 className="text-lg font-bold" style={{ color: C.ink }}>{m.title}</h3>
                    </div>
                    <p className="mt-2 text-[15px] leading-relaxed" style={{ color: C.body }}>{m.body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* final call */}
        <section className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
          <div className="mx-auto mb-6 w-fit"><Lotus size={88} /></div>
          <h2 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Start your morning with darshan.</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg" style={{ color: C.body }}>
            Free on Android. There is no iPhone version yet.
          </p>
          <div className="mt-8 flex justify-center"><PlayButton big /></div>
        </section>

        {/* support (App Store support URL; Mohit, 23 Oct 2026) */}
        <section id="support" className="mx-auto max-w-3xl scroll-mt-20 px-4 pb-20 sm:px-6">
          <div className="rounded-3xl p-6 sm:p-8" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
            <h2 className="text-2xl font-bold" style={{ color: C.ink }}>Need help?</h2>
            <p className="mt-2" style={{ color: C.body }}>
              Questions, a problem with the app, or a suggestion: write to us and a devotee from the team will reply.
            </p>
            <ul className="mt-5 space-y-3" style={{ color: C.body }}>
              <li>
                <span className="font-semibold" style={{ color: C.ink }}>Email: </span>
                <a href={supportMailto("Bhaktigram support")} className="underline underline-offset-4" style={{ color: C.indigo }}>{SUPPORT_EMAIL}</a>
              </li>
              <li>
                <span className="font-semibold" style={{ color: C.ink }}>WhatsApp: </span>
                <a href={whatsappUrl("Hare Krishna! I need help with Bhaktigram.")} target="_blank" rel="noopener" className="underline underline-offset-4" style={{ color: C.indigo }}>{SUPPORT_WHATSAPP_DISPLAY}</a>
              </li>
              <li>
                <span className="font-semibold" style={{ color: C.ink }}>Your data: </span>
                read our <Link href={PRIVACY_PATH} className="underline underline-offset-4" style={{ color: C.indigo }}>privacy policy</Link>, or{" "}
                <a href="/bhaktigram/delete.html" className="underline underline-offset-4" style={{ color: C.indigo }}>delete your account</a>.
              </li>
            </ul>
          </div>
        </section>
      </main>

      <footer style={{ borderTop: `1px solid ${C.line}` }}>
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm sm:flex-row sm:px-6" style={{ color: C.mute }}>
          <div className="flex items-center gap-2">
            <Lotus size={24} />
            <span>Bhaktigram, from <Link href="/" className="underline-offset-4 hover:underline">Build Iskcon</Link></span>
          </div>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2" aria-label="Bhaktigram links">
            <Link href="/livecounter" className="hover:underline underline-offset-4">Live counter</Link>
            <Link href={PRIVACY_PATH} className="hover:underline underline-offset-4">Privacy</Link>
            <a href="#support" className="hover:underline underline-offset-4">Support</a>
            <a href="/bhaktigram/delete.html" className="hover:underline underline-offset-4">Delete your account</a>
            <a href={PLAY_URL} target="_blank" rel="noopener" className="hover:underline underline-offset-4">Google Play</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
