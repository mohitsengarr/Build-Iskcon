import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Search, Bell, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { SyncIndicator } from "@/components/SyncIndicator";

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex min-h-screen bg-surface flex-col relative overflow-hidden text-on-surface">
      {/* TopNavBar */}
      <nav className="fixed top-0 z-50 w-full bg-surface/90 backdrop-blur-md shadow-[0_4px_24px_rgba(27,28,28,0.06)] border-b border-outline-variant/10">
        <div className="flex justify-between items-center w-full px-8 py-4 max-w-screen-2xl mx-auto">
          
          <div className="flex items-center gap-12">
            {/* Brand Logo */}
            <Link href="/">
              <div className="font-serif text-2xl font-black text-primary uppercase tracking-wider cursor-pointer">
                ISKCON Intelligence
              </div>
            </Link>

            {/* Navigation Links */}
            <div className="hidden md:flex items-center gap-8">
              <Link href="/">
                <span className={cn(
                  "font-medium text-sm tracking-tight cursor-pointer transition-colors duration-300 px-2 py-1 rounded",
                  location === "/" 
                    ? "text-primary font-bold border-b-2 border-primary pb-1 rounded-none px-0" 
                    : "text-on-surface-variant hover:text-primary hover:bg-primary/5"
                )}>
                  Global Dashboard
                </span>
              </Link>
              <Link href="/temples">
                <span className={cn(
                  "font-medium text-sm tracking-tight cursor-pointer transition-colors duration-300 px-2 py-1 rounded",
                  location.startsWith("/temples") 
                    ? "text-primary font-bold border-b-2 border-primary pb-1 rounded-none px-0" 
                    : "text-on-surface-variant hover:text-primary hover:bg-primary/5"
                )}>
                  Project Directory
                </span>
              </Link>
              <Link href="/regional">
                <span className={cn(
                  "font-medium text-sm tracking-tight cursor-pointer transition-colors duration-300 px-2 py-1 rounded",
                  location === "/regional" 
                    ? "text-primary font-bold border-b-2 border-primary pb-1 rounded-none px-0" 
                    : "text-on-surface-variant hover:text-primary hover:bg-primary/5"
                )}>
                  Regional Insights
                </span>
              </Link>
              <Link href="/social">
                <span className={cn(
                  "font-medium text-sm tracking-tight cursor-pointer transition-colors duration-300 px-2 py-1 rounded",
                  location === "/social" 
                    ? "text-primary font-bold border-b-2 border-primary pb-1 rounded-none px-0" 
                    : "text-on-surface-variant hover:text-primary hover:bg-primary/5"
                )}>
                  Social Hub
                </span>
              </Link>
            </div>
          </div>

          {/* Trailing Icons */}
          <div className="flex items-center gap-3">
            <SyncIndicator />
            <button className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary/5 rounded-full transition-all active:scale-95 duration-200">
              <Search className="w-5 h-5" />
            </button>
            <button className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary/5 rounded-full transition-all active:scale-95 duration-200 relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-error"></span>
            </button>
            <button className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary/5 rounded-full transition-all active:scale-95 duration-200">
              <User className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 w-full z-10 pt-24 pb-16">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-surface w-full border-t border-on-surface-variant/10 mt-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 px-12 py-16 w-full max-w-screen-2xl mx-auto">
          <div className="col-span-1 md:col-span-1">
            <div className="font-serif italic text-lg text-on-surface-variant mb-4">ISKCON Global Projects</div>
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
              © 2024 ISKCON Global Projects Office.<br/>All Rights Reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
