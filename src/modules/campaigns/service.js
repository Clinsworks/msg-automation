import { Campaign, CampaignDelivery, Recipient } from "../../database/models.js";

const providerName = "telegram_bot";

const normalizeMethod = (method) => {
  if (method === "Standard Bot") return "standard_bot";
  if (method === "Premium Personal Account") return "personal_account";
  throw new Error("Unsupported campaign sending method.");
};

export const findEligibleRecipients = async (businessId, type) => {
  const filter = { business: businessId, sendingEligible: true };
  if (type && type !== "all") filter.destinationType = type;
  return Recipient.find(filter).sort({ createdAt: 1 }).lean();
};

export const createCampaign = async ({ businessId, input, status = "draft", scheduledFor }) => {
  if (!input.name?.trim() || !input.message?.trim()) {
    throw new Error("Campaign name and message content are required.");
  }
  if (!input.recipientIds?.length) {
    throw new Error("Select at least one eligible recipient.");
  }

  const recipients = await Recipient.find({
    _id: { $in: input.recipientIds },
    business: businessId,
    sendingEligible: true
  }).select("_id");

  if (recipients.length !== input.recipientIds.length) {
    throw new Error("One or more selected recipients are no longer eligible.");
  }

  return Campaign.create({
    business: businessId,
    name: input.name.trim(),
    messageContent: input.message,
    sendingMethod: normalizeMethod(input.method),
    recipients: recipients.map(({ _id }) => _id),
    orderButtonLabel: input.orderButtonLabel,
    scheduledFor,
    status
  });
};

export const executeCampaign = async ({ campaignId, businessId, provider }) => {
  const campaign = await Campaign.findOne({ _id: campaignId, business: businessId }).populate("recipients");
  if (!campaign) throw new Error("Campaign not found.");
  if (!provider) throw new Error("A messaging provider is required.");
  if (!campaign.recipients.length) throw new Error("Campaign has no recipients.");

  campaign.status = "active";
  await campaign.save();
  const results = [];

  for (const recipient of campaign.recipients) {
    const delivery = await CampaignDelivery.findOneAndUpdate(
      { campaign: campaign._id, recipient: recipient._id },
      {
        $setOnInsert: {
          campaign: campaign._id,
          recipient: recipient._id,
          sendingProvider: campaign.sendingMethod === "personal_account" ? "telegram_user" : providerName,
          status: "pending"
        },
        $inc: { attemptCount: 1 }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    if (delivery.status === "sent") {
      results.push({ recipient, status: "sent", telegramMessageId: delivery.telegramMessageId });
      continue;
    }
    try {
      const options = campaign.orderButtonLabel
        ? { reply_markup: { inline_keyboard: [[{ text: campaign.orderButtonLabel, callback_data: `order:catalog:${campaign.business}` }]] } }
        : {};
      const message = await provider.sendMessage(recipient.telegramDestinationId, campaign.messageContent, options);
      delivery.status = "sent";
      delivery.telegramMessageId = String(message.message_id);
      delivery.deliveredAt = new Date();
      await delivery.save();
      results.push({ recipient, status: "sent" });
    } catch (error) {
      delivery.status = "failed";
      delivery.error = error.message;
      await delivery.save();
      results.push({ recipient, status: "failed", error: error.message });
    }
  }

  const failed = results.filter((result) => result.status === "failed").length;
  campaign.status = failed === results.length ? "failed" : "completed";
  await campaign.save();
  return { campaign, results };
};

export const prepareCampaignDeliveries = async ({ campaignId, businessId }) => {
  const campaign = await Campaign.findOne({ _id: campaignId, business: businessId }).select("recipients");
  if (!campaign) throw new Error("Campaign not found.");
  await CampaignDelivery.bulkWrite(
    campaign.recipients.map((recipientId) => ({
      updateOne: {
        filter: { campaign: campaign._id, recipient: recipientId },
        update: {
          $setOnInsert: {
            campaign: campaign._id,
            recipient: recipientId,
            sendingProvider: providerName,
            status: "pending",
            attemptCount: 0
          }
        },
        upsert: true
      }
    }))
  );
};

export const listCampaigns = (businessId, status) =>
  Campaign.find({ business: businessId, ...(status ? { status } : {}) })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
