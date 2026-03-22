import { Layout } from "@/components/layout/Layout";
import { useListTemples } from "@workspace/api-client-react";
import { TempleCard } from "@/components/shared/TempleCard";
import { useState } from "react";
import { Search, Filter } from "lucide-react";
import { Link } from "wouter";

export default function TempleList() {
  const { data: temples, isLoading } = useListTemples();
  const [filter, setFilter] = useState<string>("all");

  const filteredTemples = temples?.filter(t => filter === "all" || t.status === filter) || [];

  return (
    <Layout>
      <div className="space-y-8 pb-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <h1 className="text-4xl font-serif font-bold text-foreground mb-2">Sacred Projects</h1>
            <p className="text-muted-foreground text-lg">Browse and monitor all temple construction initiatives.</p>
          </div>
          <Link href="/temples/new">
             <button className="bg-saffron-gradient text-white px-6 py-3 rounded-xl font-semibold shadow-lg shadow-primary/25 hover:shadow-xl transition-all">
              Add New Temple
            </button>
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 bg-card p-4 rounded-2xl shadow-sm">
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search by name, location, or deity..." 
              className="w-full bg-background border-none rounded-xl py-3 pl-12 pr-4 focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 hide-scrollbar">
            <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>All</FilterButton>
            <FilterButton active={filter === "planning"} onClick={() => setFilter("planning")}>Planning</FilterButton>
            <FilterButton active={filter === "construction"} onClick={() => setFilter("construction")}>Construction</FilterButton>
            <FilterButton active={filter === "finishing"} onClick={() => setFilter("finishing")}>Finishing</FilterButton>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-[400px] bg-card rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : filteredTemples.length === 0 ? (
          <div className="bg-card rounded-3xl p-12 text-center shadow-sm">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Filter className="w-10 h-10 text-primary" />
            </div>
            <h3 className="text-2xl font-serif font-bold text-foreground mb-2">No projects found</h3>
            <p className="text-muted-foreground">Try adjusting your filters or search terms.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredTemples.map((temple, idx) => (
              <TempleCard key={temple.id} temple={temple} index={idx} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

function FilterButton({ active, children, onClick }: { active: boolean, children: React.ReactNode, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`whitespace-nowrap px-4 py-2.5 rounded-xl font-medium transition-all ${
        active 
          ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" 
          : "bg-background text-foreground hover:bg-black/5"
      }`}
    >
      {children}
    </button>
  );
}
