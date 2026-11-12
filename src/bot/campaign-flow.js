import {
  campaignDeliveryKeyboard,
  campaignMethodKeyboard,
  campaignPreviewKeyboard,
  campaignRecipientsKeyboard,
  mainMenuKeyboard,
} from "./keyboards.js";
import {
  createCampaign,
  executeCampaign,
  findEligibleRecipients,
} from "../modules/campaigns/service.js";
import { canAccessFeature } from "../modules/subscriptions/service.js";
import { getPersonalProvider } from "../modules/telegram/connection-service.js";
import { TelegramUserProvider } from "../modules/telegram/user-provider.js";
import { Audience } from "../database/models.js";

const flowMessage = (ctx, text, keyboard) =>
  ctx.reply(text, { parse_mode: "HTML", ...keyboard });

export const startCampaign = async (ctx) => {
  ctx.session.campaign = { step: "name" };
  await flowMessage(
    ctx,
    "<b>Create campaign</b>\n\nStep 1 of 6: Send a campaign name.\n\nExample: Weekend Promotion",
    { reply_markup: undefined },
  );
};

export const handleCampaignText = async (ctx) => {
  const campaign = ctx.session.campaign;
  if (!campaign || !["name", "message", "schedule"].includes(campaign.step))
    return false;

  if (campaign.step === "name") {
    campaign.name = ctx.message.text.trim();
    campaign.step = "message";
    await flowMessage(
      ctx,
      "<b>Create campaign</b>\n\nStep 2 of 6: Send the message content.\n\nPlain text, Telegram formatting, and links are supported. Media delivery can be added to the campaign record in a later update.",
      {},
    );
  } else if (campaign.step === "message") {
    campaign.message = ctx.message.text;
    campaign.step = "method";
    await flowMessage(
      ctx,
      "<b>Create campaign</b>\n\nStep 3 of 6: Choose a sending method.",
      { ...campaignMethodKeyboard() },
    );
  } else if (campaign.step === "schedule") {
    campaign.scheduledFor = ctx.message.text.trim();
    campaign.delivery = `Scheduled for ${campaign.scheduledFor}`;
    campaign.step = "preview";
    await showPreview(ctx);
  }
  return true;
};

export const showPreview = async (ctx) => {
  const campaign = ctx.session.campaign;
  await flowMessage(
    ctx,
    `<b>Campaign preview</b>\n\nName: ${campaign.name}\nMessage: ${campaign.message}\nMethod: ${campaign.method}\nRecipients: ${campaign.recipients || "None selected"}\nDelivery: ${campaign.delivery || "Not selected"}\n\nNo message has been sent.`,
    { ...campaignPreviewKeyboard() },
  );
};

export const selectMethod = async (ctx, method) => {
  ctx.session.campaign.method = method;
  ctx.session.campaign.step = "recipients";
  await ctx.editMessageText(
    "<b>Create campaign</b>\n\nStep 4 of 6: Select recipients.\n\nOnly destinations legitimately reachable by the selected method can be used.",
    { parse_mode: "HTML", ...campaignRecipientsKeyboard() },
  );
};

export const selectRecipients = async (ctx, type) => {
  if (type === "none") {
    ctx.session.campaign.recipientIds = [];
    ctx.session.campaign.recipients = "None selected";
    await ctx.answerCbQuery("Recipients cleared");
    return;
  }
  const recipients = await findEligibleRecipients(ctx.business._id, type);
  ctx.session.campaign.recipientIds = recipients.map((recipient) =>
    String(recipient._id),
  );
  ctx.session.campaign.recipients = recipients.length
    ? recipients.map((recipient) => recipient.displayName).join(", ")
    : "None selected";
  await ctx.answerCbQuery(`${recipients.length} recipient(s) selected`);
};

export const selectAudience = async (ctx, audienceId) => {
  const audience = await Audience.findOne({
    _id: audienceId,
    business: ctx.business._id,
  }).populate({
    path: "recipients",
    match: { sendingEligible: true },
    select: "displayName",
  });
  if (!audience) throw new Error("Saved audience not found.");
  const recipients = audience.recipients || [];
  ctx.session.campaign.recipientIds = recipients.map((recipient) => String(recipient._id));
  ctx.session.campaign.recipients = recipients.length
    ? `${audience.name} (${recipients.length} recipients)`
    : `${audience.name} (no eligible recipients)`;
  await ctx.answerCbQuery(`${recipients.length} recipient(s) selected`);
  await ctx.editMessageText(
    `<b>Recipients selected</b>\n\n${ctx.session.campaign.recipients}`,
    { parse_mode: "HTML", ...campaignRecipientsKeyboard() },
  );
};

export const showDelivery = async (ctx) => {
  ctx.session.campaign.step = "delivery";
  await ctx.editMessageText(
    "<b>Create campaign</b>\n\nStep 5 of 6: Choose delivery options.",
    { parse_mode: "HTML", ...campaignDeliveryKeyboard() },
  );
};

export const chooseDelivery = async (ctx, option) => {
  const campaign = ctx.session.campaign;
  if (option === "schedule") {
    if (!(await canAccessFeature(ctx.business._id, "scheduling"))) {
      await ctx.editMessageText("Scheduling requires an active Basic or Pro subscription.", { parse_mode: "HTML", ...mainMenuKeyboard() });
      return;
    }
    campaign.step = "schedule";
    await ctx.editMessageText(
      "<b>Schedule campaign</b>\n\nSend the date and time in your preferred format.\n\nExample: 2026-12-01 09:30",
      { parse_mode: "HTML" },
    );
    return;
  }
  campaign.delivery = option === "now" ? "Immediately" : "Saved as draft";
  campaign.step = "preview";
  await showPreview(ctx);
};

export const saveDraft = async (ctx) => {
  const campaign = await createCampaign({
    businessId: ctx.business._id,
    input: ctx.session.campaign,
    status: "draft",
  });
  delete ctx.session.campaign;
  await ctx.answerCbQuery("Draft saved");
  await ctx.editMessageText(
    `Draft saved successfully.\n\nCampaign: ${campaign.name}`,
    { parse_mode: "HTML", ...mainMenuKeyboard() },
  );
};

export const scheduleCampaign = async (ctx) => {
  const scheduledFor = ctx.session.campaign.scheduledFor
    ? new Date(ctx.session.campaign.scheduledFor)
    : undefined;
  if (
    !scheduledFor ||
    Number.isNaN(scheduledFor.getTime()) ||
    scheduledFor <= new Date()
  ) {
    throw new Error("A future schedule date is required.");
  }
  const campaign = await createCampaign({
    businessId: ctx.business._id,
    input: ctx.session.campaign,
    status: "scheduled",
    scheduledFor,
  });
  delete ctx.session.campaign;
  await ctx.answerCbQuery("Campaign scheduled");
  await ctx.editMessageText(
    `Campaign scheduled.\n\nCampaign: ${campaign.name}\nTime: ${scheduledFor.toISOString()}`,
    { parse_mode: "HTML", ...mainMenuKeyboard() },
  );
};

export const sendCampaign = async (ctx, botProvider) => {
  let provider = botProvider;
  let personalClient;
  try {
    if (ctx.session.campaign.method === "Premium Personal Account") {
      const connection = await getPersonalProvider(ctx.business._id);
      personalClient = connection.client;
      provider = new TelegramUserProvider(personalClient);
    }
    const campaign = await createCampaign({
      businessId: ctx.business._id,
      input: ctx.session.campaign,
      status: "draft",
    });
    const result = await executeCampaign({
      campaignId: campaign._id,
      businessId: ctx.business._id,
      provider,
    });
    const successful = result.results.filter((item) => item.status === "sent").length;
    const failed = result.results.length - successful;
    delete ctx.session.campaign;
    await ctx.answerCbQuery("Delivery complete");
    await ctx.editMessageText(
      `<b>Campaign result</b>\n\nCampaign: ${campaign.name}\nTotal attempted: ${result.results.length}\nSuccessful deliveries: ${successful}\nFailed deliveries: ${failed}\nStatus: ${result.campaign.status}`,
      { parse_mode: "HTML", ...mainMenuKeyboard() },
    );
  } finally {
    if (personalClient) await personalClient.disconnect();
  }
};

export const cancelCampaign = async (ctx) => {
  delete ctx.session.campaign;
  await ctx.answerCbQuery("Campaign cancelled");
  await ctx.editMessageText("Campaign creation cancelled.", {
    parse_mode: "HTML",
    ...mainMenuKeyboard(),
  });
};
