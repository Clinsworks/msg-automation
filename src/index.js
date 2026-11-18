import express from "express";
import { config, validateEnvironmentUrls } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./database/connection.js";
import { createBot } from "./bot/register.js";
import {
  isValidPaystackSignature,
  processPaystackWebhook,
} from "./modules/payments/service.js";
import { seedPlans } from "./modules/subscriptions/service.js";
import { restorePersonalMonitoring } from "./modules/telegram/connection-service.js";
import { submitTwoFactorPassword } from "./modules/telegram/connection-service.js";

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const twoFactorPage = ({ token, message = "" }) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Telegram verification</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none';">
<style>body{font-family:system-ui,sans-serif;max-width:30rem;margin:4rem auto;padding:0 1rem;background:#f5f7fb;color:#172033}main{background:white;padding:2rem;border-radius:1rem;box-shadow:0 8px 30px #1720331a}input,button{box-sizing:border-box;width:100%;padding:.8rem;margin-top:.5rem;border:1px solid #bbc5d6;border-radius:.5rem;font-size:1rem}button{background:#229ed9;color:white;border:0;cursor:pointer}small{color:#596579}p{line-height:1.5}.error{color:#b42318}</style>
</head><body><main><h1>Telegram verification</h1><p>Enter your Telegram two-step verification password to finish linking your account.</p><p><small>This password is used only for this login attempt and is not stored.</small></p>${message ? `<p class="error">${escapeHtml(message)}</p>` : ""}
<form method="post"><label for="password">2FA password</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="256"><button type="submit">Complete connection</button></form></main></body></html>`;

const start = async () => {
  validateEnvironmentUrls();
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
  app.use(express.urlencoded({ extended: false }));
  app.get("/telegram/2fa/:token", (req, res) => {
    res.set({
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none';",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
    res.send(twoFactorPage({ token: req.params.token }));
  });
  app.post("/telegram/2fa/:token", (req, res) => {
    const accepted = submitTwoFactorPassword(req.params.token, req.body.password);
    res.set({
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none';",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
    if (!accepted) {
      res.status(410).send(twoFactorPage({ token: req.params.token, message: "This verification link is invalid or expired. Start a new Telegram connection from the bot." }));
      return;
    }
    res.send("<!doctype html><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Connection submitted</title><p>Verification submitted. Return to Telegram for the connection result.</p>");
  });
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
