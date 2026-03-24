import { ReactNode, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useLocation } from "wouter";
import { Search, Bell, User, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SyncIndicator } from "@/components/SyncIndicator";
import { slideDown } from "@/lib/animations";

const NAV_ITEMS = [
  { href: "/", label: "Home", match: (loc: string) => loc === "/" },
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

          {/* Trailing Icons */}
          <div className="flex items-center gap-1 sm:gap-3">
            <SyncIndicator />
            <button className="hidden sm:block p-2 text-on-surface-variant hover:text-primary hover:bg-primary/5 rounded-full transition-all active:scale-95 duration-200">
              <Search className="w-5 h-5" />
            </button>
            <button className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary/5 rounded-full transition-all active:scale-95 duration-200 relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-error"></span>
            </button>
            <button className="hidden sm:block p-2 text-on-surface-variant hover:text-primary hover:bg-primary/5 rounded-full transition-all active:scale-95 duration-200">
              <User className="w-5 h-5" />
            </button>
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
      <main className="flex-1 w-full z-10 pt-24 pb-16">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-surface w-full border-t border-on-surface-variant/10 mt-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 px-6 sm:px-12 py-10 sm:py-16 w-full max-w-screen-2xl mx-auto">
          <div className="col-span-1 md:col-span-1">
            <div className="font-serif italic text-lg text-on-surface-variant mb-4">Build Iskcon</div>
            <p className="text-on-surface-variant/80 font-sans text-xs uppercase tracking-widest font-semibold leading-relaxed">
              Dedicated to the architectural legacy of the Vedic tradition.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <span className="font-sans text-xs uppercase tracking-widest font-bold text-secondary mb-2">Institutions</span>
            <a href="#" className="text-on-surface-variant hover:text-primary text-xs font-semibold uppercase tracking-widest transition-opacity">ISKCON.org</a>
            <a href="#" className="text-on-surface-variant hover:text-primary text-xs font-semibold uppercase tracking-widest transition-opacity">BBT</a>
          </div>
          <div className="flex flex-col gap-3">
            <span className="font-sans text-xs uppercase tracking-widest font-bold text-secondary mb-2">Support</span>
            <a href="#" className="text-on-surface-variant hover:text-primary text-xs font-semibold uppercase tracking-widest transition-opacity">Global Contact</a>
            <a href="#" className="text-on-surface-variant hover:text-primary text-xs font-semibold uppercase tracking-widest transition-opacity">Help Desk</a>
          </div>
          <div className="flex flex-col justify-end">
            <p className="text-on-surface-variant/80 font-sans text-[10px] uppercase tracking-[0.2em] font-semibold">
              © 2026 Build Iskcon.<br/>All Rights Reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
