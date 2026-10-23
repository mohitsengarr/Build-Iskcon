import type { ReactNode } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { PLAY_URL } from "@/lib/bhaktigramJoined";
import {
  SUPPORT_EMAIL,
  SUPPORT_WHATSAPP_DISPLAY,
  supportMailto,
  whatsappUrl,
} from "@/lib/bhaktigramSupport";

// buildiskcon.com/app/privacy — the Bhaktigram app privacy policy (SEN-965 /
// App Store submission, Mohit 23 Oct 2026). Written from a code-and-database
// review of what the app actually collects (iOS build 34 / ios/integration-merge
// and Android master), and it must match the App Store privacy label. Before
// changing the app's data practices, update this page in the same change.
//
// The older static page /bhaktigram/privacy.html now forwards here, so the Play
// listing's link keeps working. buildiskcon.com/privacy is the website's own
// policy, not the app's.

const C = {
  cream: "#f7f3ec",
  paper: "#ffffff",
  ink: "#1e1a2b",
  body: "#453f5a",
  mute: "#6e6880",
  indigo: "#3f2f8c",
  line: "rgba(30,26,43,0.08)",
};

const EFFECTIVE = "23 October 2026";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="mb-3 text-xl font-semibold" style={{ color: C.ink }}>{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <li>
      <span className="font-semibold" style={{ color: C.ink }}>{label}: </span>
      {children}
    </li>
  );
}

const PROVIDERS: Array<{ name: string; what: string }> = [
  { name: "Supabase", what: "hosts our database, file storage and sign-in. Our servers are in Mumbai, India." },
  { name: "Apple", what: "delivers notifications to iPhones and provides Sign in with Apple." },
  { name: "Google", what: "delivers notifications to Android phones, provides Google sign-in, and translates a chat message when you tap Translate (the message text is sent to Google Translate)." },
  { name: "Agora", what: "carries voice and video calls in real time. We do not record calls." },
  { name: "Jitsi Meet", what: "a backup route for calls when the main route is unavailable." },
  { name: "Anthropic", what: "receives the questions you type into Ask about Krishna, so its Claude model can write an answer." },
  { name: "Sarvam AI", what: "turns a voice note into text when you ask for it, and reads verses aloud." },
  { name: "Resend", what: "sends the one-time sign-in codes to your email." },
  { name: "YouTube", what: "plays reels and videos through YouTube's own player. YouTube's privacy policy applies to what you watch there." },
  { name: "Hotjar", what: "measures how pages on buildiskcon.com are used, including those pages when they open inside the app (for example Seva)." },
];

export default function BhaktigramPrivacy() {
  const title = "Bhaktigram Privacy Policy";
  const description = "What the Bhaktigram app collects, why, who helps us run it, and how to delete your account.";

  return (
    <div style={{ background: C.cream, color: C.body, minHeight: "100vh" }} className="bg-privacy font-sans">
      <style>{`.bg-privacy h1, .bg-privacy h2, .bg-privacy h3 { font-family: Inter, ui-sans-serif, system-ui, sans-serif; }`}</style>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href="https://buildiskcon.com/app/privacy" />
        <meta name="theme-color" content={C.cream} />
      </Helmet>

      <header style={{ borderBottom: `1px solid ${C.line}`, background: "rgba(247,243,236,.92)" }}>
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/app" className="flex items-center gap-2" aria-label="Bhaktigram home">
            <img src="/bhaktigram/app/lotus.png" width={30} height={20} alt="" aria-hidden="true" style={{ display: "block" }} />
            <span style={{ fontWeight: 700, fontSize: 20, color: C.indigo }}>Bhaktigram</span>
          </Link>
          <a href={supportMailto("Bhaktigram privacy")} className="text-sm underline-offset-4 hover:underline" style={{ color: C.indigo }}>
            Contact us
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-20 pt-10 sm:px-6">
        <h1 className="text-3xl font-bold sm:text-4xl" style={{ color: C.ink }}>Bhaktigram Privacy Policy</h1>
        <p className="mt-2 text-sm" style={{ color: C.mute }}>Effective {EFFECTIVE}. Applies to the Bhaktigram app on Android and iPhone.</p>

        <div className="mt-8 rounded-2xl p-5 text-[15px] leading-relaxed" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
          <p className="font-semibold" style={{ color: C.ink }}>In short</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>We collect what the app needs to work: your profile, what you post and send, and a few technical details.</li>
            <li>We show no ads, we do not track you across other apps or websites, and we never sell your data.</li>
            <li>You can delete your account and data from inside the app at any time.</li>
          </ul>
        </div>

        <div className="mt-10 space-y-10 text-[15px] leading-relaxed">
          <Section id="who" title="Who we are">
            <p>
              Bhaktigram (app id com.buildiskcon.bhaktigram) is a devotional app for Krishna devotees, made by Build ISKCON,
              an independent devotional project run by Sengar Consultancy Private Limited. Bhaktigram is not an official app
              of ISKCON. In this policy, "we" means the Bhaktigram team.
            </p>
            <p>
              Contact: <a href={supportMailto("Bhaktigram privacy")} className="underline underline-offset-4" style={{ color: C.indigo }}>{SUPPORT_EMAIL}</a>{" "}
              or WhatsApp <a href={whatsappUrl()} className="underline underline-offset-4" style={{ color: C.indigo }}>{SUPPORT_WHATSAPP_DISPLAY}</a>.
            </p>
          </Section>

          <Section id="collect" title="What we collect">
            <ul className="list-disc space-y-2 pl-5">
              <Item label="Your profile">
                a random identifier created for your install, the display name and username you choose, and if you add them, a
                photo, bio, link and devotional interests.
              </Item>
              <Item label="Sign-in (optional)">
                if you sign in, your email address. With Google or Apple sign-in we also receive your name and, from Google, your
                profile photo. Sign in with Apple may give us a private relay address instead of your real email.
              </Item>
              <Item label="What you create">
                posts, stories, comments, chat and channel messages, voice notes, photos and videos, polls, contacts and
                locations you choose to share in a chat, events you add, reports you file, bookmarks and reading progress, and
                your japa counts.
              </Item>
              <Item label="Your connections">who you follow, close friends, the groups you join, and the people you block or restrict.</Item>
              <Item label="Location, only when you choose">
                sharing your location in a chat or using your current place when adding an event saves those coordinates. Adding
                a place to a post saves only a town name. We also record your phone's time zone once, to count devotees by
                region. Sorting temples and events by distance happens on your phone and is not sent to us.
              </Item>
              <Item label="How you use the app">likes, which reels and stories you have viewed (so we don't repeat them), and how many questions you ask.</Item>
              <Item label="Technical details">a notification token, and your IP address and device or browser details when you sign in or ask a question, for security and to prevent abuse.</Item>
            </ul>
            <p>
              <span className="font-semibold" style={{ color: C.ink }}>Religious beliefs.</span> Bhaktigram is a devotional app,
              so your interests, japa counts, groups and activity can reveal your religious beliefs. We treat this as sensitive
              information and use it only to run the app.
            </p>
            <p>
              <span className="font-semibold" style={{ color: C.ink }}>What we do not collect:</span> payment details (donations
              happen on each temple's own website or in your own UPI app), health data, your browsing history, or advertising
              identifiers. The Invite screen reads your phone's contacts on your phone only, to let you pick someone; nothing from
              your address book is uploaded.
            </p>
          </Section>

          <Section id="use" title="How we use it">
            <ul className="list-disc space-y-2 pl-5">
              <li>To run the app: show your feed and profile, deliver messages and calls, sync your bookmarks and japa across devices, and answer your questions.</li>
              <li>To keep the community safe: blocking, reporting, moderation and preventing abuse.</li>
              <li>To send the notifications you allow, such as the daily verse and messages from people you talk to.</li>
              <li>To understand use in aggregate, for example how many devotees have joined in each region.</li>
            </ul>
            <p>We do not use your data for advertising, and we do not combine it with data from other companies to track you.</p>
          </Section>

          <Section id="see" title="Who can see what">
            <p>
              Your profile, posts, comments and stories can be seen by other devotees, subject to your account's privacy setting.
              Messages are delivered to the people in that chat or group. Do not share anything in Bhaktigram that you would not
              want those people to see.
            </p>
            <p>
              Devotional paintings published by Bhaktigram's own editorial account may also be posted to Instagram and Threads.
              Your personal posts and messages are never cross-posted.
            </p>
          </Section>

          <Section id="share" title="Companies that help us run the app">
            <p>We share data only with these providers, and only what each needs to do its job:</p>
            <ul className="list-disc space-y-2 pl-5">
              {PROVIDERS.map((p) => (
                <li key={p.name}><span className="font-semibold" style={{ color: C.ink }}>{p.name}</span> {p.what}</li>
              ))}
            </ul>
            <p>Some of these providers process data outside India, including in the United States.</p>
          </Section>

          <Section id="keep" title="How long we keep it">
            <p>
              We keep your data while your account exists. Stories disappear from view after 24 hours, but their files are kept
              until you delete them or your account. Chats with disappearing messages turned on are removed on the schedule you
              choose. Sign-in codes and security logs are kept to protect accounts; you can ask us to remove them.
            </p>
          </Section>

          <Section id="delete" title="Deleting your account and your rights">
            <p>
              In the app, go to Profile → Delete account. This removes your profile, posts, stories, post comments, messages,
              likes, follows, bookmarks, japa counts, notification tokens, and the photos and videos you posted. Some records
              linked to your account are not yet removed automatically: sign-in records, device registration, your region
              entry, events you added, reel comments, and photos or videos you sent in private chats. Email{" "}
              <a href={supportMailto("Delete my Bhaktigram data")} className="underline underline-offset-4" style={{ color: C.indigo }}>{SUPPORT_EMAIL}</a>{" "}
              and we will delete them within 30 days. You can also use our <a href="/bhaktigram/delete.html" className="underline underline-offset-4" style={{ color: C.indigo }}>account deletion page</a>.
            </p>
            <p>
              You can ask to see, correct or delete your data, or withdraw a permission you gave, by writing to us. Where the
              law gives you the right, you can also complain to your data protection authority.
            </p>
          </Section>

          <Section id="security" title="Security">
            <p>
              Data travels between the app and our servers over encrypted connections (HTTPS). We are steadily tightening who can
              read and change data on our servers. No online service can promise perfect security, so please keep sensitive
              personal matters out of chats.
            </p>
          </Section>

          <Section id="children" title="Children">
            <p>Bhaktigram is not meant for children under 13, and we do not knowingly collect their data. If you believe a child has an account, write to us and we will delete it.</p>
          </Section>

          <Section id="changes" title="Changes to this policy">
            <p>When we change how the app handles data, we update this page and its effective date.</p>
          </Section>

          <Section id="contact" title="Contact">
            <p>
              Email <a href={supportMailto("Bhaktigram privacy")} className="underline underline-offset-4" style={{ color: C.indigo }}>{SUPPORT_EMAIL}</a>{" "}
              or WhatsApp <a href={whatsappUrl()} className="underline underline-offset-4" style={{ color: C.indigo }}>{SUPPORT_WHATSAPP_DISPLAY}</a>.
            </p>
          </Section>
        </div>
      </main>

      <footer style={{ borderTop: `1px solid ${C.line}` }}>
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-8 text-sm sm:px-6" style={{ color: C.mute }}>
          <Link href="/app" className="hover:underline underline-offset-4">Bhaktigram</Link>
          <a href="/bhaktigram/delete.html" className="hover:underline underline-offset-4">Delete your account</a>
          <a href={PLAY_URL} target="_blank" rel="noopener" className="hover:underline underline-offset-4">Google Play</a>
        </div>
      </footer>
    </div>
  );
}
