/**
 * Temple Discovery Cron
 *
 * Runs hourly to discover new under-construction ISKCON temples via Firecrawl.
 * Stores results directly in Supabase so the frontend picks them up without deployment.
 *
 * Priority: India first, then worldwide (handled by search query rotation).
 */

import cron from "node-cron";
import { logger } from "../lib/logger";
import { discoverTemples, seedExistingTemples, getTempleCount } from "../services/temple-discovery";

const FLOCK_WEBHOOK = "https://api.flock.com/hooks/sendMessage/b0159996-49f3-4f23-8d6b-bcd96dd2c316";

// Every 10 minutes (offset to avoid overlap with Bhagwatham crons)
const DISCOVERY_INTERVAL = "2,12,22,32,42,52 * * * *";

let isRunning = false;
let hasSeeded = false;

async function sendFlock(message: string) {
  try {
    await fetch(FLOCK_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });
  } catch { /* ignore */ }
}

async function ensureSeeded() {
  if (hasSeeded) return;

  const count = await getTempleCount();
  if (count > 0) {
    hasSeeded = true;
    logger.info({ existingCount: count }, "Supabase already has temples — skipping seed");
    return;
  }

  // Seed temples by reading the frontend data file as text and extracting the array
  try {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(__dirname, "..", "..", "..", "..", "artifacts", "temple-tracker", "src", "data", "temples.ts");
    const content = fs.readFileSync(filePath, "utf-8");

    // Extract temple objects using regex — each starts with { id: N, ...
    const templeBlocks = content.match(/\{\s*id:\s*\d+[\s\S]*?longitude:\s*[\d.\-]+(?:\s*\|\s*null)?,?\s*\}/g);
    if (!templeBlocks) throw new Error("No temple data found in temples.ts");

    const temples = templeBlocks.map((block) => {
      const get = (key: string) => {
        const m = block.match(new RegExp(`${key}:\\s*"([^"]*)"`) );
        return m ? m[1] : "";
      };
      const getNum = (key: string) => {
        const m = block.match(new RegExp(`${key}:\\s*([\\.\\d_]+)`));
        return m ? parseFloat(m[1].replace(/_/g, "")) : 0;
      };
      return {
        id: getNum("id"),
        name: get("name"),
        location: get("location"),
        deity: get("deity"),
        description: get("description"),
        status: get("status"),
        phase: get("phase"),
        constructionProgress: getNum("constructionProgress"),
        fundraisingGoal: getNum("fundraisingGoal"),
        fundraisingRaised: getNum("fundraisingRaised"),
        startDate: get("startDate"),
        expectedCompletion: get("expectedCompletion"),
        projectLead: get("projectLead"),
        coverImage: null as string | null,
        donateUrl: get("donateUrl") || null,
        latitude: getNum("latitude") || null,
        longitude: block.includes("longitude: -") ? -getNum("longitude") : getNum("longitude") || null,
      };
    });

    const result = await seedExistingTemples(temples);
    hasSeeded = true;
    logger.info(result, "Seeded existing temples to Supabase");
    await sendFlock(`🏛️ Seeded ${result.seeded} existing ISKCON temples to Supabase`);
  } catch (err) {
    logger.error({ err }, "Failed to seed temples — will retry next tick");
  }
}

async function discoveryTick() {
  if (isRunning) {
    logger.info("Temple discovery already running — skipping");
    return;
  }
  isRunning = true;

  try {
    // Ensure existing temples are seeded on first run
    await ensureSeeded();

    // Run discovery
    const result = await discoverTemples();

    if (result.inserted > 0) {
      logger.info(result, "Temple discovery: new temples found!");
      await sendFlock(
        `🏛️ Temple Discovery: Found ${result.found} temples from "${result.searched}"\n` +
        `✅ ${result.inserted} new, 🔄 ${result.updated} updated, ⏭️ ${result.skipped} skipped`,
      );
    } else {
      logger.info(result, "Temple discovery: no new temples this tick");
    }
  } catch (err: any) {
    logger.error({ err: err?.message }, "Temple discovery cron failed");
    await sendFlock(`❌ Temple Discovery failed: ${err?.message}`);
  } finally {
    isRunning = false;
  }
}

export function startTempleDiscoveryCron(): void {
  logger.info(
    { interval: DISCOVERY_INTERVAL },
    "Temple discovery cron started (every 10 minutes)",
  );

  cron.schedule(DISCOVERY_INTERVAL, discoveryTick);
}

// Export for manual trigger via API
export { discoveryTick as runTempleDiscovery };
