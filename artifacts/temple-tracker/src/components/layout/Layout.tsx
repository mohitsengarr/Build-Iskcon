import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Bell, Search } from "lucide-react";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background relative overflow-hidden">
      {/* Abstract Background Orbs */}
      <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-5%] w-[40%] h-[40%] rounded-full bg-secondary/5 blur-[100px] pointer-events-none" />

      <Sidebar />
      <main className="flex-1 flex flex-col w-full z-10">
        <header className="h-20 glass-panel border-b border-border/30 px-8 flex items-center justify-between sticky top-0 z-30">
          <div className="relative w-96 hidden sm:block">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search projects, deities, or locations..." 
              className="w-full bg-black/5 hover:bg-black/10 transition-colors border-0 rounded-full py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/70"
            />
          </div>
          
          <div className="flex items-center gap-6 ml-auto">
            <button className="relative p-2 rounded-full hover:bg-black/5 transition-colors">
              <Bell className="w-5 h-5 text-muted-foreground" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive border-2 border-card"></span>
            </button>
            <div className="h-8 w-px bg-border/60"></div>
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-foreground leading-none">A. Sharma</p>
                <p className="text-xs text-muted-foreground mt-0.5">Global Coordinator</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-primary/20 p-0.5">
                <img src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop" alt="Profile" className="w-full h-full rounded-full object-cover" />
              </div>
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto w-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
