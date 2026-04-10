import { logger } from "../lib/logger";

const FLOCK_WEBHOOK = "https://api.flock.com/hooks/sendMessage/b0159996-49f3-4f23-8d6b-bcd96dd2c316";

// ── Track API failures that indicate credit exhaustion ─────────────────────

interface CreditStatus {
  platform: string;
  status: "ok" | "low" | "exhausted" | "unknown";
  balance?: number;
  lastChecked: string;
  lastError?: string;
}

const creditStatuses: Map<string, CreditStatus> = new Map();

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
  const existing = creditStatuses.get("sarvam");
  return existing || { platform: "Sarvam AI", status: "ok", lastChecked: new Date().toISOString() };
}

// ── Anthropic — no simple balance API ──────────────────────────────────────

async function checkAnthropicHealth(): Promise<CreditStatus> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { platform: "Anthropic (Claude)", status: "unknown", lastChecked: new Date().toISOString(), lastError: "No API key" };

  const existing = creditStatuses.get("anthropic");
  return existing || { platform: "Anthropic (Claude)", status: "ok", lastChecked: new Date().toISOString() };
}

// ── Perplexity AI — no balance API ─────────────────────────────────────────

async function checkPerplexityHealth(): Promise<CreditStatus> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return { platform: "Perplexity AI", status: "unknown", lastChecked: new Date().toISOString(), lastError: "No API key" };

  const existing = creditStatuses.get("perplexity");
  return existing || { platform: "Perplexity AI", status: "ok", lastChecked: new Date().toISOString() };
}

// ── Public API for reporting failures from other services ──────────────────

/**
 * Call this from any service when an AI API call fails with a credits/quota error.
 * It will update the status and send a Flock notification.
 */
export async function reportAIFailure(platform: string, errorMessage: string) {
  const isCreditsError = /insufficient.*credits|quota.*exceeded|rate.*limit|402|429|payment.*required|credit/i.test(errorMessage);

  const status: CreditStatus = {
    platform,
    status: isCreditsError ? "exhausted" : "unknown",
    lastChecked: new Date().toISOString(),
    lastError: errorMessage,
  };

  const key = platform.toLowerCase().replace(/\s+/g, "_");
  creditStatuses.set(key, status);

  if (isCreditsError && shouldAlert(key)) {
    await sendFlockAlert(`🚨 *${platform} Credits Issue*\nError: ${errorMessage}\nService may be degraded.`);
  }

  logger.warn({ platform, errorMessage, isCreditsError }, "AI platform failure reported");
}

// ── Run all checks ─────────────────────────────────────────────────────────

export async function checkAllCredits(): Promise<CreditStatus[]> {
  const results = await Promise.all([
    checkTogetherHealth(),
    checkSarvamHealth(),
    checkAnthropicHealth(),
    checkPerplexityHealth(),
  ]);

  // Update stored statuses
  for (const r of results) {
    const key = r.platform.toLowerCase().replace(/[^a-z]/g, "_");
    creditStatuses.set(key, r);
  }

  return results;
}

export function getCreditStatuses(): CreditStatus[] {
  return Array.from(creditStatuses.values());
}
