import express from "express";
import { config } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./database/connection.js";
import { createBot } from "./bot/register.js";

const start = async () => {
  await connectDatabase();

  const app = express();
  app.get("/health", (_req, res) => res.json({ status: "ok", phase: "database-and-users" }));

  const bot = createBot();
  app.listen(config.port, () => {
    console.log(`Health server listening on port ${config.port}`);
  });

  await bot.launch();
  console.log("Telegram bot started in polling mode.");

  const shutdown = async (signal) => {
    bot.stop(signal);
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
