// ── Image Playground ─────────────────────────────────────────────────────────
// A test bench for the artwork generator: tune the prompt, model and size, see
// the EXACT payload that goes to Together AI, generate a sample, and — once it
// looks right — approve the configuration so every later generation uses it.
//
// Approving writes a new row to public.image_gen_config with is_active = true
// (a DB trigger deactivates the previous one), so older configurations remain as
// history and can be restored.

import { useState, useEffect, useCallback, useMemo } from "react";
import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { Loader2, Sparkles, Check, RefreshCw, Clock, History, AlertCircle, ImageIcon } from "lucide-react";

const SUPABASE_URL = "https://etfmndcrchundvgtvmot.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0Zm1uZGNyY2h1bmR2Z3R2bW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc2NDE1MTIsImV4cCI6MjA2MzIxNzUxMn0.7GXS820xSFcUy2TRdbspN7s-NP3sgKFFtUP-Zw0Qbrs";

function sbFetch(path: string, opts?: RequestInit) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(opts?.headers || {}),
    },
  });
}

interface GenConfig {
  id?: number;
  label?: string | null;
  model: string;
  width: number;
  height: number;
  steps?: number | null;
  style_positives: string;
  style_negatives: string;
  extra_rules?: string | null;
  prompt_max_len: number;
  fallback_model?: string | null;
  fallback_width?: number | null;
  fallback_height?: number | null;
  is_active?: boolean;
  notes?: string | null;
  created_at?: string;
}

const MODELS = [
  "black-forest-labs/FLUX.2-pro",
  "black-forest-labs/FLUX.1.1-pro",
  "black-forest-labs/FLUX.1-schnell-Free",
  "black-forest-labs/FLUX.1-dev",
];

const SIZES: Array<{ label: string; w: number; h: number }> = [
  { label: "1088×1344 (portrait, production)", w: 1088, h: 1344 },
  { label: "768×1024 (portrait, fallback)", w: 768, h: 1024 },
  { label: "1024×1024 (square)", w: 1024, h: 1024 },
  { label: "1344×768 (landscape)", w: 1344, h: 768 },
];

const SAMPLE_SCENE =
  "Wide shot of an elderly MALE sage with a thick white beard seated in a forest hermitage, teaching devotees at sunrise. Setting: riverbank with banyan trees. Soft golden light.";

export default function ImagePlayground() {
  const [cfg, setCfg] = useState<GenConfig | null>(null);
  const [scene, setScene] = useState(SAMPLE_SCENE);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approvedFlash, setApprovedFlash] = useState(false);
  const [result, setResult] = useState<{ image?: string; request?: unknown; elapsed?: number; error?: string | null; chars?: number } | null>(null);
  const [history, setHistory] = useState<GenConfig[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const loadActive = useCallback(async () => {
    setLoading(true);
    try {
      const res = await sbFetch("image_gen_config?select=*&order=created_at.desc&limit=25");
      const rows: GenConfig[] = res.ok ? await res.json() : [];
      setHistory(rows);
      setCfg(rows.find(r => r.is_active) || rows[0] || null);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadActive(); }, [loadActive]);

  const set = <K extends keyof GenConfig>(k: K, v: GenConfig[K]) =>
    setCfg(c => (c ? { ...c, [k]: v } : c));

  // The payload preview mirrors exactly what the edge function will assemble.
  const previewPayload = useMemo(() => {
    if (!cfg) return null;
    let p = scene.trim();
    if (cfg.style_positives) p += `, ${cfg.style_positives}`;
    if (cfg.style_negatives) p += `, ${cfg.style_negatives}`;
    if (cfg.extra_rules) p += `. ${cfg.extra_rules}`;
    if (p.length > cfg.prompt_max_len) p = p.slice(0, cfg.prompt_max_len);
    const payload: Record<string, unknown> = {
      model: cfg.model, prompt: p, width: cfg.width, height: cfg.height, n: 1, response_format: "b64_json",
    };
    if (cfg.steps) payload.steps = cfg.steps;
    return payload;
  }, [cfg, scene]);

  const generate = useCallback(async () => {
    if (!cfg || generating) return;
    setGenerating(true); setResult(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/image-playground`, {
        method: "POST",
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          scene_prompt: scene,
          model: cfg.model, width: cfg.width, height: cfg.height, steps: cfg.steps ?? null,
          style_positives: cfg.style_positives, style_negatives: cfg.style_negatives,
          extra_rules: cfg.extra_rules || "", prompt_max_len: cfg.prompt_max_len,
        }),
      });
      const d = await res.json();
      setResult({
        image: d.image_b64 ? `data:image/png;base64,${d.image_b64}` : undefined,
        request: d.request, elapsed: d.elapsed_ms, error: d.error, chars: d.prompt_chars,
      });
    } catch (err) {
      setResult({ error: String(err) });
    } finally { setGenerating(false); }
  }, [cfg, scene, generating]);

  // Approve: save these settings as a NEW active configuration.
  const approve = useCallback(async () => {
    if (!cfg || approving) return;
    setApproving(true);
    try {
      const row = {
        label: cfg.label || `Tuned ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
        model: cfg.model, width: cfg.width, height: cfg.height, steps: cfg.steps ?? null,
        style_positives: cfg.style_positives, style_negatives: cfg.style_negatives,
        extra_rules: cfg.extra_rules || "", prompt_max_len: cfg.prompt_max_len,
        fallback_model: cfg.fallback_model, fallback_width: cfg.fallback_width, fallback_height: cfg.fallback_height,
        is_active: true, notes: cfg.notes || null,
      };
      const res = await sbFetch("image_gen_config", { method: "POST", body: JSON.stringify(row) });
      if (!res.ok) { alert(`Couldn't approve: ${await res.text().catch(() => res.statusText)}`); return; }
      setApprovedFlash(true);
      setTimeout(() => setApprovedFlash(false), 2500);
      await loadActive();
    } finally { setApproving(false); }
  }, [cfg, approving, loadActive]);

  const field = "w-full px-3 py-2 rounded-lg border border-stone-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-300";
  const lbl = "block text-[10px] uppercase tracking-wider font-bold text-stone-400 mb-1";

  return (
    <Layout>
      <SEOHead title="Image Playground — Build Iskcon" description="Tune the artwork generation prompt, model and settings." />
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-8 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="font-serif text-2xl font-bold text-stone-800">Image Playground</h1>
            <p className="text-xs text-stone-500">
              Tune the prompt and model, inspect the exact request sent to Together AI, then approve it for all future generation.
            </p>
          </div>
          <button onClick={() => void loadActive()} className="p-2 rounded-lg text-stone-400 hover:text-purple-600 hover:bg-purple-50" title="Reload">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-20 justify-center text-stone-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading configuration…
          </div>
        ) : !cfg ? (
          <p className="text-sm text-stone-400 py-20 text-center">No configuration found.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ── Left: settings ── */}
            <div className="space-y-4">
              <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Scene prompt</span>
                  <span className="text-[10px] text-stone-400">{scene.length} chars</span>
                </div>
                <textarea value={scene} onChange={e => setScene(e.target.value)} rows={4} className={field} placeholder="Describe the scene…" />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Model</label>
                    <select value={cfg.model} onChange={e => set("model", e.target.value)} className={field}>
                      {MODELS.map(m => <option key={m} value={m}>{m.split("/").pop()}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Size</label>
                    <select
                      value={`${cfg.width}x${cfg.height}`}
                      onChange={e => { const [w, h] = e.target.value.split("x").map(Number); set("width", w); set("height", h); }}
                      className={field}
                    >
                      {SIZES.map(s => <option key={s.label} value={`${s.w}x${s.h}`}>{s.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Steps (optional)</label>
                    <input type="number" value={cfg.steps ?? ""} onChange={e => set("steps", e.target.value ? Number(e.target.value) : null)} className={field} placeholder="model default" />
                  </div>
                  <div>
                    <label className={lbl}>Max prompt chars</label>
                    <input type="number" value={cfg.prompt_max_len} onChange={e => set("prompt_max_len", Number(e.target.value) || 2000)} className={field} />
                  </div>
                </div>

                <div>
                  <label className={lbl}>Style — positives</label>
                  <textarea value={cfg.style_positives} onChange={e => set("style_positives", e.target.value)} rows={3} className={field} />
                </div>
                <div>
                  <label className={lbl}>Style — negatives</label>
                  <textarea value={cfg.style_negatives} onChange={e => set("style_negatives", e.target.value)} rows={2} className={field} />
                </div>
                <div>
                  <label className={lbl}>Extra rules (masculinity, anachronism…)</label>
                  <textarea value={cfg.extra_rules || ""} onChange={e => set("extra_rules", e.target.value)} rows={3} className={field} />
                </div>
                <div>
                  <label className={lbl}>Label for this configuration</label>
                  <input value={cfg.label || ""} onChange={e => set("label", e.target.value)} className={field} placeholder="e.g. Warmer palette, fewer negatives" />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={() => void generate()} disabled={generating}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-50">
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {generating ? "Generating…" : "Generate sample"}
                </button>
                <button onClick={() => void approve()} disabled={approving}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
                  title="Save these settings as the active configuration for all future image generation">
                  {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : approvedFlash ? <Check className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                  {approvedFlash ? "Approved" : "Approve config"}
                </button>
              </div>
              {approvedFlash && (
                <p className="text-[11px] text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  Saved as the active configuration — future image generation will use these settings.
                </p>
              )}
            </div>

            {/* ── Right: payload + result ── */}
            <div className="space-y-4">
              <div className="bg-stone-900 rounded-2xl p-4 overflow-hidden">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-stone-400">Request sent to Together AI</span>
                  <span className="text-[10px] text-stone-500 ml-auto">POST /v1/images/generations</span>
                </div>
                <pre className="text-[11px] leading-relaxed text-green-300 overflow-x-auto whitespace-pre-wrap break-words max-h-72">
                  {JSON.stringify(previewPayload, null, 2)}
                </pre>
              </div>

              <div className="bg-white border border-stone-200 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Sample output</span>
                  {result?.elapsed != null && (
                    <span className="flex items-center gap-1 text-[10px] text-stone-400"><Clock className="w-3 h-3" />{(result.elapsed / 1000).toFixed(1)}s</span>
                  )}
                  {result?.chars != null && <span className="text-[10px] text-stone-400">· {result.chars} prompt chars</span>}
                </div>
                {generating ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-2 text-stone-400">
                    <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                    <span className="text-xs">Generating…</span>
                  </div>
                ) : result?.error ? (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> <span className="break-words">{result.error}</span>
                  </div>
                ) : result?.image ? (
                  <img src={result.image} alt="Generated sample" className="w-full rounded-xl border border-stone-200" />
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 gap-2 text-stone-300">
                    <ImageIcon className="w-8 h-8" />
                    <span className="text-xs">Generate a sample to preview these settings</span>
                  </div>
                )}
              </div>

              {/* History */}
              <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
                <button onClick={() => setShowHistory(s => !s)} className="w-full flex items-center gap-2 p-3 hover:bg-stone-50 text-left">
                  <History className="w-4 h-4 text-stone-400" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Saved configurations ({history.length})</span>
                </button>
                {showHistory && (
                  <div className="px-3 pb-3 space-y-2 max-h-64 overflow-y-auto">
                    {history.map(h => (
                      <button key={h.id} onClick={() => setCfg(h)}
                        className={`w-full text-left p-2.5 rounded-lg border text-[11px] transition-colors ${h.is_active ? "border-green-300 bg-green-50" : "border-stone-200 hover:border-purple-200"}`}>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-stone-700">{h.label || `Config #${h.id}`}</span>
                          {h.is_active && <span className="text-[9px] uppercase font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded">Active</span>}
                        </div>
                        <div className="text-stone-400 mt-0.5">{h.model.split("/").pop()} · {h.width}×{h.height} · {h.created_at?.slice(0, 10)}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
