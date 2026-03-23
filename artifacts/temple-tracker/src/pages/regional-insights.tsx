import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { BarChart, Bar, ResponsiveContainer, XAxis, Tooltip, YAxis } from "recharts";
import { Link } from "wouter";
import { ArrowRight, Building2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

export default function RegionalInsights() {
  
  // Static data matching the reference design
  const barDataHorizontal = [
    { region: 'Asia Pacific', value: 42 },
    { region: 'North America', value: 28 },
    { region: 'Europe', value: 19 },
    { region: 'Latin America', value: 12 }
  ];

  const barDataVertical = [
    { region: 'ASIA', value: 142 },
    { region: 'NA', value: 98 },
    { region: 'EUR', value: 64 },
    { region: 'AFR', value: 22 }
  ];

  const cityData = [
    { city: "Mayapur", region: "West Bengal, India", projects: 14, valuation: "$385.4M", status: "Hyper-Growth", statusColor: "text-primary bg-primary/10" },
    { city: "Vrindavan", region: "Uttar Pradesh, India", projects: 8, valuation: "$112.9M", status: "Structural", statusColor: "text-primary bg-primary/10" },
    { city: "London", region: "UK, Europe", projects: 4, valuation: "$45.2M", status: "Steady State", statusColor: "text-secondary bg-secondary/10" },
    { city: "Los Angeles", region: "California, USA", projects: 3, valuation: "$38.1M", status: "Renovation", statusColor: "text-secondary bg-secondary/10" },
  ];

  return (
    <Layout>
      <SEOHead
        title="Regional Insights — Global Temple Intelligence"
        description="Analyse ISKCON temple construction activity by region. Compare India vs international project velocity, continent-level funding gaps, and strategic expansion priorities."
        canonicalPath="/regional"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Regional Insights — Build Iskcon",
          description: "Regional breakdown of ISKCON temple construction progress and fundraising intelligence",
          url: typeof window !== "undefined" ? `${window.location.origin}/regional` : "",
        }}
      />
      <div className="px-6 md:px-12 max-w-screen-2xl mx-auto space-y-16 pb-20">
        
        {/* Header */}
        <section className="max-w-3xl">
          <h1 className="text-4xl md:text-5xl font-bold font-serif text-on-surface mb-4 leading-tight">
            Global Regional <span className="text-primary italic">Intelligence</span>
          </h1>
          <p className="text-on-surface-variant font-sans text-lg leading-relaxed max-w-2xl">
            Comparative analysis across continental zones. This data reflects active temple construction, land acquisitions, and institutional capital allocation for the current fiscal year.
          </p>
        </section>

        {/* Comparison Bento Grid */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Projects per Region */}
          <div className="bg-surface-container-low p-8 rounded-xl shadow-sm border border-outline-variant/10">
            <div className="flex justify-between items-end mb-10">
              <div>
                <h3 className="text-xl font-bold font-serif text-on-surface mb-1">Projects per Region</h3>
                <p className="text-xs uppercase tracking-widest text-on-surface-variant font-semibold">Active & Planned Sites</p>
              </div>
              <Building2 className="text-primary w-6 h-6" />
            </div>
            
            <div className="space-y-6">
              {barDataHorizontal.map((item, i) => (
                <div key={item.region} className="space-y-2">
                  <div className="flex justify-between text-sm font-medium">
                    <span>{item.region}</span>
                    <span className="text-primary">{item.value} Units</span>
                  </div>
                  <div className="w-full h-8 bg-surface-container rounded-lg overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-primary to-primary-container" 
                      style={{ width: `${(item.value / 42) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Investment by Region */}
          <div className="bg-surface-container-low p-8 rounded-xl shadow-sm border border-outline-variant/10 flex flex-col">
            <div className="flex justify-between items-end mb-10">
              <div>
                <h3 className="text-xl font-bold font-serif text-on-surface mb-1">Investment by Region</h3>
                <p className="text-xs uppercase tracking-widest text-on-surface-variant font-semibold">Allocated Capital ($M)</p>
              </div>
            </div>
            
            <div className="flex-1 h-64 min-h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barDataVertical} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
                  <XAxis 
                    dataKey="region" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#554336', fontSize: 10, fontWeight: 'bold' }} 
                    dy={10}
                  />
                  <Tooltip cursor={{fill: 'rgba(0,0,0,0.05)'}} contentStyle={{ borderRadius: '8px', border: 'none' }} formatter={(val) => [`$${val}M`, 'Investment']} />
                  <Bar dataKey="value" fill="var(--color-tertiary)" radius={[8, 8, 0, 0]} barSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* Top Developing Cities Table */}
        <section>
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold font-serif">Top Developing Cities</h2>
            <button className="text-sm font-semibold text-primary flex items-center gap-1 hover:underline">
              View Full Index <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          
          <div className="overflow-hidden rounded-xl bg-surface-container-low border border-outline-variant/10">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-high/50">
                  <th className="px-6 py-4 text-xs uppercase tracking-widest font-bold text-on-surface-variant">City Center</th>
                  <th className="px-6 py-4 text-xs uppercase tracking-widest font-bold text-on-surface-variant">Region</th>
                  <th className="px-6 py-4 text-xs uppercase tracking-widest font-bold text-on-surface-variant text-center">Active Projects</th>
                  <th className="px-6 py-4 text-xs uppercase tracking-widest font-bold text-on-surface-variant text-right">Total Valuation</th>
                  <th className="px-6 py-4 text-xs uppercase tracking-widest font-bold text-on-surface-variant">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {cityData.map((row) => (
                  <tr key={row.city} className="hover:bg-surface-container transition-colors duration-200">
                    <td className="px-6 py-5 font-bold text-on-surface font-serif">{row.city}</td>
                    <td className="px-6 py-5 text-sm">{row.region}</td>
                    <td className="px-6 py-5 text-center font-mono">{row.projects.toString().padStart(2, '0')}</td>
                    <td className="px-6 py-5 text-right font-semibold">{row.valuation}</td>
                    <td className="px-6 py-5">
                      <span className={cn("px-3 py-1 text-[10px] font-bold rounded-full uppercase", row.statusColor)}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Priority Projects */}
        <section>
          <div className="mb-10">
            <h2 className="text-3xl font-bold font-serif mb-2">Upcoming Visions</h2>
            <p className="text-on-surface-variant font-medium">Projects currently in Land Acquisition & Concept Design stages.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Project 1 (Large) */}
            <div className="md:col-span-2 group relative overflow-hidden rounded-xl bg-surface-container-high min-h-[384px] flex flex-col justify-end p-10 border border-outline-variant/10 shadow-lg cursor-pointer">
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent z-10"></div>
              <img 
                src="https://images.unsplash.com/photo-1548013146-72479768bada?q=80&w=2000&auto=format&fit=crop" 
                alt="Temple Architecture" 
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="relative z-20">
                <span className="inline-block px-3 py-1 bg-primary-container text-on-primary-container text-[10px] font-bold rounded-sm uppercase tracking-widest mb-4">Land Acquired</span>
                <h3 className="text-3xl font-bold text-white mb-2 font-serif">The Noida Spiritual Oasis</h3>
                <p className="text-white/80 text-sm max-w-lg mb-6 leading-relaxed">
                  A 25-acre mixed-use development featuring a Vedic planetarium, sustainable farming complex, and a state-of-the-art youth intelligence center. Currently finalizing structural engineering permits.
                </p>
                <div className="flex items-center gap-8">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-white/50 tracking-tighter">Acquisition Cost</p>
                    <p className="text-white font-bold">$12.5M</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-white/50 tracking-tighter">Est. Completion</p>
                    <p className="text-white font-bold">Q4 2027</p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Project 2 */}
            <div className="bg-surface-container-low p-8 rounded-xl border border-outline-variant/10 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-6">
                  <span className="w-12 h-12 rounded-full bg-secondary-container flex items-center justify-center text-on-secondary-container font-black">SYD</span>
                  <span className="text-[10px] font-bold text-primary uppercase">Proposal Phase</span>
                </div>
                <h3 className="text-xl font-bold mb-3 font-serif">Sydney Harbour Outreach</h3>
                <p className="text-sm text-on-surface-variant leading-relaxed mb-6">
                  Proposed landmark overlooking the harbor, focusing on high-visibility cultural diplomacy and meditation archives.
                </p>
              </div>
              <div className="pt-6 border-t border-outline-variant/20">
                <div className="flex items-center justify-between text-xs font-bold uppercase text-on-surface-variant mb-2">
                  <span>Fundraising Status</span>
                  <span>18%</span>
                </div>
                <div className="w-full h-1 bg-surface-container rounded-full overflow-hidden">
                  <div className="h-full bg-secondary w-[18%]"></div>
                </div>
              </div>
            </div>
          </div>
        </section>

      </div>
    </Layout>
  );
}
