import express from "express";
import { config } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./database/connection.js";
import { createBot } from "./bot/register.js";
import {
  isValidPaystackSignature,
  processPaystackWebhook,
} from "./modules/payments/service.js";
import { seedPlans } from "./modules/subscriptions/service.js";
import { restorePersonalMonitoring } from "./modules/telegram/connection-service.js";

const start = async () => {
  await connectDatabase();
  await seedPlans();
  await restorePersonalMonitoring();

  const app = express();
  app.post(
    "/payments/webhook",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      const signature = req.get("x-paystack-signature");
      if (!isValidPaystackSignature(req.body, signature)) {
        res.status(401).json({ error: "Invalid webhook signature" });
        return;
      }
      try {
        await processPaystackWebhook(JSON.parse(req.body.toString("utf8")));
        res.sendStatus(200);
      } catch (error) {
        console.error("Paystack webhook processing failed:", error.message);
        res.status(500).json({ error: "Webhook processing failed" });
      }
    },
  );
  app.use(express.json());
  app.get("/payments/callback", (_req, res) =>
    res.send(
      "Payment received. Subscription activation follows verified Paystack processing.",
    ),
  );
  app.get("/health", (_req, res) =>
    res.json({ status: "ok", phase: "premium-telegram" }),
  );

  const bot = createBot();
  app.listen(config.port, () => {
    console.log(`Bot server listening on port ${config.port}`);
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
