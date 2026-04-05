import { ReactNode, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Heart, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { slideDown } from "@/lib/animations";

const NAV_ITEMS: { href: string; label: string; isPage?: boolean }[] = [
  { href: "#hero", label: "Home" },
  { href: "#projects", label: "Projects" },
  { href: "#about", label: "About ISKCON" },
  { href: "#directory", label: "Directory" },
  { href: "#vision", label: "Vision 2051" },
  { href: "/how-to-build-temple", label: "How to Build", isPage: true },
  { href: "/krishna-janmabhoomi", label: "Janmabhoomi", isPage: true },
  { href: "#faq", label: "FAQ" },
];

function scrollTo(hash: string) {
  const el = document.querySelector(hash);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

export function Layout({ children }: { children: ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="flex min-h-screen bg-surface flex-col relative overflow-hidden text-on-surface">
      {/* TopNavBar */}
      <nav className="fixed top-0 z-50 w-full bg-surface/90 backdrop-blur-md shadow-[0_4px_24px_rgba(27,28,28,0.06)] border-b border-outline-variant/10">
        <div className="flex justify-between items-center w-full px-4 sm:px-8 py-4 max-w-screen-2xl mx-auto">

          <div className="flex items-center gap-6 lg:gap-12">
            {/* Mobile menu toggle */}
            <button
              className="lg:hidden p-2 text-on-surface-variant hover:text-primary rounded-lg transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            {/* Brand Logo */}
            <a href="#hero" onClick={(e) => { e.preventDefault(); scrollTo("#hero"); }}>
              <div className="font-serif text-lg sm:text-2xl font-black text-primary uppercase tracking-wider cursor-pointer">
                Build Iskcon
              </div>
            </a>

            {/* Desktop Navigation Links */}
            <div className="hidden lg:flex items-center gap-8">
              {NAV_ITEMS.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={item.isPage ? undefined : (e) => { e.preventDefault(); scrollTo(item.href); }}
                  className="font-medium text-sm tracking-tight cursor-pointer transition-colors duration-300 px-2 py-1 rounded text-on-surface-variant hover:text-primary hover:bg-primary/5"
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>

          {/* Trailing Controls */}
          <div className="flex items-center gap-1 sm:gap-3">
            {/* Mobile donate icon */}
            <a
              href="https://www.iskcon.org/donate"
              target="_blank"
              rel="noopener noreferrer"
              className="lg:hidden inline-flex items-center justify-center bg-primary text-on-primary w-10 h-10 rounded-lg hover:bg-primary/90 transition-all active:scale-95"
              aria-label="Donate"
            >
              <Heart className="w-[18px] h-[18px]" />
            </a>
            {/* Desktop donate button */}
            <a
              href="https://www.iskcon.org/donate"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden lg:inline-flex items-center bg-primary text-on-primary px-4 py-2 rounded-lg font-bold text-xs tracking-wide hover:bg-primary/90 transition-all active:scale-95"
            >
              Donate
            </a>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              className="lg:hidden border-t border-outline-variant/10 bg-surface/95 backdrop-blur-md"
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
                    <a
                      href={item.href}
                      onClick={item.isPage ? () => setMobileMenuOpen(false) : (e) => { e.preventDefault(); scrollTo(item.href); setMobileMenuOpen(false); }}
                      className="block py-3 px-4 rounded-lg font-medium text-sm cursor-pointer transition-colors text-on-surface-variant hover:text-primary hover:bg-primary/5"
                    >
                      {item.label}
                    </a>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Main Content */}
      <main className="flex-1 w-full z-10 pt-24 pb-28 sm:pb-16">
        {children}
      </main>

      {/* Mobile sticky donate bar */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface/95 backdrop-blur-md border-t border-outline-variant/10 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] px-4 py-3 grid grid-cols-2 gap-3">
        <a href="#projects" onClick={(e) => { e.preventDefault(); scrollTo("#projects"); }} className="bg-primary text-on-primary py-3 rounded-xl font-bold text-sm tracking-wide text-center hover:bg-primary/90 transition-all active:scale-95 block">
          Choose a Project
        </a>
        <a
          href="https://www.iskcon.org/donate"
          target="_blank"
          rel="noopener noreferrer"
          className="border-2 border-[#5C4033] text-[#5C4033] py-3 rounded-xl font-bold text-sm tracking-wide text-center hover:bg-[#5C4033]/5 transition-all active:scale-95"
        >
          Donate
        </a>
      </div>

      {/* Back to top button */}
      <AnimatePresence>
        {showBackToTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="fixed bottom-20 sm:bottom-8 right-4 z-40 w-11 h-11 rounded-full bg-primary text-on-primary shadow-lg hover:bg-primary/90 transition-all active:scale-95 flex items-center justify-center"
            aria-label="Back to top"
          >
            <ChevronUp className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="bg-on-surface text-[#fbf9f8] w-full mt-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-10 px-6 sm:px-12 py-12 sm:py-16 w-full max-w-screen-2xl mx-auto">
          <div className="col-span-1 sm:col-span-2 lg:col-span-1">
            <div className="font-serif text-lg font-black text-primary uppercase tracking-wider mb-3">Build Iskcon</div>
            <p className="text-white/60 font-sans text-sm font-medium leading-relaxed">
              Tracking ISKCON's global temple construction mission — town by town, continent by continent.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <span className="font-sans text-xs uppercase tracking-[0.15em] font-bold text-primary mb-1">Explore</span>
            <a href="#hero" onClick={(e) => { e.preventDefault(); scrollTo("#hero"); }} className="text-white/70 hover:text-primary text-sm font-medium transition-colors cursor-pointer py-1">Home</a>
            <a href="#projects" onClick={(e) => { e.preventDefault(); scrollTo("#projects"); }} className="text-white/70 hover:text-primary text-sm font-medium transition-colors cursor-pointer py-1">Projects</a>
            <a href="#about" onClick={(e) => { e.preventDefault(); scrollTo("#about"); }} className="text-white/70 hover:text-primary text-sm font-medium transition-colors cursor-pointer py-1">About ISKCON</a>
            <a href="#vision" onClick={(e) => { e.preventDefault(); scrollTo("#vision"); }} className="text-white/70 hover:text-primary text-sm font-medium transition-colors cursor-pointer py-1">Vision 2051</a>
            <a href="/how-to-build-temple" className="text-white/70 hover:text-primary text-sm font-medium transition-colors cursor-pointer py-1">How to Build</a>
            <a href="/krishna-janmabhoomi" className="text-white/70 hover:text-primary text-sm font-medium transition-colors cursor-pointer py-1">Krishna Janmabhoomi</a>
          </div>
          <div className="flex flex-col gap-3">
            <span className="font-sans text-xs uppercase tracking-[0.15em] font-bold text-primary mb-1">Give</span>
            <a href="https://www.iskcon.org/donate" target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-primary text-sm font-medium transition-colors py-1">Donate to ISKCON</a>
            <a href="https://tovp.org/donate/" target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-primary text-sm font-medium transition-colors py-1">Donate to TOVP</a>
          </div>
          <div className="flex flex-col gap-3">
            <span className="font-sans text-xs uppercase tracking-[0.15em] font-bold text-primary mb-1">Connect</span>
            <a href="https://www.iskcon.org" target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-primary text-sm font-medium transition-colors py-1">ISKCON.org</a>
            <a href="https://www.bbt.org" target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-primary text-sm font-medium transition-colors py-1">BBT</a>
            <a href="https://www.iskcon.org/contact" target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-primary text-sm font-medium transition-colors py-1">Contact</a>
          </div>
          <div className="flex flex-col gap-3">
            <span className="font-sans text-xs uppercase tracking-[0.15em] font-bold text-primary mb-1">Legal</span>
            <a href="/privacy" className="text-white/50 hover:text-primary text-sm font-medium transition-colors py-1">Privacy Policy</a>
            <a href="/terms" className="text-white/50 hover:text-primary text-sm font-medium transition-colors py-1">Terms of Use</a>
          </div>
        </div>
        <div className="border-t border-white/10 px-6 sm:px-12 py-5 max-w-screen-2xl mx-auto">
          <p className="text-white/40 font-sans text-xs tracking-wide font-medium">
            © {new Date().getFullYear()} Build Iskcon — Global Temple Construction Intelligence. An independent initiative tracking ISKCON's global construction mission. Data sourced from official ISKCON project communications. All donation links direct to official ISKCON temple websites.
          </p>
        </div>
      </footer>
    </div>
  );
}
