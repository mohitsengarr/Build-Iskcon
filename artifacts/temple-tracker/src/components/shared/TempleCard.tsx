import { Link } from "wouter";
import { Temple } from "@workspace/api-client-react";
import { StatusBadge } from "./StatusBadge";
import { ProgressBar } from "./ProgressBar";
import { MapPin } from "lucide-react";
import { motion } from "framer-motion";

export function TempleCard({ temple, index }: { temple: Temple, index: number }) {
  // Use user provided placeholder or unsplash fallback if no cover image
  const coverImg = temple.coverImage || `${import.meta.env.BASE_URL}images/temple-placeholder.png`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
    >
      <Link href={`/temples/${temple.id}`}>
        <div className="group bg-card rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer h-full flex flex-col border-0">
          <div className="relative h-48 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent z-10" />
            <img 
              src={coverImg} 
              alt={temple.name} 
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
            />
            <div className="absolute top-4 left-4 z-20">
              <StatusBadge status={temple.status} className="bg-white/90 backdrop-blur-sm text-foreground ring-0 shadow-sm" />
            </div>
            <div className="absolute bottom-4 left-4 right-4 z-20">
              <h3 className="font-serif font-bold text-white text-xl leading-tight mb-1 group-hover:text-primary-foreground transition-colors">{temple.name}</h3>
              <div className="flex items-center text-white/80 text-xs font-medium">
                <MapPin className="w-3 h-3 mr-1" />
                {temple.location}
              </div>
            </div>
          </div>
          
          <div className="p-6 flex-1 flex flex-col">
            <div className="flex justify-between items-center mb-4 pb-4 border-b border-border/40">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Deity</p>
                <p className="font-semibold text-foreground">{temple.deity}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Phase</p>
                <p className="font-semibold text-primary">{temple.phase}</p>
              </div>
            </div>
            
            <div className="space-y-5 mt-auto">
              <ProgressBar 
                value={temple.constructionProgress} 
                label="Construction" 
                size="sm"
              />
              <ProgressBar 
                value={temple.fundraisingRaised} 
                max={temple.fundraisingGoal} 
                label="Fundraising" 
                size="sm"
              />
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
