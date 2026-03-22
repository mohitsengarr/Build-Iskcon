import { cn } from "@/lib/utils";

interface AvatarRingProps {
  src?: string | null;
  initials: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

export function AvatarRing({ src, initials, size = "md", className }: AvatarRingProps) {
  const sizeClasses = {
    sm: "w-8 h-8 text-xs",
    md: "w-12 h-12 text-sm",
    lg: "w-16 h-16 text-lg",
    xl: "w-24 h-24 text-2xl"
  };

  return (
    <div className={cn(
      "rounded-full bg-gradient-to-br from-primary to-[#ff9933] p-[2px] shadow-md",
      sizeClasses[size],
      className
    )}>
      <div className="w-full h-full rounded-full border-[3px] border-card bg-card overflow-hidden flex items-center justify-center">
        {src ? (
          <img src={src} alt={initials} className="w-full h-full object-cover" />
        ) : (
          <span className="font-serif font-bold text-primary">{initials}</span>
        )}
      </div>
    </div>
  );
}
