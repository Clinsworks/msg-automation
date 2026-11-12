import express from "express";
import { config } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./database/connection.js";
import { createBot } from "./bot/register.js";
import { createQueueRuntime } from "./modules/campaigns/queue.js";
import { createCampaignWorker } from "./modules/campaigns/worker.js";

const start = async () => {
  await connectDatabase();
  const queueRuntime = await createQueueRuntime();

  const app = express();
  app.get("/health", (_req, res) =>
    res.json({ status: "ok", phase: "background-jobs" }),
  );

  const bot = createBot({ queue: queueRuntime.campaignQueue });
  const worker = createCampaignWorker({
    connection: queueRuntime.connection,
    queue: queueRuntime.campaignQueue,
    telegram: bot.telegram,
  });
  app.listen(config.port, () => {
    console.log(`Bot server listening on port ${config.port}`);
  });

  await bot.launch();
  console.log("Telegram bot started in polling mode.");

  const shutdown = async (signal) => {
    bot.stop(signal);
    await worker.close();
    await queueRuntime.close();
    await disconnectDatabase();
    process.exit(0);
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
};

start().catch((error) => {
  console.error("Application startup failed:", error.message);
  process.exitCode = 1;
});
