import express from "express";
import { config } from "./config/env.js";
import { createBot } from "./bot/register.js";

const app = express();
app.get("/health", (_req, res) => res.json({ status: "ok", phase: "interface" }));

const bot = createBot();
app.listen(config.port, () => {
  console.log(`Health server listening on port ${config.port}`);
});

bot.launch().then(() => console.log("Telegram bot started in polling mode."));
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
