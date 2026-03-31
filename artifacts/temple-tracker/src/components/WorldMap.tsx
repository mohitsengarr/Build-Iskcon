import { useState } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";
import type { GeographyObject, GeographiesChildrenArg, MoveEndArg } from "react-simple-maps";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { MapPin, X } from "lucide-react";

const GEO_URL = `${import.meta.env.BASE_URL}countries-110m.json`;

const STATUS_CONFIG: Record<string, { color: string; ring: string; label: string }> = {
  planning:     { color: "#1565C0", ring: "rgba(21,101,192,0.3)",  label: "Planning" },
  construction: { color: "#E65100", ring: "rgba(230,81,0,0.3)",    label: "Construction" },
  finishing:    { color: "#F9A825", ring: "rgba(249,168,37,0.3)",  label: "Finishing" },
  consecrated:  { color: "#2E7D32", ring: "rgba(46,125,50,0.3)",   label: "Consecrated" },
};

interface Temple {
  id: number;
  name: string;
  location: string;
  status: string;
  constructionProgress: number;
  fundraisingGoal: number;
  fundraisingRaised: number;
  latitude: number | null;
  longitude: number | null;
}

interface Props {
  temples: Temple[];
}

interface Tooltip {
  temple: Temple;
  x: number;
  y: number;
}

export function WorldMap({ temples }: Props) {
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<[number, number]>([20, 10]);
  const [, navigate] = useLocation();

  const mapped = temples.filter((t) => t.latitude != null && t.longitude != null);

  const handleMouseMove = (
    e: React.MouseEvent<SVGCircleElement>,
    temple: Temple
  ) => {
    const rect = (e.currentTarget.closest("svg") as SVGSVGElement)
      ?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({
      temple,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <div className="relative w-full rounded-2xl overflow-hidden bg-[#0d1117] shadow-[0_8px_40px_rgba(0,0,0,0.4)]">
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md border border-white/10 rounded-full px-3 py-1.5">
          <MapPin className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[11px] font-bold text-white/80 tracking-wider uppercase">
            {mapped.length} Active Sites
          </span>
        </div>
      </div>

      <div className="absolute top-4 right-4 z-20 flex gap-2">
        <button
          onClick={() => setZoom((z) => Math.min(z + 0.8, 8))}
          className="w-8 h-8 bg-black/60 backdrop-blur-md border border-white/10 rounded-lg text-white/80 hover:text-white flex items-center justify-center text-sm font-bold transition-colors"
        >
          +
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(z - 0.8, 1))}
          className="w-8 h-8 bg-black/60 backdrop-blur-md border border-white/10 rounded-lg text-white/80 hover:text-white flex items-center justify-center text-sm font-bold transition-colors"
        >
          −
        </button>
        <button
          onClick={() => { setZoom(1); setCenter([20, 10]); }}
          className="w-8 h-8 bg-black/60 backdrop-blur-md border border-white/10 rounded-lg text-white/80 hover:text-white flex items-center justify-center transition-colors"
          title="Reset"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 140 }}
        style={{ width: "100%", height: "100%" }}
        height={440}
      >
        <ZoomableGroup
          zoom={zoom}
          center={center}
          onMoveEnd={({ coordinates, zoom: z }: MoveEndArg) => {
            setCenter(coordinates);
            setZoom(z);
          }}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }: GeographiesChildrenArg) =>
              geographies.map((geo: GeographyObject) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="#1c2333"
                  stroke="#2d3748"
                  strokeWidth={0.4}
                  style={{
                    default: { outline: "none" },
                    hover: { fill: "#253047", outline: "none" },
                    pressed: { outline: "none" },
                  }}
                />
              ))
            }
          </Geographies>

          {mapped.map((temple) => {
            const cfg = STATUS_CONFIG[temple.status] ?? STATUS_CONFIG.planning;
            return (
              <Marker
                key={temple.id}
                coordinates={[temple.longitude!, temple.latitude!]}
              >
                <circle
                  r={6 / zoom}
                  fill={cfg.ring}
                  strokeWidth={0}
                />
                <circle
                  r={4 / zoom}
                  fill={cfg.color}
                  stroke="rgba(255,255,255,0.3)"
                  strokeWidth={0.8 / zoom}
                  className="cursor-pointer"
                  onMouseEnter={(e) => handleMouseMove(e as unknown as React.MouseEvent<SVGCircleElement>, temple)}
                  onMouseMove={(e) => handleMouseMove(e as unknown as React.MouseEvent<SVGCircleElement>, temple)}
                  onMouseLeave={() => setTooltip(null)}
                  onClick={() => { setTooltip(null); navigate(`/temples/${temple.id}`); }}
                />
              </Marker>
            );
          })}
        </ZoomableGroup>
      </ComposableMap>

      <AnimatePresence>
        {tooltip && (
          <motion.div
            key={tooltip.temple.id}
            initial={{ opacity: 0, scale: 0.92, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 6 }}
            transition={{ duration: 0.15 }}
            className="absolute z-30 pointer-events-none"
            style={{
              left: Math.min(tooltip.x + 12, window.innerWidth - 220),
              top: Math.max(tooltip.y - 80, 8),
            }}
          >
            <div className="bg-[#0d1117]/95 backdrop-blur-xl border border-white/10 rounded-xl px-4 py-3 shadow-2xl min-w-[180px] max-w-[220px]">
              <div
                className="inline-block mb-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest"
                style={{
                  background: `${(STATUS_CONFIG[tooltip.temple.status] ?? STATUS_CONFIG.planning).ring}`,
                  color: (STATUS_CONFIG[tooltip.temple.status] ?? STATUS_CONFIG.planning).color,
                }}
              >
                {(STATUS_CONFIG[tooltip.temple.status] ?? STATUS_CONFIG.planning).label}
              </div>
              <p className="text-white text-[13px] font-bold font-serif leading-snug mb-1">
                {tooltip.temple.name}
              </p>
              <p className="text-white/50 text-[11px] flex items-center gap-1">
                <MapPin className="w-3 h-3 shrink-0" />
                {tooltip.temple.location}
              </p>
              <div className="mt-2 pt-2 border-t border-white/10">
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-white/50">Progress</span>
                  <span className="text-amber-400 font-bold">
                    {Math.round(tooltip.temple.constructionProgress)}%
                  </span>
                </div>
                <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-amber-700 rounded-full"
                    style={{ width: `${Math.round(tooltip.temple.constructionProgress)}%` }}
                  />
                </div>
              </div>
              <p className="mt-2 text-[10px] text-amber-400/70 font-medium">
                Click pin to view details →
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute bottom-4 left-4 z-20">
        <div className="flex flex-wrap gap-2">
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <div
              key={key}
              className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md border border-white/10 rounded-full px-2.5 py-1"
            >
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: cfg.color }}
              />
              <span className="text-[10px] font-bold text-white/70 uppercase tracking-wider">
                {cfg.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
