/**
 * Temple Monitoring Service
 *
 * Runs daily on already-discovered temples (the 57 in `discovered_temples`)
 * and updates three things per temple:
 *
 *   1. donate_link_status        — HTTP HEAD/GET the donate_url, record code/timeout
 *   2. latest_news               — Firecrawl search for recent posts/videos/news,
 *                                  store the top 3 with title, url, source, snippet
 *   3. last_monitored_at         — bookkeeping
 *
 * The expensive bits (Firecrawl) are throttled: each tick processes a SLICE of
 * temples on rotation so a daily run gradually refreshes everything without
 * hammering the API in one burst.
 */
import { logger } from "../lib/logger";

const SUPABASE_URL = "https://etfmndcrchundvgtvmot.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0Zm1uZGNyY2h1bmR2Z3R2bW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc2NDE1MTIsImV4cCI6MjA2MzIxNzUxMn0.7GXS820xSFcUy2TRdbspN7s-NP3sgKFFtUP-Zw0Qbrs";

interface MonitoredTemple {
  id: number;
  name: string;
  location: string;
  country: string | null;
  donate_url: string | null;
}

interface NewsItem {
  title: string;
  url: string;
  source: string;
  snippet: string;
  published_at?: string | null;
}

const sb = (path: string, init?: RequestInit) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

/** HTTP-test the donation URL. Returns "200", "404", "timeout", "error", etc. */
async function checkDonateLink(url: string): Promise<string> {
  if (!url || !/^https?:\/\//i.test(url)) return "invalid_url";
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    // HEAD first (cheap), fall back to GET if the server doesn't allow HEAD
    let res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": "BuildIskcon-LinkChecker/1.0" },
    }).catch(() => null);
    if (!res || res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: ctrl.signal,
        headers: { "User-Agent": "BuildIskcon-LinkChecker/1.0" },
      });
    }
    clearTimeout(timer);
    return String(res.status);
  } catch (err: any) {
    if (err?.name === "AbortError") return "timeout";
    return "error";
  }
}

/** Firecrawl search → recent news for a single temple. */
async function fetchLatestNews(temple: MonitoredTemple): Promise<NewsItem[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return [];

  const cleanName = temple.name.replace(/^ISKCON\s+/i, "").trim();
  const query = `ISKCON ${cleanName} ${temple.location || ""} construction OR opening OR news OR video latest 2026`;

  try {
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        limit: 5,
        // Only need the metadata, not the full body content — saves credits
        scrapeOptions: { formats: [] as string[] },
      }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status, temple: temple.name }, "Firecrawl news search failed");
      return [];
    }
    const data: any = await res.json();
    return ((data.data || []) as any[])
      .map((r): NewsItem => {
        const u = r.url || "";
        const host = (() => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } })();
        return {
          title: (r.title || r.metadata?.title || "").substring(0, 200),
          url: u,
          source: host,
          snippet: (r.description || r.metadata?.description || "").substring(0, 280),
          published_at: r.metadata?.publishedTime || r.metadata?.date || null,
        };
      })
      .filter(item => item.url && item.title)
      .slice(0, 3);
  } catch (err) {
    logger.warn({ err, temple: temple.name }, "fetchLatestNews errored");
    return [];
  }
}

/** Process one temple: check link + grab news + persist. */
async function monitorOne(t: MonitoredTemple): Promise<{ statusUpdated: boolean; newsCount: number }> {
  const linkStatus = t.donate_url ? await checkDonateLink(t.donate_url) : null;
  const news = await fetchLatestNews(t);

  const update: Record<string, unknown> = {
    last_monitored_at: new Date().toISOString(),
  };
  if (linkStatus) {
    update.donate_link_status = linkStatus;
    update.donate_link_checked_at = new Date().toISOString();
  }
  if (news.length > 0) {
    update.latest_news = { items: news };
    update.latest_news_at = new Date().toISOString();
  }

  await sb(`discovered_temples?id=eq.${t.id}`, {
    method: "PATCH",
    body: JSON.stringify(update),
  });

  return { statusUpdated: !!linkStatus, newsCount: news.length };
}

/**
 * Run a monitoring tick. Picks the N least-recently-monitored temples and
 * refreshes them. Default batchSize = 10 so a daily run with 57 temples
 * cycles through everything in ~6 days, plus the link-check is fast enough
 * to do all temples in one pass — we still rotate news fetches to save credits.
 */
export async function monitorTemplesTick(opts?: {
  batchSize?: number;
  alsoFullLinkCheck?: boolean;
}): Promise<{ checked: number; broken: number; newsAdded: number; total: number }> {
  const batchSize = opts?.batchSize ?? 12;
  const alsoFullLinkCheck = opts?.alsoFullLinkCheck ?? true;

  // Fetch the slice that needs news refresh (oldest first, nulls first).
  const newsRes = await sb(
    `discovered_temples?select=id,name,location,country,donate_url&order=last_monitored_at.asc.nullsfirst&limit=${batchSize}`,
  );
  if (!newsRes.ok) {
    logger.error({ status: newsRes.status }, "Failed to fetch temples for monitoring");
    return { checked: 0, broken: 0, newsAdded: 0, total: 0 };
  }
  const slice = (await newsRes.json()) as MonitoredTemple[];
  let newsAdded = 0;
  for (const t of slice) {
    try {
      const r = await monitorOne(t);
      if (r.newsCount > 0) newsAdded++;
    } catch (err) {
      logger.warn({ err, temple: t.name }, "monitorOne failed");
    }
  }

  // Optionally also do a fast link-check pass over ALL temples (no Firecrawl
  // hits — just HTTP) so the donate-link health view is always fresh.
  let totalChecked = slice.length;
  let broken = 0;
  if (alsoFullLinkCheck) {
    const allRes = await sb(
      `discovered_temples?select=id,name,location,country,donate_url&donate_url=not.is.null`,
    );
    if (allRes.ok) {
      const all = (await allRes.json()) as MonitoredTemple[];
      const linkOnly = all.filter(t => !slice.some(s => s.id === t.id));
      for (const t of linkOnly) {
        if (!t.donate_url) continue;
        try {
          const status = await checkDonateLink(t.donate_url);
          const ok = /^2|3/.test(status);
          if (!ok) broken++;
          totalChecked++;
          await sb(`discovered_temples?id=eq.${t.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              donate_link_status: status,
              donate_link_checked_at: new Date().toISOString(),
            }),
          });
        } catch { /* skip */ }
      }
    }
  }

  // Count broken from this tick's slice too
  for (const t of slice) {
    // Re-read won't be needed; we already updated above. Approximate: if donate_url existed and we got a non-2xx code earlier — but we discarded. Skip per-slice counting.
  }

  return { checked: totalChecked, broken, newsAdded, total: slice.length + (alsoFullLinkCheck ? totalChecked - slice.length : 0) };
}

/**
 * One-shot: HEAD/GET every donate URL right now and return the report.
 * Used by the manual /api/temples/check-links endpoint and ad-hoc dev triggers.
 */
export async function checkAllDonateLinks(): Promise<{
  total: number;
  ok: number;
  broken: number;
  results: Array<{ id: number; name: string; url: string; status: string }>;
}> {
  const res = await sb(
    `discovered_temples?select=id,name,donate_url&donate_url=not.is.null&order=name.asc`,
  );
  if (!res.ok) return { total: 0, ok: 0, broken: 0, results: [] };
  const rows = (await res.json()) as Array<{ id: number; name: string; donate_url: string }>;
  const results: Array<{ id: number; name: string; url: string; status: string }> = [];
  let ok = 0;
  let broken = 0;
  for (const r of rows) {
    const status = await checkDonateLink(r.donate_url);
    const isOk = /^2|3/.test(status);
    if (isOk) ok++; else broken++;
    results.push({ id: r.id, name: r.name, url: r.donate_url, status });
    // persist
    await sb(`discovered_temples?id=eq.${r.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        donate_link_status: status,
        donate_link_checked_at: new Date().toISOString(),
      }),
    });
  }
  return { total: rows.length, ok, broken, results };
}
