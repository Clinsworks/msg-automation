import { campaignDeliveryKeyboard, campaignMethodKeyboard, campaignPreviewKeyboard, campaignRecipientsKeyboard, mainMenuKeyboard } from "./keyboards.js";

const flowMessage = (ctx, text, keyboard) => ctx.reply(text, { parse_mode: "HTML", ...keyboard });

export const startCampaign = async (ctx) => {
  ctx.session.campaign = { step: "name" };
  await flowMessage(ctx, "<b>Create campaign</b>\n\nStep 1 of 6: Send a campaign name.\n\nExample: Weekend Promotion", { reply_markup: undefined });
};

export const handleCampaignText = async (ctx) => {
  const campaign = ctx.session.campaign;
  if (!campaign || !["name", "message", "schedule"].includes(campaign.step)) return false;

  if (campaign.step === "name") {
    campaign.name = ctx.message.text.trim();
    campaign.step = "message";
    await flowMessage(ctx, "<b>Create campaign</b>\n\nStep 2 of 6: Send the message content.\n\nPlain text, Telegram formatting, links, images, videos and documents are supported by the future delivery layer.", {});
  } else if (campaign.step === "message") {
    campaign.message = ctx.message.text;
    campaign.step = "method";
    await flowMessage(ctx, "<b>Create campaign</b>\n\nStep 3 of 6: Choose a sending method.", { ...campaignMethodKeyboard() });
  } else if (campaign.step === "schedule") {
    campaign.delivery = `Scheduled for ${ctx.message.text.trim()}`;
    campaign.step = "preview";
    await showPreview(ctx);
  }
  return true;
};

export const showPreview = async (ctx) => {
  const campaign = ctx.session.campaign;
  await flowMessage(ctx, `<b>Campaign preview</b>\n\nName: ${campaign.name}\nMessage: ${campaign.message}\nMethod: ${campaign.method}\nRecipients: ${campaign.recipients || "None selected"}\nDelivery: ${campaign.delivery || "Not selected"}\n\nNo message has been sent.`, { ...campaignPreviewKeyboard() });
};

export const selectMethod = async (ctx, method) => {
  ctx.session.campaign.method = method;
  ctx.session.campaign.step = "recipients";
  await ctx.editMessageText("<b>Create campaign</b>\n\nStep 4 of 6: Select recipients.\n\nOnly destinations legitimately reachable by the selected method can be used.", { parse_mode: "HTML", ...campaignRecipientsKeyboard() });
};

export const selectRecipients = async (ctx, recipients) => {
  ctx.session.campaign.recipients = recipients;
  await ctx.answerCbQuery(`Recipients: ${recipients}`);
};

export const showDelivery = async (ctx) => {
  ctx.session.campaign.step = "delivery";
  await ctx.editMessageText("<b>Create campaign</b>\n\nStep 5 of 6: Choose delivery options.", { parse_mode: "HTML", ...campaignDeliveryKeyboard() });
};

export const chooseDelivery = async (ctx, option) => {
  const campaign = ctx.session.campaign;
  if (option === "schedule") {
    campaign.step = "schedule";
    await ctx.editMessageText("<b>Schedule campaign</b>\n\nSend the date and time in your preferred format.\n\nExample: 2026-12-01 09:30", { parse_mode: "HTML" });
    return;
  }
  campaign.delivery = option === "now" ? "Immediately" : "Saved as draft";
  campaign.step = "preview";
  await showPreview(ctx);
};

export const cancelCampaign = async (ctx) => {
  delete ctx.session.campaign;
  await ctx.answerCbQuery("Campaign cancelled");
  await ctx.editMessageText("Campaign creation cancelled.", { parse_mode: "HTML", ...mainMenuKeyboard() });
};
