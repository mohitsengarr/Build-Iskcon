import { Layout } from "@/components/layout/Layout";

// Privacy policy for Build Iskcon — an independent devotional non-profit
// project. We deliberately store almost nothing: an anonymous device id for
// likes and an optional display name for comments. No accounts, no ads,
// no tracking.
export default function Privacy() {
  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 sm:px-8 pb-16">
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-stone-800 mb-2 pt-4">
          Privacy Policy
        </h1>
        <p className="text-stone-400 text-xs mb-8">Last updated: June 2026</p>

        <div className="space-y-7 text-sm text-stone-600 leading-relaxed">
          <section>
            <h2 className="font-serif text-lg font-bold text-stone-800 mb-2">Who we are</h2>
            <p>
              Build Iskcon is an independent, non-commercial devotional project. We share
              Srimad Bhagavatam and Chaitanya Charitamrit content, devotional artwork, a japa
              counter, and information about ISKCON&apos;s temple construction mission. There are
              no user accounts on this site — you never give us an email address or password.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg font-bold text-stone-800 mb-2">What we store</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong className="text-stone-700">An anonymous device id.</strong> When you like a
                post on Bhaktigram, your browser generates a random identifier (stored in your
                browser&apos;s local storage) so we can count your like once and let you unlike it
                later. It is not linked to your name, email, or any other personal detail.
              </li>
              <li>
                <strong className="text-stone-700">An optional name for comments.</strong> If you
                comment on a post, you may type a display name. It is shown next to your comment
                and remembered in your own browser for convenience. You can comment as
                &ldquo;Anonymous&rdquo; instead.
              </li>
              <li>
                <strong className="text-stone-700">On-device preferences.</strong> Things like
                bookmarks, reading position, and japa progress stay in your browser&apos;s local
                storage and never leave your device.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-lg font-bold text-stone-800 mb-2">What we don&apos;t do</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>No advertising and no ad networks.</li>
              <li>No tracking pixels, no analytics cookies, no fingerprinting.</li>
              <li>We never sell, rent, or share any data with third parties.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-lg font-bold text-stone-800 mb-2">Donations</h2>
            <p>
              All donation links on this site lead to official ISKCON and TOVP websites. We do not
              process payments and never see any payment details.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg font-bold text-stone-800 mb-2">Removing your data</h2>
            <p>
              If you would like a comment or your likes removed, message us on Instagram at{" "}
              <a
                href="https://www.instagram.com/dailybhagwatham/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-700 hover:underline font-medium"
              >
                @dailybhagwatham
              </a>{" "}
              and we will delete them. Clearing your browser&apos;s local storage also removes the
              anonymous device id and all on-device preferences.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg font-bold text-stone-800 mb-2">Contact</h2>
            <p>
              Questions about this policy? Reach us on Instagram at{" "}
              <a
                href="https://www.instagram.com/dailybhagwatham/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-700 hover:underline font-medium"
              >
                @dailybhagwatham
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </Layout>
  );
}
