import { ReactNode, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { slideDown } from "@/lib/animations";

const NAV_ITEMS = [
  { href: "/", label: "Home", match: (loc: string) => loc === "/" },
  { href: "/temples", label: "Projects", match: (loc: string) => loc.startsWith("/temples") },
  { href: "/vision2051", label: "Vision 2051", match: (loc: string) => loc === "/vision2051" },
];

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-surface flex-col relative overflow-hidden text-on-surface">
      {/* TopNavBar */}
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
              {NAV_ITEMS.map((item) => (
                <Link key={item.href} href={item.href}>
                  <span className={cn(
                    "font-medium text-sm tracking-tight cursor-pointer transition-colors duration-300 px-2 py-1 rounded",
                    item.match(location)
                      ? "text-primary font-bold border-b-2 border-primary pb-1 rounded-none px-0"
                      : "text-on-surface-variant hover:text-primary hover:bg-primary/5"
                  )}>
                    {item.label}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {/* Trailing Controls */}
          <div className="flex items-center gap-1 sm:gap-3">
            <a
              href="https://www.iskcon.org/donate"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center bg-primary text-on-primary px-4 py-2 rounded-lg font-bold text-xs tracking-wide hover:bg-primary/90 transition-all active:scale-95"
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
                    <Link href={item.href}>
                      <span
                        className={cn(
                          "block py-3 px-4 rounded-lg font-medium text-sm cursor-pointer transition-colors",
                          item.match(location)
                            ? "text-primary bg-primary/10 font-bold"
                            : "text-on-surface-variant hover:text-primary hover:bg-primary/5"
                        )}
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {item.label}
                      </span>
                    </Link>
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
        <Link href="/temples" className="bg-primary text-on-primary py-3 rounded-xl font-bold text-sm tracking-wide text-center hover:bg-primary/90 transition-all active:scale-95 block">
          Choose a Project
        </Link>
        <a
          href="https://www.iskcon.org/donate"
          target="_blank"
          rel="noopener noreferrer"
          className="border-2 border-primary/40 text-primary py-3 rounded-xl font-bold text-sm tracking-wide text-center hover:bg-primary/5 transition-all active:scale-95"
        >
          Donate
        </a>
      </div>

      {/* Footer */}
      <footer className="bg-on-surface text-[#fbf9f8] w-full mt-auto">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10 px-6 sm:px-12 py-12 sm:py-16 w-full max-w-screen-2xl mx-auto">
          <div className="col-span-2 md:col-span-1">
            <div className="font-serif text-lg font-black text-primary uppercase tracking-wider mb-3">Build Iskcon</div>
            <p className="text-white/60 font-sans text-xs font-medium leading-relaxed">
              Tracking ISKCON's global temple construction mission — town by town, continent by continent.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <span className="font-sans text-[10px] uppercase tracking-[0.15em] font-bold text-primary mb-1">Explore</span>
            <Link href="/" className="text-white/70 hover:text-primary text-xs font-medium transition-colors">Home</Link>
            <Link href="/temples" className="text-white/70 hover:text-primary text-xs font-medium transition-colors">Projects</Link>
            <Link href="/vision2051" className="text-white/70 hover:text-primary text-xs font-medium transition-colors">Vision 2051</Link>
          </div>
          <div className="flex flex-col gap-3">
            <span className="font-sans text-[10px] uppercase tracking-[0.15em] font-bold text-primary mb-1">Give</span>
            <a href="https://www.iskcon.org/donate" target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-primary text-xs font-medium transition-colors">Donate to ISKCON</a>
            <a href="https://tovp.org/donate/" target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-primary text-xs font-medium transition-colors">Donate to TOVP</a>
          </div>
          <div className="flex flex-col gap-3">
            <span className="font-sans text-[10px] uppercase tracking-[0.15em] font-bold text-primary mb-1">Connect</span>
            <a href="https://www.iskcon.org" target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-primary text-xs font-medium transition-colors">ISKCON.org</a>
            <a href="https://www.bbt.org" target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-primary text-xs font-medium transition-colors">BBT</a>
            <a href="https://www.iskcon.org/contact" target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-primary text-xs font-medium transition-colors">Contact</a>
          </div>
          <div className="flex flex-col gap-3">
            <span className="font-sans text-[10px] uppercase tracking-[0.15em] font-bold text-primary mb-1">Legal</span>
            <span className="text-white/40 text-xs font-medium">Privacy Policy</span>
            <span className="text-white/40 text-xs font-medium">Terms of Use</span>
          </div>
        </div>
        <div className="border-t border-white/10 px-6 sm:px-12 py-5 max-w-screen-2xl mx-auto">
          <p className="text-white/40 font-sans text-[10px] tracking-wide font-medium">
            © {new Date().getFullYear()} Build Iskcon. All rights reserved. Not an official ISKCON website — a community-driven transparency platform.
          </p>
        </div>
      </footer>
    </div>
  );
}
