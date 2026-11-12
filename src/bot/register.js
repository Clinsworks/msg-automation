import { Telegraf } from "telegraf";
import { config } from "../config/env.js";
import { cancelCampaign, chooseDelivery, handleCampaignText, saveDraft, scheduleCampaign, selectMethod, selectRecipients, sendCampaign, showDelivery, showPreview, startCampaign } from "./campaign-flow.js";
import { campaignMethodKeyboard, campaignRecipientsKeyboard, mainMenuKeyboard } from "./keyboards.js";
import { audiences, analytics, campaigns, campaignList, dashboard, help, mainMenu, paymentHistory, scheduled, settings, subscription, subscriptionPlans, templates } from "./views.js";
import { loadConversationState, saveConversationState } from "../modules/conversation-state/service.js";
import { ensureUserWorkspace } from "../modules/users/service.js";
import { listRecipients, registerRecipient, removeRecipient } from "../modules/recipients/service.js";
import { TelegramBotProvider } from "../modules/messaging/providers/telegram-bot-provider.js";
import { initializePayment } from "../modules/payments/service.js";
import { updateUserEmail } from "../modules/users/service.js";
import { getActivePlans } from "../modules/subscriptions/service.js";
import { canAccessFeature } from "../modules/subscriptions/service.js";
import { beginConnection, completeConnection, disconnectPersonalAccount } from "../modules/telegram/connection-service.js";

const render = async (ctx, view, viewArgument = ctx.from) => {
  const { text, keyboard } = await view(viewArgument);
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", ...keyboard });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", ...keyboard });
  }
};

const runCampaignAction = (action) => async (ctx) => {
  try {
    await action(ctx);
  } catch (error) {
    console.error("Campaign action failed:", error);
    await ctx.answerCbQuery("Campaign action failed");
    await ctx.reply(`Unable to complete that campaign action: ${error.message}`);
  }
};

export const createBot = () => {
  if (!config.botToken) throw new Error("BOT_TOKEN is required to start the Telegram bot");
  const bot = new Telegraf(config.botToken);
  const provider = new TelegramBotProvider(bot.telegram);
  bot.use(async (ctx, next) => {
    if (!ctx.from) return next();
    const workspace = await ensureUserWorkspace(ctx.from);
    ctx.dbUser = workspace.user;
    ctx.business = workspace.business;
    ctx.session = await loadConversationState(ctx.from.id);
    await next();
    await saveConversationState(ctx.from.id, ctx.session);
  });

  bot.start((ctx) => render(ctx, mainMenu));
  bot.command("menu", (ctx) => render(ctx, mainMenu));
  bot.command("help", (ctx) => render(ctx, help));
  bot.command("setemail", async (ctx) => {
    const email = ctx.message.text.split(/\s+/)[1];
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await ctx.reply("Usage: /setemail <billing_email>");
      return;
    }
    ctx.dbUser = await updateUserEmail(ctx.dbUser._id, email);
    await ctx.reply("Billing email saved securely.");
  });
  bot.command("connecttelegram", async (ctx) => {
    const phoneNumber = ctx.message.text.split(/\s+/)[1];
    if (!phoneNumber) {
      await ctx.reply("Usage: /connecttelegram +2348012345678");
      return;
    }
    try {
      if (!(await canAccessFeature(ctx.business._id, "personal_telegram"))) {
        await ctx.reply("An active Pro subscription is required before connecting a personal Telegram account.");
        return;
      }
      await beginConnection({ businessId: ctx.business._id, phoneNumber });
      ctx.session.telegramAuth = { step: "code" };
      await ctx.reply("Telegram sent a verification code. Reply with /telegramcode <code>. Never share this code with anyone.");
    } catch (error) {
      await ctx.reply(`Unable to start Telegram connection: ${error.message}`);
    }
  });
  bot.command("telegramcode", async (ctx) => {
    const code = ctx.message.text.split(/\s+/)[1];
    if (!code) {
      await ctx.reply("Usage: /telegramcode <verification_code>");
      return;
    }
    try {
      const account = await completeConnection({ businessId: ctx.business._id, phoneCode: code });
      delete ctx.session.telegramAuth;
      await ctx.reply(`Personal Telegram account connected: @${account.username || "account"}`);
    } catch (error) {
      await ctx.reply(`Unable to complete Telegram connection: ${error.message}`);
    }
  });
  bot.command("disconnecttelegram", async (ctx) => {
    await disconnectPersonalAccount(ctx.business._id);
    await ctx.reply("Personal Telegram account disconnected and its stored session was removed.");
  });
  bot.command("myid", (ctx) => ctx.reply(`Your Telegram user ID is ${ctx.from.id}.`));
  bot.command("addrecipient", async (ctx) => {
    const destinationId = ctx.message.text.split(/\s+/)[1];
    if (!destinationId) {
      await ctx.reply("Usage: /addrecipient <telegram_chat_id>");
      return;
    }
    try {
      const recipient = await registerRecipient({ businessId: ctx.business._id, destinationId, provider });
      await ctx.reply(`Recipient saved: ${recipient.displayName}\nType: ${recipient.destinationType}\nSending eligibility: ${recipient.sendingEligible ? "Eligible" : "Not eligible"}`);
    } catch (error) {
      if (error.code === "INELIGIBLE_DESTINATION") {
        await ctx.reply(error.message);
        return;
      }
      throw error;
    }
  });
  bot.command("recipients", async (ctx) => {
    const recipients = await listRecipients(ctx.business._id, { sendingEligible: true });
    const text = recipients.length
      ? recipients.map((recipient) => `• ${recipient.displayName} (${recipient.destinationType})`).join("\n")
      : "No eligible recipients have been added.";
    await ctx.reply(`<b>Eligible recipients</b>\n\n${text}`, { parse_mode: "HTML" });
  });
  bot.command("removerecipient", async (ctx) => {
    const destinationId = ctx.message.text.split(/\s+/)[1];
    if (!destinationId) {
      await ctx.reply("Usage: /removerecipient <telegram_chat_id>");
      return;
    }
    const recipient = await removeRecipient(ctx.business._id, destinationId);
    await ctx.reply(recipient ? "Recipient disabled for sending." : "Recipient was not found.");
  });
  bot.on("text", async (ctx, next) => {
    if (!(await handleCampaignText(ctx))) await next();
  });

  bot.action("nav:main", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, mainMenu); });
  bot.action("nav:dashboard", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, dashboard); });
  bot.action("nav:campaigns", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, campaigns); });
  bot.action("nav:audience", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, audiences); });
  bot.action("nav:scheduled", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, scheduled); });
  bot.action("nav:templates", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, templates); });
  bot.action("nav:analytics", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, analytics); });
  bot.action("nav:subscription", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, () => subscription(ctx), ctx); });
  bot.action("nav:settings", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, settings); });
  bot.action("nav:help", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, help); });
  bot.action("subscription:plans", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, subscriptionPlans); });
  bot.action("subscription:history", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, () => paymentHistory(ctx), ctx); });
  bot.action(/^subscription:buy:(.+)$/, async (ctx) => {
    try {
      const plans = await getActivePlans();
      const plan = plans.find((item) => String(item._id) === ctx.match[1]);
      if (!plan) throw new Error("Selected plan is no longer available.");
      const result = await initializePayment({
        businessId: ctx.business._id,
        userEmail: ctx.dbUser.email,
        planId: plan._id
      });
      await ctx.answerCbQuery("Checkout created");
      await ctx.editMessageText(`<b>${plan.name} checkout</b>\n\nAmount: ₦${plan.price.toLocaleString()}\n\nComplete payment securely here:\n${result.checkoutUrl}\n\nYour subscription activates only after Paystack verification.`, { parse_mode: "HTML", ...mainMenuKeyboard() });
    } catch (error) {
      await ctx.answerCbQuery("Unable to create checkout");
      await ctx.reply(error.message);
    }
  });

  bot.action("campaign:create", async (ctx) => { await ctx.answerCbQuery(); await startCampaign(ctx); });
  bot.action("campaign:list", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, () => campaignList(ctx), ctx); });
  for (const [label, status] of [["drafts", "draft"], ["active", "active"], ["scheduled", "scheduled"], ["completed", "completed"], ["failed", "failed"]]) {
    bot.action(`campaign:${label}`, async (ctx) => { await ctx.answerCbQuery(); await render(ctx, () => campaignList(ctx, status), ctx); });
  }
  bot.action("campaign:method:standard", async (ctx) => { await ctx.answerCbQuery(); await selectMethod(ctx, "Standard Bot"); });
  bot.action("campaign:method:premium", async (ctx) => {
    await ctx.answerCbQuery();
    if (!(await canAccessFeature(ctx.business._id, "personal_telegram"))) {
      await ctx.editMessageText("<b>Premium sending</b>\n\nAn active Pro subscription is required for personal Telegram sending.", { parse_mode: "HTML", ...mainMenuKeyboard() });
      return;
    }
    ctx.session.campaign.method = "Premium Personal Account";
    await ctx.editMessageText("<b>Premium sending</b>\n\nYour Pro entitlement is active. A connected personal Telegram account is required before sending.", { parse_mode: "HTML", ...campaignRecipientsKeyboard() });
  });
  bot.action("campaign:recipient:individual", async (ctx) => selectRecipients(ctx, "user"));
  bot.action("campaign:recipient:audience", async (ctx) => selectRecipients(ctx, "all"));
  bot.action("campaign:recipient:groups", async (ctx) => selectRecipients(ctx, "group"));
  bot.action("campaign:recipient:channels", async (ctx) => selectRecipients(ctx, "channel"));
  bot.action("campaign:recipient:all", async (ctx) => selectRecipients(ctx, "all"));
  bot.action("campaign:recipient:none", async (ctx) => selectRecipients(ctx, "none"));
  bot.action("campaign:delivery", async (ctx) => { await ctx.answerCbQuery(); await showDelivery(ctx); });
  bot.action("campaign:delivery:now", async (ctx) => { await ctx.answerCbQuery(); await chooseDelivery(ctx, "now"); });
  bot.action("campaign:delivery:schedule", async (ctx) => { await ctx.answerCbQuery(); await chooseDelivery(ctx, "schedule"); });
  bot.action("campaign:delivery:draft", async (ctx) => { await ctx.answerCbQuery(); await chooseDelivery(ctx, "draft"); });
  bot.action("campaign:confirm:send", runCampaignAction((ctx) => sendCampaign(ctx, provider)));
  bot.action("campaign:confirm:schedule", runCampaignAction(scheduleCampaign));
  bot.action("campaign:confirm:draft", runCampaignAction(saveDraft));
  bot.action("campaign:back:name", async (ctx) => { await ctx.answerCbQuery(); await ctx.editMessageText("Send a campaign name.", { parse_mode: "HTML" }); ctx.session.campaign.step = "name"; });
  bot.action("campaign:back:method", async (ctx) => { await ctx.answerCbQuery(); await ctx.editMessageText("Choose a sending method.", { parse_mode: "HTML", ...campaignMethodKeyboard() }); ctx.session.campaign.step = "method"; });
  bot.action("campaign:back:recipients", async (ctx) => { await ctx.answerCbQuery(); await ctx.editMessageText("Select recipients.", { parse_mode: "HTML", ...campaignRecipientsKeyboard() }); ctx.session.campaign.step = "recipients"; });
  bot.action("campaign:back:message", async (ctx) => { await ctx.answerCbQuery(); await ctx.editMessageText("Send the updated message content.", { parse_mode: "HTML" }); ctx.session.campaign.step = "message"; });
  bot.action("flow:cancel", cancelCampaign);

  bot.action(/^(campaign|audience|template):page:/, async (ctx) => { await ctx.answerCbQuery("There are no more mock pages."); });
  bot.action("audience:add:current", async (ctx) => {
    try {
      const recipient = await registerRecipient({ businessId: ctx.business._id, destinationId: ctx.from.id, provider });
      await ctx.answerCbQuery("Current chat added");
      await ctx.editMessageText(`Recipient saved: ${recipient.displayName}`, { parse_mode: "HTML", ...mainMenuKeyboard() });
    } catch (error) {
      await ctx.answerCbQuery(error.code === "INELIGIBLE_DESTINATION" ? error.message : "Unable to add this chat");
      if (error.code !== "INELIGIBLE_DESTINATION") throw error;
    }
  });
  for (const type of ["all", "user", "group", "channel"]) {
    bot.action(`audience:list:${type}`, async (ctx) => {
      const filter = type === "all" ? {} : { destinationType: type };
      const recipients = await listRecipients(ctx.business._id, { ...filter, sendingEligible: true });
      const text = recipients.length
        ? recipients.map((recipient) => `• ${recipient.displayName} — ${recipient.destinationType}`).join("\n")
        : "No eligible recipients found.";
      await ctx.answerCbQuery();
      await ctx.editMessageText(`<b>Recipients</b>\n\n${text}`, { parse_mode: "HTML", ...mainMenuKeyboard() });
    });
  }
  bot.action("audience:saved", async (ctx) => { await ctx.answerCbQuery("Audience management is available in the campaign phase."); });
  bot.action("audience:create", async (ctx) => { await ctx.answerCbQuery("Audience creation is available in the campaign phase."); });
  bot.catch((error) => console.error("Telegram bot error:", error));
  return bot;
};
