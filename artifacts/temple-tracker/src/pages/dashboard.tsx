import { Layout } from "@/components/layout/Layout";
import { useGetDashboardStats } from "@workspace/api-client-react";
import { Building2, IndianRupee, ChartBar, CheckCircle2, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { BarChart, Bar, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis } from "recharts";

export default function Dashboard() {
  const { data: stats, isLoading } = useGetDashboardStats();

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!stats) return null;

  // Mock bar chart data for "Regional Distribution" based on reference design
  const barData = [
    { name: 'Q1 2024', india: 120, international: 80 },
    { name: 'Q2 2024', india: 150, international: 90 },
    { name: 'Q3 2024', india: 190, international: 130 },
    { name: 'Q4 (EST)', india: 220, international: 160 },
  ];

  const recentProject = stats.recentUpdates?.[0];

  return (
    <Layout>
      <div className="px-4 md:px-8 max-w-screen-2xl mx-auto space-y-16">
        
        {/* Hero Section */}
        <section className="relative rounded-xl overflow-hidden bg-surface-container-low h-[450px] flex items-center shadow-sm">
          <div className="absolute inset-0 z-0 opacity-40">
            <img 
              src={`${import.meta.env.BASE_URL}images/dashboard-hero.png`}
              alt="Global Network Map" 
              className="w-full h-full object-cover grayscale brightness-110 contrast-75"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/60 to-transparent z-10" />
          
          <div className="relative z-20 px-12 max-w-2xl">
            <h1 className="font-serif text-5xl font-bold text-on-surface mb-4 leading-tight">
              Universal Vision, <br/>
              <span className="text-primary">Sacred Execution</span>
            </h1>
            <p className="text-on-surface-variant font-sans text-lg mb-8 leading-relaxed">
              Monitoring the expansion of ISKCON's global footprint. Real-time data synthesis across 6 continents.
            </p>
            <div className="flex gap-4">
              <Link href="/temples">
                <button className="bg-primary text-on-primary px-8 py-3 rounded-xl font-bold text-sm tracking-wide shadow-lg hover:shadow-primary/20 transition-all active:scale-95 cursor-pointer">
                  Explore All Projects
                </button>
              </Link>
              <Link href="/regional">
                <button className="bg-secondary-container text-on-secondary-container px-8 py-3 rounded-xl font-bold text-sm tracking-wide transition-all active:scale-95 hover:bg-secondary-container/80 cursor-pointer">
                  Regional Briefs
                </button>
              </Link>
            </div>
          </div>
        </section>

        {/* Key Metric Cards */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-surface-container p-6 rounded-xl transition-all hover:bg-surface-container-high group">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Building2 className="w-5 h-5" />
              </div>
              <span className="text-xs font-semibold text-primary uppercase tracking-widest">+4 this quarter</span>
            </div>
            <h3 className="text-on-surface-variant text-sm font-medium uppercase tracking-tighter mb-1">Total Active Projects</h3>
            <div className="text-3xl font-black text-on-surface font-serif">{stats.activeProjects || stats.totalTemples}</div>
          </div>

          <div className="bg-surface-container p-6 rounded-xl transition-all hover:bg-surface-container-high">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center text-secondary">
                <IndianRupee className="w-5 h-5" />
              </div>
              <span className="text-xs font-semibold text-secondary uppercase tracking-widest">Global Portfolio</span>
            </div>
            <h3 className="text-on-surface-variant text-sm font-medium uppercase tracking-tighter mb-1">Total Global Investment</h3>
            <div className="text-3xl font-black text-on-surface font-serif">
              ₹{(stats.totalFundraisingRaised / 10000000).toFixed(1)}Cr
            </div>
          </div>

          <div className="bg-surface-container p-6 rounded-xl transition-all hover:bg-surface-container-high">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-lg bg-tertiary/10 flex items-center justify-center text-tertiary">
                <ChartBar className="w-5 h-5" />
              </div>
              <div className="w-24 h-2 bg-surface-variant rounded-full overflow-hidden">
                <div className="w-[65%] h-full bg-primary"></div>
              </div>
            </div>
            <h3 className="text-on-surface-variant text-sm font-medium uppercase tracking-tighter mb-1">Average Completion</h3>
            <div className="text-3xl font-black text-on-surface font-serif">65%</div>
          </div>

          <div className="bg-surface-container p-6 rounded-xl transition-all hover:bg-surface-container-high border-2 border-primary-container/20">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-lg bg-primary-container/10 flex items-center justify-center text-primary">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <span className="animate-pulse flex items-center gap-1 text-[10px] font-bold text-primary uppercase bg-primary-container/20 px-2 py-0.5 rounded-full">
                Final Phase
              </span>
            </div>
            <h3 className="text-on-surface-variant text-sm font-medium uppercase tracking-tighter mb-1">Near Completion</h3>
            <div className="text-3xl font-black text-on-surface font-serif">
              {stats.templesByStatus.finishing || 0}
            </div>
          </div>
        </section>

        {/* Bottom Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Regional Distribution Chart */}
          <div className="lg:col-span-2 bg-surface-container-low rounded-xl p-8">
            <div className="flex justify-between items-center mb-10">
              <div>
                <h2 className="font-serif text-2xl font-bold text-on-surface">Regional Distribution</h2>
                <p className="text-sm text-on-surface-variant">Domestic vs. International project velocity</p>
              </div>
              <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-widest">
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-primary"></span> India</div>
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-tertiary"></span> International</div>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barGap={2}>
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#554336', fontSize: 12, fontWeight: 600 }} 
                    dy={10}
                  />
                  <RechartsTooltip cursor={{fill: 'rgba(0,0,0,0.05)'}} contentStyle={{ borderRadius: '8px', border: 'none' }} />
                  <Bar dataKey="india" fill="var(--color-primary)" radius={[8, 8, 0, 0]} barSize={32} />
                  <Bar dataKey="international" fill="var(--color-tertiary)" radius={[8, 8, 0, 0]} barSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Spotlight Card */}
          <div className="bg-on-surface-variant text-surface-container-lowest rounded-xl p-8 relative overflow-hidden flex flex-col justify-between">
            <div className="absolute -top-10 -right-10 w-48 h-48 bg-primary/20 rounded-full blur-3xl" />
            <div>
              <span className="inline-block px-3 py-1 rounded-full bg-primary text-on-primary text-[10px] font-bold uppercase tracking-widest mb-6">
                Spotlight Project
              </span>
              <h2 className="font-serif text-3xl font-bold mb-4 leading-tight">
                {recentProject?.title || "Temple of the Vedic Planetarium"}
              </h2>
              <p className="text-sm opacity-80 mb-8 leading-relaxed line-clamp-3">
                {recentProject?.content || "The flagship structural wonder in Mayapur, West Bengal. Merging cosmology and modern engineering on a massive scale."}
              </p>
            </div>
            
            <div className="space-y-6">
              <div className="flex justify-between items-end border-b border-surface/10 pb-4">
                <span className="text-xs font-medium uppercase tracking-widest opacity-60">Status</span>
                <span className="text-lg font-bold text-primary-container">Finishing Phase</span>
              </div>
              <div className="flex justify-between items-end border-b border-surface/10 pb-4">
                <span className="text-xs font-medium uppercase tracking-widest opacity-60">Recent Update</span>
                <span className="text-sm font-bold italic">{recentProject ? new Date(recentProject.createdAt).toLocaleDateString() : "2024"}</span>
              </div>
            </div>

            <Link href={recentProject ? `/temples/${recentProject.templeId}` : `/temples/1`}>
              <button className="mt-8 flex items-center justify-center gap-2 w-full py-4 border border-surface/20 rounded-xl hover:bg-surface/10 transition-colors cursor-pointer">
                <span className="text-sm font-bold tracking-wide">View Project</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
          </div>

        </div>
      </div>
    </Layout>
  );
}
