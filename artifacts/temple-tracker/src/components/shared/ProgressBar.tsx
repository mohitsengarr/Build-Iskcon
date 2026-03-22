import { cn } from "@/lib/utils";

interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  showValue?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function ProgressBar({ 
  value, 
  max = 100, 
  label, 
  showValue = true,
  className,
  size = "md"
}: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  
  const heightClass = {
    sm: "h-1.5",
    md: "h-2.5",
    lg: "h-4"
  }[size];

  return (
    <div className={cn("w-full", className)}>
      {(label || showValue) && (
        <div className="flex justify-between items-end mb-2">
          {label && <span className="text-sm font-medium text-foreground/80">{label}</span>}
          {showValue && <span className="text-xs font-bold text-primary">{Math.round(percentage)}%</span>}
        </div>
      )}
      <div className={cn("w-full bg-black/5 rounded-full overflow-hidden", heightClass)}>
        <div 
          className="h-full bg-saffron-gradient rounded-full transition-all duration-1000 ease-out relative"
          style={{ width: `${percentage}%` }}
        >
          <div className="absolute inset-0 bg-white/20 w-full h-full" style={{
            background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 2s infinite"
          }} />
        </div>
      </div>
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
