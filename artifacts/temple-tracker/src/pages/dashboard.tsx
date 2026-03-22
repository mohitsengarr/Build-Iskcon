import { Layout } from "@/components/layout/Layout";
import { useGetDashboardStats } from "@workspace/api-client-react";
import { TempleCard } from "@/components/shared/TempleCard";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { motion } from "framer-motion";
import { Building2, IndianRupee, Hammer, Users, CalendarClock, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";

export default function Dashboard() {
  const { data: stats, isLoading } = useGetDashboardStats();

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
            <p className="mt-4 text-muted-foreground font-medium animate-pulse">Loading temple insights...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!stats) return null;

  const pieData = Object.entries(stats.templesByStatus).map(([name, value]) => ({ name, value }));
  const COLORS = ['#8f4e00', '#ff9933', '#4d2a00', '#b36b00', '#cc7a00'];

  return (
    <Layout>
      <div className="space-y-8 pb-12">
        {/* Hero Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative rounded-3xl overflow-hidden bg-card shadow-lg border-0 min-h-[280px] flex items-center"
        >
          <div className="absolute inset-0 z-0">
            <img 
              src={`${import.meta.env.BASE_URL}images/dashboard-hero.png`} 
              alt="Temple Architecture" 
              className="w-full h-full object-cover opacity-60 mix-blend-multiply"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent" />
          </div>
          
          <div className="relative z-10 p-8 md:p-12 max-w-2xl">
            <h1 className="text-4xl md:text-5xl font-serif font-bold text-foreground mb-4">
              Sacred Projects Overview
            </h1>
            <p className="text-lg text-muted-foreground mb-8">
              Monitoring the construction, fundraising, and spiritual milestones of our grand temple initiatives globally.
            </p>
            <div className="flex gap-4">
              <Link href="/temples/new">
                <button className="bg-saffron-gradient text-white px-6 py-3 rounded-xl font-semibold shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200">
                  New Project
                </button>
              </Link>
            </div>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard 
            title="Total Temples" 
            value={stats.totalTemples} 
            icon={Building2} 
            subtitle={`${stats.activeProjects} actively in construction`}
            delay={0.1}
          />
          <StatCard 
            title="Total Raised" 
            value={`₹${(stats.totalFundraisingRaised / 10000000).toFixed(1)}Cr`} 
            icon={IndianRupee} 
            subtitle={`Goal: ₹${(stats.totalFundraisingGoal / 10000000).toFixed(1)}Cr`}
            delay={0.2}
          >
             <ProgressBar value={stats.totalFundraisingRaised} max={stats.totalFundraisingGoal} showValue={false} className="mt-3" size="sm" />
          </StatCard>
          <StatCard 
            title="Milestones" 
            value={stats.completedMilestones} 
            icon={Hammer} 
            subtitle={`${stats.upcomingMilestones} upcoming targets`}
            delay={0.3}
          />
          <StatCard 
            title="Updates" 
            value={stats.recentUpdates.length} 
            icon={CalendarClock} 
            subtitle="Recent logs this month"
            delay={0.4}
          />
        </div>

        {/* Bottom Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recent Updates */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            className="lg:col-span-2 bg-card rounded-3xl p-8 shadow-md"
          >
            <div className="flex justify-between items-end mb-6">
              <div>
                <h2 className="text-2xl font-serif font-bold text-foreground">Recent Updates</h2>
                <p className="text-muted-foreground mt-1">Latest field reports from site coordinators.</p>
              </div>
              <Link href="/temples" className="text-primary font-semibold text-sm hover:underline flex items-center">
                All Projects <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </div>

            <div className="space-y-6">
              {stats.recentUpdates.slice(0, 4).map((update, i) => (
                <div key={update.id} className="flex gap-4 group">
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shadow-sm">
                      {update.author.charAt(0)}
                    </div>
                    {i !== 3 && <div className="w-px h-full bg-border/80 mt-2" />}
                  </div>
                  <div className="pb-6">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-primary uppercase tracking-wider bg-primary/10 px-2 py-0.5 rounded-md">
                        {update.category}
                      </span>
                      <span className="text-xs text-muted-foreground">{format(new Date(update.createdAt), 'MMM d, yyyy')}</span>
                    </div>
                    <h4 className="text-lg font-semibold text-foreground mb-1 group-hover:text-primary transition-colors cursor-pointer">
                      <Link href={`/temples/${update.templeId}`}>{update.title}</Link>
                    </h4>
                    <p className="text-muted-foreground text-sm line-clamp-2">{update.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Chart */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 }}
            className="bg-card rounded-3xl p-8 shadow-md flex flex-col"
          >
            <h2 className="text-2xl font-serif font-bold text-foreground mb-1">Project Status</h2>
            <p className="text-muted-foreground mb-6">Distribution of phases</p>
            
            <div className="flex-1 min-h-[250px] relative flex items-center justify-center">
               <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                    itemStyle={{ color: '#1b1c1c', fontWeight: 600 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                <span className="text-3xl font-serif font-bold text-foreground">{stats.totalTemples}</span>
                <span className="text-xs text-muted-foreground uppercase tracking-widest mt-1">Total</span>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {pieData.map((entry, index) => (
                <div key={entry.name} className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span className="capitalize font-medium text-foreground/80">{entry.name}</span>
                  </div>
                  <span className="font-bold">{entry.value}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </Layout>
  );
}

function StatCard({ title, value, icon: Icon, subtitle, delay, children }: any) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="bg-card p-6 rounded-3xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group"
    >
      <div className="absolute -right-6 -top-6 w-24 h-24 bg-primary/5 rounded-full group-hover:scale-150 transition-transform duration-500 ease-out" />
      <div className="flex justify-between items-start mb-4 relative z-10">
        <div className="p-3 bg-primary/10 rounded-2xl text-primary">
          <Icon className="w-6 h-6" />
        </div>
      </div>
      <div className="relative z-10">
        <h3 className="text-3xl font-serif font-bold text-foreground mb-1">{value}</h3>
        <p className="text-sm font-medium text-foreground/80">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-2">{subtitle}</p>}
        {children}
      </div>
    </motion.div>
  );
}
