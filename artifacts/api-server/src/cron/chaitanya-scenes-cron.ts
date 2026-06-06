import cron from "node-cron";
import { extractNextChaitanyaScenes } from "../services/chaitanya-scenes";
import { logger } from "../lib/logger";

// Every 15 minutes — extract scenes for whatever new OCR has finished.
// Hard cap of 3 chapters per tick so even if many chapters become ready
// simultaneously we don't burst the Anthropic API.
const CHAITANYA_SCENES_INTERVAL = "*/15 * * * *";

export function startChaitanyaScenesCron(): void {
  logger.info({ interval: CHAITANYA_SCENES_INTERVAL }, "Chaitanya scenes cron started");

  cron.schedule(CHAITANYA_SCENES_INTERVAL, async () => {
    try {
      const r = await extractNextChaitanyaScenes(3);
      if (r.processed > 0) {
        logger.info({ result: r }, "Chaitanya scenes cron: tick complete");
      }
    } catch (err) {
      logger.error({ err }, "Chaitanya scenes cron failed unexpectedly");
    }
  });
}
