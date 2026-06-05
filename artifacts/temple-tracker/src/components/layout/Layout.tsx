import { ReactNode, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useLocation } from "wouter";
import { Menu, X, Instagram } from "lucide-react";

// Lucide doesn't ship a Threads glyph, so inline the official Meta path.
// Sized via className so it inherits text color and follows our hover states.
function ThreadsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.74-1.757-.504-.582-1.279-.878-2.303-.882h-.031c-.823 0-1.939.226-2.652 1.286l-1.741-1.169c.95-1.413 2.487-2.198 4.392-2.198h.046c3.187.02 5.087 1.967 5.275 5.367.108.046.213.094.317.142 1.476.692 2.555 1.741 3.122 3.034.79 1.804.863 4.748-1.527 7.082-1.821 1.776-4.034 2.581-7.184 2.604Zm1.063-11.466a8.27 8.27 0 0 0-1.385.106c-1.857.156-3.014.91-2.953 2.024.064 1.166 1.345 1.706 2.578 1.641 1.135-.063 2.612-.501 2.86-3.583a10.6 10.6 0 0 0-1.1-.188Z" />
    </svg>
  );
}
import { cn } from "@/lib/utils";
import { slideDown } from "@/lib/animations";

const SCROLL_KEY = (path: string) => `scroll_${path}`;

/**
 * Save the current scroll position for the active route and restore it when
 * the user navigates back to that route. Survives in-session navigation
 * (e.g. Bhagwatham → Gallery → Bhagwatham returns to where you were).
 */
function useScrollRestoration() {
  const [location] = useLocation();
  const prevLocation = useRef<string>(location);

  // Continuously save scroll position for the current route (throttled).
  useEffect(() => {
    let raf: number | null = null;
    const save = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        try { sessionStorage.setItem(SCROLL_KEY(location), String(window.scrollY)); } catch { /* */ }
      });
    };
    window.addEventListener("scroll", save, { passive: true });
    return () => {
      window.removeEventListener("scroll", save);
      if (raf) cancelAnimationFrame(raf);
      // One final save on unmount/route change so we don't miss the last scroll.
      try { sessionStorage.setItem(SCROLL_KEY(location), String(window.scrollY)); } catch { /* */ }
    };
  }, [location]);

  // Restore on route change. Double rAF to wait for the new page to render.
  useEffect(() => {
    if (prevLocation.current === location) return;
    prevLocation.current = location;
    let saved: number | null = null;
    try {
      const raw = sessionStorage.getItem(SCROLL_KEY(location));
      saved = raw !== null ? parseInt(raw, 10) : null;
    } catch { /* */ }
    const target = saved ?? 0;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({ top: target });
      });
    });
  }, [location]);
}

const NAV_ITEMS: { href: string; label: string; isPage?: boolean }[] = [
  { href: "/", label: "Home", isPage: true },
  { href: "/bhagwatham", label: "Bhagwatham", isPage: true },
  { href: "/japa", label: "Japa Counter", isPage: true },
  { href: "/gallery", label: "Gallery", isPage: true },
  { href: "/bhaktigram", label: "Bhaktigram", isPage: true },
];

function scrollTo(hash: string) {
  const el = document.querySelector(hash);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

export function Layout({ children }: { children: ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [location] = useLocation();
  // /bhaktigram is a pure social feed and should look exactly like Instagram —
  // suppress the top nav (logo + menu + Donate CTA) and the mobile donate
  // CTA bar so only the in-page Back button + the post timeline are visible.
  const isBhaktigram = location === "/bhaktigram" || location === "/bhaktigram/profile";
  const hideMobileCta = isBhaktigram;
  const hideTopNav = isBhaktigram;
  const hideFooter = isBhaktigram;
  useScrollRestoration();

  return (
    <div className="flex min-h-screen bg-surface flex-col relative text-on-surface">
      {/* Skip to content — accessibility (SEN-140) */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:bg-primary focus:text-on-primary focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-bold">
        Skip to content
      </a>
      {/* TopNavBar — hidden on /bhaktigram so the feed reads as a pure
          Instagram-style timeline with no surrounding chrome. */}
      {!hideTopNav && (
      <nav className="fixed top-0 z-50 w-full bg-surface/90 backdrop-blur-md shadow-[0_4px_24px_rgba(27,28,28,0.06)] border-b border-outline-variant/10">
        <div className="flex justify-between items-center w-full px-4 sm:px-8 py-4 max-w-screen-2xl mx-auto">

          <div className="flex items-center gap-6 md:gap-12">
            {/* Mobile menu toggle */}
            <button
              className="md:hidden p-2 text-on-surface-variant hover:text-primary rounded-lg transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            {/* Brand Logo */}
            <Link href="/">
              <div className="font-serif text-lg sm:text-2xl font-black text-primary uppercase tracking-wider cursor-pointer">
                Build Iskcon
              </div>
            </Link>

            {/* Desktop Navigation Links */}
            <div className="hidden md:flex items-center gap-8">
              {NAV_ITEMS.map((item) =>
                item.isPage ? (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="font-medium text-sm tracking-tight cursor-pointer transition-colors duration-300 px-2 py-1 rounded text-on-surface-variant hover:text-primary hover:bg-primary/5"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={(e) => { e.preventDefault(); scrollTo(item.href); }}
                    className="font-medium text-sm tracking-tight cursor-pointer transition-colors duration-300 px-2 py-1 rounded text-on-surface-variant hover:text-primary hover:bg-primary/5"
                  >
                    {item.label}
                  </a>
                ),
              )}
            </div>
          </div>

          {/* Trailing Controls */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Social icons — Instagram + Threads (@dailybhagwatham).
                Icon-only to keep the header compact; full handles live in the footer. */}
            <a
              href="https://www.instagram.com/dailybhagwatham/"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"
              aria-label="Follow @dailybhagwatham on Instagram"
              title="Follow @dailybhagwatham on Instagram"
            >
              <Instagram className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            </a>
            <a
              href="https://www.threads.com/@dailybhagwatham"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"
              aria-label="Follow @dailybhagwatham on Threads"
              title="Follow @dailybhagwatham on Threads"
            >
              <ThreadsIcon className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            </a>
            <a
              href="https://tovp.org/donate/"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center bg-primary text-on-primary px-4 py-2 rounded-lg font-bold text-xs tracking-wide hover:bg-primary/90 transition-all active:scale-95 ml-1"
            >
              Donate
            </a>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              className="md:hidden border-t border-outline-variant/10 bg-surface/95 backdrop-blur-md"
              variants={slideDown}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <div className="flex flex-col px-6 py-4 gap-1">
                {NAV_ITEMS.map((item, i) => (
                  <motion.div
                    key={item.href}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.2 }}
                  >
                    {item.isPage ? (
                      <Link
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className="block py-3 px-4 rounded-lg font-medium text-sm cursor-pointer transition-colors text-on-surface-variant hover:text-primary hover:bg-primary/5"
                      >
                        {item.label}
                      </Link>
                    ) : (
                      <a
                        href={item.href}
                        onClick={(e) => { e.preventDefault(); scrollTo(item.href); setMobileMenuOpen(false); }}
                        className="block py-3 px-4 rounded-lg font-medium text-sm cursor-pointer transition-colors text-on-surface-variant hover:text-primary hover:bg-primary/5"
                      >
                        {item.label}
                      </a>
                    )}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
      )}

      {/* Main Content — pt-24 reserves room for the fixed top nav, pb-28 for
          the mobile donate CTA. When either is hidden (e.g. /bhaktigram),
          drop the corresponding reservation so there's no phantom gap. */}
      <main id="main-content" className={`flex-1 w-full z-10 ${hideTopNav ? "pt-4" : "pt-24"} ${hideMobileCta ? "pb-8" : "pb-28 sm:pb-16"}`}>
        {children}
      </main>

      {/* Mobile sticky donate bar — hidden on /bhaktigram so the feed reads
          as a pure social timeline with no commerce overlay. */}
      {!hideMobileCta && (
        <div className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface/95 backdrop-blur-md border-t border-outline-variant/10 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] px-4 py-3 grid grid-cols-2 gap-3">
          <a href="#projects" onClick={(e) => { e.preventDefault(); scrollTo("#projects"); }} className="bg-primary text-on-primary py-3 rounded-xl font-bold text-sm tracking-wide text-center hover:bg-primary/90 transition-all active:scale-95 block">
            Choose a Project
          </a>
          <a
            href="https://tovp.org/donate/"
            target="_blank"
            rel="noopener noreferrer"
            className="border-2 border-primary/40 text-primary py-3 rounded-xl font-bold text-sm tracking-wide text-center hover:bg-primary/5 transition-all active:scale-95"
          >
            Donate
          </a>
        </div>
      )}

      {/* Footer — hidden on /bhaktigram so the feed reads end-to-end as a
          standalone Instagram-style app (no brand footer, no donate columns). */}
      {!hideFooter && (
      <footer className="bg-on-surface text-[#fbf9f8] w-full mt-auto">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-10 px-6 sm:px-12 py-12 sm:py-16 w-full max-w-screen-2xl mx-auto">
          <div className="col-span-2 md:col-span-1">
            <div className="font-serif text-lg font-black text-primary uppercase tracking-wider mb-3">Build Iskcon</div>
            <p className="text-white/60 font-sans text-xs font-medium leading-relaxed">
              Tracking ISKCON's global temple construction mission — town by town, continent by continent.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <span className="font-sans text-[10px] uppercase tracking-[0.15em] font-bold text-primary mb-1">Explore</span>
            <a href="/" className="text-white/70 hover:text-primary text-xs font-medium transition-colors cursor-pointer">Home</a>
            <a href="/bhagwatham" className="text-white/70 hover:text-primary text-xs font-medium transition-colors cursor-pointer">Bhagwatham</a>
            <a href="/japa" className="text-white/70 hover:text-primary text-xs font-medium transition-colors cursor-pointer">Japa Counter</a>
            <a href="/gallery" className="text-white/70 hover:text-primary text-xs font-medium transition-colors cursor-pointer">Gallery</a>
            <a href="/bhaktigram" className="text-white/70 hover:text-primary text-xs font-medium transition-colors cursor-pointer">Bhaktigram</a>
          </div>
          <div className="flex flex-col gap-3">
            <span className="font-sans text-[10px] uppercase tracking-[0.15em] font-bold text-primary mb-1">Give</span>
            <a href="https://tovp.org/donate/" target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-primary text-xs font-medium transition-colors">Donate to ISKCON</a>
            <a href="https://tovp.org/donate/" target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-primary text-xs font-medium transition-colors">Donate to TOVP</a>
          </div>
          <div className="flex flex-col gap-3">
            <span className="font-sans text-[10px] uppercase tracking-[0.15em] font-bold text-primary mb-1">Connect</span>
            <a href="https://www.iskcon.org" target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-primary text-xs font-medium transition-colors">ISKCON.org</a>
            <a href="https://www.bbt.org" target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-primary text-xs font-medium transition-colors">BBT</a>
            <a href="https://www.iskcon.org/contact" target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-primary text-xs font-medium transition-colors">Contact</a>
          </div>
          <div className="flex flex-col gap-3">
            <span className="font-sans text-[10px] uppercase tracking-[0.15em] font-bold text-primary mb-1">Follow</span>
            <a
              href="https://www.instagram.com/dailybhagwatham/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-white/70 hover:text-primary text-xs font-medium transition-colors"
              aria-label="Follow Daily Bhagwatham on Instagram"
            >
              <Instagram className="w-4 h-4" />
              <span>@dailybhagwatham</span>
            </a>
            <a
              href="https://www.threads.com/@dailybhagwatham"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-white/70 hover:text-primary text-xs font-medium transition-colors"
              aria-label="Follow Daily Bhagwatham on Threads"
            >
              <ThreadsIcon className="w-4 h-4" />
              <span>@dailybhagwatham</span>
            </a>
          </div>
          <div className="flex flex-col gap-3">
            <span className="font-sans text-[10px] uppercase tracking-[0.15em] font-bold text-primary mb-1">Legal</span>
            <a href="/privacy" className="text-white/40 hover:text-primary text-xs font-medium transition-colors">Privacy Policy</a>
            <a href="/terms" className="text-white/40 hover:text-primary text-xs font-medium transition-colors">Terms of Use</a>
          </div>
        </div>
        <div className="border-t border-white/10 px-6 sm:px-12 py-5 max-w-screen-2xl mx-auto">
          <p className="text-white/40 font-sans text-[10px] tracking-wide font-medium">
            © {new Date().getFullYear()} Build Iskcon — Global Temple Construction Intelligence. An independent initiative tracking ISKCON's global construction mission. Data sourced from official ISKCON project communications. All donation links direct to official ISKCON temple websites.
          </p>
        </div>
      </footer>
      )}
    </div>
  );
}
