import { Link } from "wouter";
import { Layout } from "@/components/layout/Layout";

// Catch-all 404 page (the final pathless <Route> in App.tsx renders this for
// any URL that no other route matched, e.g. stale links or typos).
export default function PageNotFound() {
  return (
    <Layout>
      <div className="max-w-xl mx-auto px-4 text-center py-24">
        <p className="font-serif text-6xl font-bold text-stone-200 mb-4">404</p>
        <h1 className="font-serif text-2xl font-bold text-stone-800 mb-3">Page not found</h1>
        <p className="text-stone-500 text-sm mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center bg-primary text-on-primary px-5 py-2.5 rounded-lg font-bold text-sm tracking-wide hover:bg-primary/90 transition-all active:scale-95"
          style={{ fontFamily: "var(--font-devanagari)" }}
        >
          वापस घर चलें
        </Link>
      </div>
    </Layout>
  );
}
