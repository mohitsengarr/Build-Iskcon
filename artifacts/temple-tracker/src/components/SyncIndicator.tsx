import { useState, useEffect, useCallback } from "react";
import { RefreshCw, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface SyncStatus {
  inProgress: boolean;
  latestJob: {
    id: number;
    status: "running" | "completed" | "failed";
    templesUpdated: number;
    templesAdded: number;
    updatesCreated: number;
    startedAt: string;
    completedAt: string | null;
    error: string | null;
  } | null;
}

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE_URL}/api`;

export function SyncIndicator() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API}/sync/status`);
      if (!res.ok) return;
      const data: SyncStatus = await res.json();
      setStatus(data);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  useEffect(() => {
    if (status?.inProgress) {
      const interval = setInterval(fetchStatus, 3000);
      return () => clearInterval(interval);
    }
  }, [status?.inProgress, fetchStatus]);

  const triggerSync = async () => {
    if (triggering || status?.inProgress) return;
    setTriggering(true);
    try {
      const res = await fetch(`${API}/sync`, { method: "POST" });
      if (res.status === 202) {
        await fetchStatus();
        setTimeout(fetchStatus, 3000);
      }
    } catch {
      // silently fail
    } finally {
      setTriggering(false);
    }
  };

  const isRunning = triggering || status?.inProgress;
  const latestJob = status?.latestJob;
  const lastSyncedAt = latestJob?.completedAt ? new Date(latestJob.completedAt) : null;

  return (
    <div className="relative flex items-center gap-2">
      <button
        onClick={triggerSync}
        disabled={isRunning}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-300",
          isRunning
            ? "bg-primary/10 text-primary cursor-not-allowed"
            : latestJob?.status === "failed"
            ? "bg-error/10 text-error hover:bg-error/20"
            : "bg-primary/8 text-primary hover:bg-primary/15 active:scale-95"
        )}
      >
        {isRunning ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : latestJob?.status === "failed" ? (
          <AlertCircle className="w-3.5 h-3.5" />
        ) : (
          <RefreshCw className="w-3.5 h-3.5" />
        )}
        <span className="hidden sm:inline">
          {isRunning ? "Syncing…" : "Sync Data"}
        </span>
      </button>

      {lastSyncedAt && !isRunning && (
        <div className="hidden md:flex items-center gap-1 text-[10px] text-on-surface-variant/60 font-medium">
          <CheckCircle2 className="w-3 h-3 text-green-600" />
          <span>{formatDistanceToNow(lastSyncedAt, { addSuffix: true })}</span>
        </div>
      )}

      {showTooltip && (
        <div className="absolute top-full right-0 mt-2 w-56 bg-surface shadow-lg rounded-xl border border-outline-variant/20 p-3 z-50 text-xs">
          <p className="font-bold text-on-surface mb-1">Claude AI Data Sync</p>
          <p className="text-on-surface-variant leading-relaxed">
            Uses Claude to research and update temple construction progress, fundraising data, and project updates every 6 hours.
          </p>
          {latestJob && (
            <div className="mt-2 pt-2 border-t border-outline-variant/20 text-on-surface-variant/70 space-y-0.5">
              <p>Last run: {lastSyncedAt ? formatDistanceToNow(lastSyncedAt, { addSuffix: true }) : "in progress"}</p>
              {latestJob.status === "completed" && (
                <>
                  <p>{latestJob.templesUpdated} temples updated · {latestJob.updatesCreated} new posts</p>
                  {latestJob.templesAdded > 0 && (
                    <p className="text-primary font-semibold">+{latestJob.templesAdded} new projects discovered</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
