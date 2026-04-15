import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { fadeInUp } from "@/lib/animations";
import { Users, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

interface Persona {
  key: string;
  name: string;
  shortDescription: string;
  fullDescription: string;
  faceImage: string | null;
}

export default function PersonaGallery() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/bhagwatham/persona/gallery")
      .then((r) => r.json())
      .then((data) => {
        setPersonas(Array.isArray(data) ? data : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <SEOHead
        title="Character Gallery — Build ISKCON"
        description="Visual gallery of Srimad Bhagavatam characters with AI-generated portraits and detailed descriptions."
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <motion.div variants={fadeInUp} initial="hidden" animate="visible" className="text-center mb-10">
          <div className="w-14 h-14 mx-auto mb-4 bg-orange-100 rounded-2xl flex items-center justify-center">
            <Users className="w-7 h-7 text-orange-600" />
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-stone-800 mb-2">
            Character Gallery
          </h1>
          <p className="text-stone-500 text-sm max-w-lg mx-auto">
            All characters from Srimad Bhagavatam that we track for visual consistency
            across AI-generated illustrations. Each character has a fixed appearance description
            to maintain identity across all chapter images.
          </p>
        </motion.div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-stone-400">
            <Loader2 className="w-8 h-8 animate-spin mb-4" />
            <p className="text-sm">Loading personas...</p>
          </div>
        ) : personas.length === 0 ? (
          <p className="text-center text-stone-400 py-12">No personas available yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {personas.map((p, i) => {
              const isExpanded = expanded === p.key;
              return (
                <motion.div
                  key={p.key}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.3 }}
                  className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow"
                >
                  {/* Face image */}
                  <div className="aspect-square bg-stone-100 relative overflow-hidden">
                    {p.faceImage ? (
                      <img
                        src={`/api/bhagwatham/faces/${p.faceImage}`}
                        alt={p.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-orange-50 to-amber-100">
                        <div className="text-center">
                          <div className="w-20 h-20 mx-auto mb-2 rounded-full bg-gradient-to-br from-orange-200 to-amber-300 flex items-center justify-center shadow-inner">
                            <span className="text-3xl font-serif font-bold text-orange-700/70">
                              {p.name.charAt(0)}
                            </span>
                          </div>
                          <p className="text-[10px] text-orange-600/50 font-medium italic">Portrait coming soon</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <h3 className="font-serif text-lg font-bold text-stone-800 mb-1">
                      {p.name}
                    </h3>
                    <p className="text-xs text-stone-500 leading-relaxed mb-3">
                      {p.shortDescription}
                    </p>

                    {/* Expand full description */}
                    <button
                      onClick={() => setExpanded(isExpanded ? null : p.key)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-orange-600 hover:text-orange-700 transition-colors"
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="w-3.5 h-3.5" /> Hide details
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3.5 h-3.5" /> Full description
                        </>
                      )}
                    </button>

                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="mt-3 pt-3 border-t border-stone-100"
                      >
                        <p className="text-xs text-stone-600 leading-relaxed">
                          {p.fullDescription}
                        </p>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Stats footer */}
        {!loading && personas.length > 0 && (
          <div className="text-center mt-10 pt-6 border-t border-stone-200">
            <p className="text-xs text-stone-400">
              {personas.length} characters tracked &middot;{" "}
              {personas.filter((p) => p.faceImage).length} with portraits
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}
