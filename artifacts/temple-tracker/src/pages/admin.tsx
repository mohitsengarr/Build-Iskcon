import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, BookOpen, Image as ImageIcon, Loader2,
  CheckCircle2, AlertCircle, Clock, Zap, Globe, Camera,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

interface BhagProgress {
  lastProcessedPage: number;
  totalPagesProcessed: number;
  totalPagesInPdf: number;
  status: string;
  lastProcessedAt: string | null;
  batchesCompleted: number;
}

interface AuditProgress {
  lastAuditedChapter: number;
  totalIssuesFixed: number;
  lastRunAt: string;
  status: string;
  log: Array<{ chapter: number; issues: string[]; fixes: string[]; timestamp: string }>;
}

interface ImageManifest {
  images: Array<{ chapterNumber: number; imagePath: string; generatedAt?: string }>;
  lastUpdated: string;
}

interface IGStatus {
  nextChapter: number;
  totalPosted: number;
  lastPostedAt: string | null;
  paused: boolean;
  lastError: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: "bg-green-100 text-green-700",
    idle: "bg-stone-100 text-stone-600",
    processing: "bg-amber-100 text-amber-700",
    running: "bg-blue-100 text-blue-700",
    error: "bg-red-100 text-red-700",
  };
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${colors[status] || colors.idle}`}>
      {status}
    </span>
  );
}

// ── Service Card ────────────────────────────────────────────────────────────

function ServiceCard({
  title, icon, children, status, lastRun, actions,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  status?: string;
  lastRun?: string | null;
  actions?: Array<{ label: string; onClick: () => void; loading?: boolean }>;
}) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-stone-50 flex items-center justify-center text-stone-500">{icon}</div>
          <div>
            <h3 className="text-sm font-bold text-stone-800">{title}</h3>
            {lastRun && <p className="text-[10px] text-stone-400">{timeAgo(lastRun)}</p>}
          </div>
        </div>
        {status && <StatusBadge status={status} />}
      </div>
      <div className="px-5 py-4 space-y-2 text-sm text-stone-600">{children}</div>
      {actions && actions.length > 0 && (
        <div className="px-5 py-3 bg-stone-50 border-t border-stone-100 flex gap-2 flex-wrap">
          {actions.map((a, i) => (
            <button
              key={i}
              onClick={a.onClick}
              disabled={a.loading}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-stone-200 text-stone-600 hover:border-orange-300 hover:text-orange-600 transition-all disabled:opacity-50"
            >
              {a.loading ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : <Zap className="w-3 h-3 inline mr-1" />}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-stone-400 text-xs">{label}</span>
      <span className="font-mono text-xs font-bold text-stone-700">{value}</span>
    </div>
  );
}

// ── Main Admin Page ─────────────────────────────────────────────────────────

export default function Admin() {
  const [bhagProgress, setBhagProgress] = useState<BhagProgress | null>(null);
  const [audit, setAudit] = useState<AuditProgress | null>(null);
  const [manifest, setManifest] = useState<ImageManifest | null>(null);
  const [gitaProgress, setGitaProgress] = useState<BhagProgress | null>(null);
  const [igStatus, setIgStatus] = useState<IGStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [bhag, aud, mani, gita, ig] = await Promise.allSettled([
      fetch("/api/bhagwatham/progress").then(r => r.json()),
      fetch("/api/bhagwatham/audit").then(r => r.json()),
      fetch("/api/bhagwatham/image-manifest").then(r => r.json()),
      fetch("/api/gita/progress").then(r => r.json()),
      fetch("/api/bhagwatham/instagram/cron-status").then(r => r.json()),
    ]);
    if (bhag.status === "fulfilled") setBhagProgress(bhag.value);
    if (aud.status === "fulfilled") setAudit(aud.value);
    if (mani.status === "fulfilled") setManifest(mani.value);
    if (gita.status === "fulfilled") setGitaProgress(gita.value);
    if (ig.status === "fulfilled") setIgStatus(ig.value);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); const t = setInterval(fetchAll, 30_000); return () => clearInterval(t); }, [fetchAll]);

  const runAction = async (label: string, url: string) => {
    setActionLoading(label);
    try { await fetch(url, { method: "POST" }); await fetchAll(); } catch { /* ignore */ }
    setActionLoading(null);
  };

  // Compute stats
  const chaptersWithImages = manifest ? new Set(manifest.images.map(i => i.chapterNumber)).size : 0;
  const recentAudit = audit?.log?.[0];

  if (loading && !bhagProgress) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <div className="bg-white border-b border-stone-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-stone-800">Admin Dashboard</h1>
            <p className="text-xs text-stone-400">Build ISKCON — Service Monitor</p>
          </div>
          <button onClick={fetchAll} className="p-2 rounded-lg hover:bg-stone-100 text-stone-500 transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="max-w-5xl mx-auto px-6 py-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* Bhagwatham OCR */}
        <ServiceCard
          title="Bhagwatham OCR"
          icon={<BookOpen className="w-4 h-4" />}
          status={bhagProgress?.status || "unknown"}
          lastRun={bhagProgress?.lastProcessedAt}
          actions={[
            { label: "Run Re-OCR", onClick: () => runAction("reocr", "/api/bhagwatham/reprocess-empty?limit=50&reverse=true"), loading: actionLoading === "reocr" },
          ]}
        >
          <Stat label="Pages" value={`${bhagProgress?.totalPagesProcessed?.toLocaleString() || 0} / ${bhagProgress?.totalPagesInPdf?.toLocaleString() || 0}`} />
          <Stat label="Batches" value={bhagProgress?.batchesCompleted || 0} />
          <Stat label="Progress" value={bhagProgress && bhagProgress.totalPagesInPdf > 0 ? `${((bhagProgress.totalPagesProcessed / bhagProgress.totalPagesInPdf) * 100).toFixed(1)}%` : "—"} />
        </ServiceCard>

        {/* Bhagwatham Audit + Images */}
        <ServiceCard
          title="Images & Audit"
          icon={<ImageIcon className="w-4 h-4" />}
          status={audit?.status || "unknown"}
          lastRun={audit?.lastRunAt}
          actions={[
            { label: "Run Audit", onClick: () => runAction("audit", "/api/bhagwatham/audit"), loading: actionLoading === "audit" },
          ]}
        >
          <Stat label="Total Images" value={manifest?.images.length || 0} />
          <Stat label="Chapters w/ Images" value={chaptersWithImages} />
          <Stat label="Issues Fixed" value={audit?.totalIssuesFixed || 0} />
          {recentAudit && (
            <div className="mt-2 p-2 bg-stone-50 rounded-lg text-[10px]">
              <p className="font-bold text-stone-500">Last: Ch {recentAudit.chapter}</p>
              {recentAudit.fixes.map((f, i) => (
                <p key={i} className="text-green-600 flex items-center gap-1"><CheckCircle2 className="w-2.5 h-2.5" />{f}</p>
              ))}
              {recentAudit.issues.filter(is => !recentAudit.fixes.some(f => f.includes(is.split(" ")[0]))).map((is, i) => (
                <p key={i} className="text-amber-600 flex items-center gap-1"><AlertCircle className="w-2.5 h-2.5" />{is.substring(0, 60)}</p>
              ))}
            </div>
          )}
        </ServiceCard>

        {/* Gita OCR */}
        <ServiceCard
          title="Bhagavad Gita OCR"
          icon={<BookOpen className="w-4 h-4" />}
          status={gitaProgress?.status || "not started"}
          lastRun={gitaProgress?.lastProcessedAt}
        >
          <Stat label="Pages" value={`${gitaProgress?.totalPagesProcessed?.toLocaleString() || 0} / ${gitaProgress?.totalPagesInPdf?.toLocaleString() || 0}`} />
          <Stat label="Batches" value={gitaProgress?.batchesCompleted || 0} />
          <Stat label="Engine" value="PaddleOCR" />
        </ServiceCard>

        {/* Instagram */}
        <ServiceCard
          title="Instagram Cron"
          icon={<Camera className="w-4 h-4" />}
          status={igStatus?.paused ? "paused" : "active"}
          lastRun={igStatus?.lastPostedAt}
        >
          <Stat label="Next Chapter" value={igStatus?.nextChapter || "—"} />
          <Stat label="Total Posted" value={igStatus?.totalPosted || 0} />
          <Stat label="Schedule" value="Every 6 hours" />
          {igStatus?.lastError && (
            <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-2.5 h-2.5" />{igStatus.lastError.substring(0, 80)}</p>
          )}
        </ServiceCard>

        {/* Temple Discovery */}
        <ServiceCard
          title="Temple Discovery"
          icon={<Globe className="w-4 h-4" />}
          status="active"
          actions={[
            { label: "Run Discovery", onClick: () => runAction("discover", "/api/discover-temples"), loading: actionLoading === "discover" },
          ]}
        >
          <Stat label="Source" value="Firecrawl + Claude" />
          <Stat label="Storage" value="Supabase" />
          <Stat label="Schedule" value="Hourly at :07" />
        </ServiceCard>

        {/* Server Info */}
        <ServiceCard
          title="Server"
          icon={<Clock className="w-4 h-4" />}
          status="running"
        >
          <Stat label="Platform" value="Local (laptop)" />
          <Stat label="Port" value="5001" />
          <Stat label="Deployment" value="Vercel (static)" />
          <Stat label="OCR Services" value="Must stay local" />
          <div className="mt-2 p-2 bg-amber-50 rounded-lg text-[10px] text-amber-700">
            <p className="font-bold">Cannot move to Vercel:</p>
            <p>OCR, Image Gen, Instagram, Git ops — need persistent process + file I/O</p>
          </div>
        </ServiceCard>
      </div>

      {/* Audit Log */}
      {audit?.log && audit.log.length > 0 && (
        <div className="max-w-5xl mx-auto px-6 pb-8">
          <h2 className="text-sm font-bold text-stone-700 mb-3">Recent Audit Log</h2>
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-stone-50 text-stone-500">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Chapter</th>
                  <th className="px-4 py-2 text-left font-semibold">Time</th>
                  <th className="px-4 py-2 text-left font-semibold">Issues</th>
                  <th className="px-4 py-2 text-left font-semibold">Fixes</th>
                </tr>
              </thead>
              <tbody>
                {audit.log.slice(0, 15).map((entry, i) => (
                  <tr key={i} className="border-t border-stone-100">
                    <td className="px-4 py-2 font-mono font-bold">{entry.chapter}</td>
                    <td className="px-4 py-2 text-stone-400">{timeAgo(entry.timestamp)}</td>
                    <td className="px-4 py-2">
                      {entry.issues.length === 0 ? <span className="text-green-500">✓ clean</span> : (
                        <span className="text-amber-600">{entry.issues.length} issue(s)</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {entry.fixes.length > 0 ? (
                        <span className="text-green-600">{entry.fixes[0].substring(0, 50)}</span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
