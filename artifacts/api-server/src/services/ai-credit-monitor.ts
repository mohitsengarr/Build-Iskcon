import { logger } from "../lib/logger";

const FLOCK_WEBHOOK = "https://api.flock.com/hooks/sendMessage/b0159996-49f3-4f23-8d6b-bcd96dd2c316";

// ── Track API failures that indicate credit exhaustion ─────────────────────

type CreditState = "ok" | "low" | "rate_limited" | "exhausted" | "unknown";

interface CreditStatus {
  platform: string;
  status: CreditState;
  balance?: number;
  lastChecked: string;
  lastError?: string;
}

const creditStatuses: Map<string, CreditStatus> = new Map();

// C7: ONE canonical key per platform, used by ALL reads and writes. Previously
// reportAIFailure("Sarvam AI") stored under "sarvam_ai" while the health check
// read "sarvam" — reported failures were invisible to the health endpoint.
export function keyFor(platform: string): string {
  const norm = platform.toLowerCase();
  if (norm.includes("together")) return "together";
  if (norm.includes("sarvam")) return "sarvam";
  if (norm.includes("anthropic") || norm.includes("claude")) return "anthropic";
  if (norm.includes("perplexity")) return "perplexity";
  return norm.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

// Severity ordering for merge decisions (higher = worse)
const SEVERITY: Record<CreditState, number> = {
  exhausted: 4,
  rate_limited: 3,
  low: 2,
  unknown: 1,
  ok: 0,
};

// A reported failure stays authoritative over a passive "ok" probe for 24h
const REPORTED_STATUS_TTL_MS = 24 * 60 * 60 * 1000;

// Cooldown: don't spam Flock — at most one alert per platform per hour
const alertCooldowns: Map<string, number> = new Map();
const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

async function sendFlockAlert(message: string) {
  try {
    await fetch(FLOCK_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });
    logger.info({ message }, "Flock alert sent");
  } catch (err) {
    logger.error({ err }, "Failed to send Flock alert");
  }
}

function shouldAlert(platform: string): boolean {
  const lastAlert = alertCooldowns.get(platform) || 0;
  if (Date.now() - lastAlert < COOLDOWN_MS) return false;
  alertCooldowns.set(platform, Date.now());
  return true;
}

// ── Together AI — no balance API, monitor via error detection ──────────────

async function checkTogetherHealth(): Promise<CreditStatus> {
  const apiKey = process.env.TOGETHER_API_KEY;
  if (!apiKey) return { platform: "Together AI", status: "unknown", lastChecked: new Date().toISOString(), lastError: "No API key" };

  try {
    // Just check if the API responds (list models endpoint is free)
    const res = await fetch("https://api.together.xyz/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.status === 401 || res.status === 403) {
      const status: CreditStatus = { platform: "Together AI", status: "exhausted", lastChecked: new Date().toISOString(), lastError: `Auth error: ${res.status}` };
      if (shouldAlert("together")) {
        await sendFlockAlert(`🚨 *Together AI API Error*\nHTTP ${res.status} — API key may be invalid or credits exhausted.\nImage generation with FLUX.2 will fail.`);
      }
      return status;
    }
    return { platform: "Together AI", status: "ok", lastChecked: new Date().toISOString() };
  } catch (err: any) {
    return { platform: "Together AI", status: "unknown", lastChecked: new Date().toISOString(), lastError: err?.message };
  }
}

// ── Sarvam AI — no balance API, monitor via error detection ────────────────

async function checkSarvamHealth(): Promise<CreditStatus> {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) return { platform: "Sarvam AI", status: "unknown", lastChecked: new Date().toISOString(), lastError: "No API key" };

  // Sarvam doesn't have a health/balance endpoint — we track failures from OCR/translate calls
  const existing = creditStatuses.get(keyFor("Sarvam AI"));
  return existing || { platform: "Sarvam AI", status: "ok", lastChecked: new Date().toISOString() };
}

// ── Anthropic — no simple balance API ──────────────────────────────────────

async function checkAnthropicHealth(): Promise<CreditStatus> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { platform: "Anthropic (Claude)", status: "unknown", lastChecked: new Date().toISOString(), lastError: "No API key" };

  const existing = creditStatuses.get(keyFor("Anthropic (Claude)"));
  return existing || { platform: "Anthropic (Claude)", status: "ok", lastChecked: new Date().toISOString() };
}

// ── Perplexity AI — no balance API ─────────────────────────────────────────

async function checkPerplexityHealth(): Promise<CreditStatus> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return { platform: "Perplexity AI", status: "unknown", lastChecked: new Date().toISOString(), lastError: "No API key" };

  const existing = creditStatuses.get(keyFor("Perplexity AI"));
  return existing || { platform: "Perplexity AI", status: "ok", lastChecked: new Date().toISOString() };
}

// ── Public API for reporting failures from other services ──────────────────

/**
 * Call this from any service when an AI API call fails with a credits/quota error.
 * It will update the status and send a Flock notification.
 */
export async function reportAIFailure(platform: string, errorMessage: string) {
  // C7: distinguish transient rate limiting (429 / "rate limit") from actual
  // credit/quota exhaustion — they need different operator responses.
  const isExhausted = /insufficient.*credits|quota.*exceeded|\b402\b|payment.*required|credit|billing/i.test(errorMessage);
  const isRateLimited = !isExhausted && /rate.?limit|too.?many.?requests|\b429\b/i.test(errorMessage);

  const status: CreditStatus = {
    platform,
    status: isExhausted ? "exhausted" : isRateLimited ? "rate_limited" : "unknown",
    lastChecked: new Date().toISOString(),
    lastError: errorMessage,
  };

  const key = keyFor(platform);
  creditStatuses.set(key, status);

  if (isExhausted && shouldAlert(key)) {
    await sendFlockAlert(`🚨 *${platform} Credits Issue*\nError: ${errorMessage}\nService may be degraded.`);
  } else if (isRateLimited && shouldAlert(key)) {
    await sendFlockAlert(`⏳ *${platform} Rate Limited*\nError: ${errorMessage}\nRequests are being throttled — should recover on its own.`);
  }

  logger.warn({ platform, errorMessage, status: status.status }, "AI platform failure reported");
}

// ── Run all checks ─────────────────────────────────────────────────────────

export async function checkAllCredits(): Promise<CreditStatus[]> {
  const results = await Promise.all([
    checkTogetherHealth(),
    checkSarvamHealth(),
    checkAnthropicHealth(),
    checkPerplexityHealth(),
  ]);

  // C7: MERGE instead of overwrite — a passive "ok"/"unknown" probe must not
  // wipe out a more-severe status reported by a real failed call within the
  // last 24h (these platforms have no balance API, so reported failures are
  // the only real signal we have).
  const merged: CreditStatus[] = [];
  for (const r of results) {
    const key = keyFor(r.platform);
    const existing = creditStatuses.get(key);
    const existingAgeMs = existing
      ? Date.now() - new Date(existing.lastChecked).getTime()
      : Number.POSITIVE_INFINITY;

    if (
      existing &&
      existingAgeMs < REPORTED_STATUS_TTL_MS &&
      SEVERITY[existing.status] > SEVERITY[r.status]
    ) {
      merged.push(existing); // keep the more-severe recent status
      continue;
    }

    creditStatuses.set(key, r);
    merged.push(r);
  }

  return merged;
}

export function getCreditStatuses(): CreditStatus[] {
  return Array.from(creditStatuses.values());
}
