import dotenv from "dotenv";
import path from "path";
import { REPO_ROOT } from "./lib/repo-root";

// Load .env BEFORE anything else — override: true ensures .env values win
// even if the parent process sets empty env vars (e.g. ANTHROPIC_API_KEY="")
dotenv.config({ path: path.join(REPO_ROOT, ".env"), override: true });

import { createApp } from "./app";
import { logger } from "./lib/logger";

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

async function main() {
  const app = await createApp();

  // Bind explicitly: default to loopback so the server isn't exposed to the
  // LAN by accident. Set HOST=0.0.0.0 to deliberately restore LAN access.
  const host = process.env.HOST || "127.0.0.1";

  app.listen(port, host, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port, host }, "Server listening");
  });
}

main().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
