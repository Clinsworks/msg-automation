import { Telegraf } from "telegraf";
import { config } from "../config/env.js";
import { cancelCampaign, chooseDelivery, handleCampaignText, selectMethod, selectRecipients, showDelivery, showPreview, startCampaign } from "./campaign-flow.js";
import { campaignMethodKeyboard, mainMenuKeyboard } from "./keyboards.js";
import { audiences, analytics, campaigns, campaignList, dashboard, help, mainMenu, scheduled, settings, subscription, templates } from "./views.js";
import { loadConversationState, saveConversationState } from "../modules/conversation-state/service.js";
import { ensureUserWorkspace } from "../modules/users/service.js";

const render = async (ctx, view) => {
  const { text, keyboard } = view(ctx.from);
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", ...keyboard });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", ...keyboard });
  }
};

export const createBot = () => {
  if (!config.botToken) throw new Error("BOT_TOKEN is required to start the Telegram bot");
  const bot = new Telegraf(config.botToken);
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
  bot.action("nav:subscription", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, subscription); });
  bot.action("nav:settings", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, settings); });
  bot.action("nav:help", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, help); });

  bot.action("campaign:create", async (ctx) => { await ctx.answerCbQuery(); await startCampaign(ctx); });
  bot.action("campaign:list", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, campaignList); });
  for (const status of ["drafts", "active", "scheduled", "completed", "failed"]) {
    bot.action(`campaign:${status}`, async (ctx) => { await ctx.answerCbQuery(); await render(ctx, campaignList); });
  }
  bot.action("campaign:method:standard", async (ctx) => { await ctx.answerCbQuery(); await selectMethod(ctx, "Standard Bot"); });
  bot.action("campaign:method:premium", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText("<b>Premium sending</b>\n\nAn active subscription and authorized Telegram account are required. This feature is not enabled in Phase 1.", { parse_mode: "HTML", ...campaignMethodKeyboard() });
  });
  bot.action("campaign:recipient:individual", async (ctx) => selectRecipients(ctx, "Individual recipients"));
  bot.action("campaign:recipient:audience", async (ctx) => selectRecipients(ctx, "Saved audience"));
  bot.action("campaign:recipient:groups", async (ctx) => selectRecipients(ctx, "Telegram groups"));
  bot.action("campaign:recipient:channels", async (ctx) => selectRecipients(ctx, "Telegram channels"));
  bot.action("campaign:recipient:all", async (ctx) => selectRecipients(ctx, "All selected destinations"));
  bot.action("campaign:recipient:none", async (ctx) => selectRecipients(ctx, "None selected"));
  bot.action("campaign:delivery", async (ctx) => { await ctx.answerCbQuery(); await showDelivery(ctx); });
  bot.action("campaign:delivery:now", async (ctx) => { await ctx.answerCbQuery(); await chooseDelivery(ctx, "now"); });
  bot.action("campaign:delivery:schedule", async (ctx) => { await ctx.answerCbQuery(); await chooseDelivery(ctx, "schedule"); });
  bot.action("campaign:delivery:draft", async (ctx) => { await ctx.answerCbQuery(); await chooseDelivery(ctx, "draft"); });
  bot.action("campaign:confirm:send", async (ctx) => { await ctx.answerCbQuery(); await ctx.editMessageText("Campaign confirmed in mock mode. No message was sent.", { parse_mode: "HTML", ...mainMenuKeyboard() }); });
  bot.action("campaign:confirm:schedule", async (ctx) => { await ctx.answerCbQuery(); await ctx.editMessageText("Campaign saved as a mock scheduled campaign. No message was sent.", { parse_mode: "HTML", ...mainMenuKeyboard() }); });
  bot.action("campaign:confirm:draft", async (ctx) => { await ctx.answerCbQuery(); await ctx.editMessageText("Campaign saved as a mock draft.", { parse_mode: "HTML", ...mainMenuKeyboard() }); });
  bot.action("campaign:back:name", async (ctx) => { await ctx.answerCbQuery(); await ctx.editMessageText("Send a campaign name.", { parse_mode: "HTML" }); ctx.session.campaign.step = "name"; });
  bot.action("campaign:back:method", async (ctx) => { await ctx.answerCbQuery(); await ctx.editMessageText("Choose a sending method.", { parse_mode: "HTML", ...campaignMethodKeyboard() }); ctx.session.campaign.step = "method"; });
  bot.action("campaign:back:recipients", async (ctx) => { await ctx.answerCbQuery(); await ctx.editMessageText("Select recipients.", { parse_mode: "HTML", ...campaignRecipientsKeyboard() }); ctx.session.campaign.step = "recipients"; });
  bot.action("campaign:back:message", async (ctx) => { await ctx.answerCbQuery(); await ctx.editMessageText("Send the updated message content.", { parse_mode: "HTML" }); ctx.session.campaign.step = "message"; });
  bot.action("flow:cancel", cancelCampaign);

  bot.action(/^(campaign|audience|template):page:/, async (ctx) => { await ctx.answerCbQuery("There are no more mock pages."); });
  bot.catch((error) => console.error("Telegram bot error:", error));
  return bot;
};
