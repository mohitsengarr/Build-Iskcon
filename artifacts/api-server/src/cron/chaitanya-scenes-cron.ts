import cron from "node-cron";
import { extractNextChaitanyaScenes } from "../services/chaitanya-scenes";
import { logger } from "../lib/logger";

// Every 15 minutes — extract scenes for whatever new OCR has finished.
// Hard cap of 3 chapters per tick so even if many chapters become ready
// simultaneously we don't burst the Anthropic API.
//
// Gated to the same Dubai 11am-4am window as the OCR cron so we don't burn
// Anthropic credits during the user's quiet hours either.
const CHAITANYA_SCENES_INTERVAL = "*/15 11-23,0-3 * * *";
const CHAITANYA_TZ = "Asia/Dubai";

export function startChaitanyaScenesCron(): void {
  logger.info({ interval: CHAITANYA_SCENES_INTERVAL, tz: CHAITANYA_TZ }, "Chaitanya scenes cron started (Dubai 11am-4am only)");

  cron.schedule(CHAITANYA_SCENES_INTERVAL, async () => {
    try {
      const r = await extractNextChaitanyaScenes(3);
      if (r.processed > 0) {
        logger.info({ result: r }, "Chaitanya scenes cron: tick complete");
      }
    } catch (err) {
      logger.error({ err }, "Chaitanya scenes cron failed unexpectedly");
    }
  }, { timezone: CHAITANYA_TZ });
}
