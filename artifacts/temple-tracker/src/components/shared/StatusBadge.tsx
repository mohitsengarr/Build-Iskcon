import { cn } from "@/lib/utils";
import { TempleStatus, MilestoneStatus } from "@workspace/api-client-react";

interface StatusBadgeProps {
  status: TempleStatus | MilestoneStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      case "planning":
        return { label: "Planning", classes: "bg-amber-50 text-amber-700 ring-amber-200" };
      case "construction":
        return { label: "Construction", classes: "bg-orange-50 text-orange-700 ring-orange-200" };
      case "finishing":
        return { label: "Finishing", classes: "bg-yellow-50 text-yellow-800 ring-yellow-200" };
      case "consecrated":
        return { label: "Consecrated", classes: "bg-lime-50 text-lime-800 ring-lime-200" };
      case "operational":
        return { label: "Operational", classes: "bg-primary/10 text-primary ring-primary/20" };
      
      case "pending":
        return { label: "Pending", classes: "bg-gray-100 text-gray-600 ring-gray-200" };
      case "in_progress":
        return { label: "In Progress", classes: "bg-amber-50 text-amber-700 ring-amber-200" };
      case "completed":
        return { label: "Completed", classes: "bg-lime-50 text-lime-800 ring-lime-200" };
      
      default:
        return { label: status, classes: "bg-gray-50 text-gray-700 ring-gray-200" };
    }
  };

  const config = getStatusConfig();

  return (
    <span className={cn(
      "px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ring-1 ring-inset",
      config.classes,
      className
    )}>
      {config.label}
    </span>
  );
}
