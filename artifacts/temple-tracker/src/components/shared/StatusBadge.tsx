import { cn } from "@/lib/utils";
import { TempleStatus, MilestoneStatus } from "@workspace/api-client-react";

interface StatusBadgeProps {
  status: TempleStatus | MilestoneStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      // Temple Statuses
      case "planning":
        return { label: "Planning", classes: "bg-blue-50 text-blue-700 ring-blue-200" };
      case "construction":
        return { label: "Construction", classes: "bg-amber-50 text-amber-700 ring-amber-200" };
      case "finishing":
        return { label: "Finishing", classes: "bg-purple-50 text-purple-700 ring-purple-200" };
      case "consecrated":
        return { label: "Consecrated", classes: "bg-emerald-50 text-emerald-700 ring-emerald-200" };
      case "operational":
        return { label: "Operational", classes: "bg-primary/10 text-primary ring-primary/20" };
      
      // Milestone Statuses
      case "pending":
        return { label: "Pending", classes: "bg-gray-100 text-gray-600 ring-gray-200" };
      case "in_progress":
        return { label: "In Progress", classes: "bg-amber-50 text-amber-700 ring-amber-200" };
      case "completed":
        return { label: "Completed", classes: "bg-emerald-50 text-emerald-700 ring-emerald-200" };
      
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
