import { Layout } from "@/components/layout/Layout";

// Terms of use for Build Iskcon — a free, devotional, non-commercial site.
export default function Terms() {
  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 sm:px-8 pb-16">
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-stone-800 mb-2 pt-4">
          Terms of Use
        </h1>
        <p className="text-stone-400 text-xs mb-8">Last updated: June 2026</p>

        <div className="space-y-7 text-sm text-stone-600 leading-relaxed">
          <section>
            <h2 className="font-serif text-lg font-bold text-stone-800 mb-2">About this site</h2>
            <p>
              Build Iskcon is a free devotional and educational resource offered in service of
              Srila Prabhupada&apos;s mission. It is an independent initiative and not an official
              ISKCON website. By using the site you agree to these terms.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg font-bold text-stone-800 mb-2">Content and artwork</h2>
            <p>
              The illustrations in the gallery and on Bhaktigram are AI-generated devotional
              artwork inspired by the Srimad Bhagavatam and Chaitanya Charitamrit. You are welcome
              to download and share them for personal, devotional, non-commercial use. Scripture
              text and summaries are provided for study; please verify against authorized printed
              editions for formal use.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg font-bold text-stone-800 mb-2">Community conduct</h2>
            <p>
              Comments are a shared devotional space. Please keep them respectful. We may remove
              comments that are offensive, spam, or off-topic, without notice.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg font-bold text-stone-800 mb-2">Donations</h2>
            <p>
              Donation links on this site lead to official ISKCON and TOVP websites. Any donation
              you make is a transaction between you and those organizations — we do not collect or
              process funds.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg font-bold text-stone-800 mb-2">No warranties</h2>
            <p>
              The site and its content are provided &ldquo;as is&rdquo;, without warranties of any
              kind. AI-generated artwork and summaries may contain inaccuracies. We may change or
              remove content and features at any time.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg font-bold text-stone-800 mb-2">Changes to these terms</h2>
            <p>
              We may update these terms from time to time. Continued use of the site after an
              update means you accept the revised terms.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg font-bold text-stone-800 mb-2">Contact</h2>
            <p>
              Questions? Reach us on Instagram at{" "}
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
