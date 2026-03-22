import { Link, useLocation } from "wouter";
import { LayoutDashboard, Building2, PlusCircle, Bell, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/temples", label: "Projects", icon: Building2 },
  { href: "/temples/new", label: "Add Temple", icon: PlusCircle },
];

export function Sidebar() {
  const [location] = useLocation();

  return (
    <div className="w-64 flex-shrink-0 glass-panel border-r border-border/50 hidden md:flex flex-col h-screen sticky top-0 z-40">
      <div className="p-8 pb-4">
        <Link href="/" className="flex items-center gap-3 group cursor-pointer">
          <div className="w-10 h-10 rounded-full bg-saffron-gradient p-[2px] shadow-md shadow-primary/20 group-hover:shadow-lg transition-all">
            <div className="w-full h-full rounded-full bg-card flex items-center justify-center">
              <span className="font-serif font-bold text-primary text-xl">T</span>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-serif font-bold text-lg leading-tight text-foreground">Dharma</span>
            <span className="text-[10px] tracking-widest uppercase text-muted-foreground font-semibold">Intelligence</span>
          </div>
        </Link>
      </div>

      <div className="flex-1 py-8 px-4 flex flex-col gap-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest px-4 mb-2">Navigation</div>
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} className="w-full">
              <div
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-300 group cursor-pointer",
                  isActive 
                    ? "bg-primary/10 text-primary shadow-sm" 
                    : "text-muted-foreground hover:bg-black/5 hover:text-foreground"
                )}
              >
                <item.icon className={cn("w-5 h-5 transition-transform duration-300", isActive ? "scale-110" : "group-hover:scale-110")} />
                {item.label}
              </div>
            </Link>
          );
        })}
      </div>
      
      <div className="p-6 mt-auto">
        <div className="bg-gradient-to-br from-primary/10 to-transparent p-5 rounded-2xl border border-primary/10">
          <p className="text-sm font-serif font-medium text-foreground">Global Presence</p>
          <p className="text-xs text-muted-foreground mt-1 mb-3">Tracking 108+ sacred projects worldwide.</p>
          <button className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors uppercase tracking-widest">
            View Map →
          </button>
        </div>
      </div>
    </div>
  );
}
