import app from "./app";
import { logger } from "./lib/logger";
import cron from "node-cron";
import { runTempleSync } from "./services/temple-research";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  cron.schedule("0 * * * *", async () => {
    const fireTime = new Date().toISOString();
    logger.info({ fireTime }, "Scheduled hourly sync starting — updating temples + social hub posts");
    try {
      const result = await runTempleSync();
      logger.info(
        {
          ...result,
          socialPostsCreated: result.updatesCreated,
          fireTime,
        },
        "Scheduled sync completed — social hub posts written to DB"
      );
    } catch (err) {
      logger.error({ err }, "Scheduled sync failed");
    }
  });

  logger.info("Cron job scheduled: temple data sync + social hub posts — fires every hour (0 * * * *)");
});
