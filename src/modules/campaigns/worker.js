import { Worker } from "bullmq";
import { Campaign, CampaignDelivery, Recipient } from "../../database/models.js";

const providerName = "telegram_bot";

const finishCampaignIfTerminal = async (campaignId) => {
  const [campaign, deliveries] = await Promise.all([
    Campaign.findById(campaignId),
    CampaignDelivery.find({ campaign: campaignId }).select("status")
  ]);
  if (!campaign || !deliveries.length || deliveries.some(({ status }) => status === "pending")) return;
  campaign.status = deliveries.every(({ status }) => status === "sent") ? "completed" : "failed";
  await campaign.save();
};

const dispatchCampaign = async ({ campaignId, businessId, queue }) => {
  const campaign = await Campaign.findOne({ _id: campaignId, business: businessId });
  if (!campaign) throw new Error("Campaign not found.");
  if (campaign.status === "cancelled") return;
  if (campaign.sendingMethod !== "standard_bot") throw new Error("Personal Telegram delivery requires its own provider.");

  campaign.status = "active";
  await campaign.save();
  const deliveries = await CampaignDelivery.find({ campaign: campaign._id }).select("recipient status");
  for (const delivery of deliveries) {
    if (delivery.status === "sent") continue;
    await queue.add(
      "deliver-recipient",
      { campaignId: String(campaign._id), businessId, recipientId: String(delivery.recipient) },
      {
        jobId: `delivery:${campaign._id}:${delivery.recipient}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 1000,
        removeOnFail: 1000
      }
    );
  }
};

const deliverRecipient = async ({ campaignId, businessId, recipientId, provider, attemptsMade }) => {
  const campaign = await Campaign.findOne({ _id: campaignId, business: businessId }).select("messageContent status");
  const recipient = await Recipient.findOne({ _id: recipientId, business: businessId }).select("telegramDestinationId sendingEligible");
  const delivery = await CampaignDelivery.findOne({ campaign: campaignId, recipient: recipientId });
  if (!campaign || !recipient || !delivery || campaign.status === "cancelled") return;
  if (delivery.status === "sent") return;
  if (!recipient.sendingEligible) {
    delivery.status = "failed";
    delivery.error = "Recipient is no longer eligible.";
    await delivery.save();
    await finishCampaignIfTerminal(campaignId);
    return;
  }

  try {
    const message = await provider.sendMessage(recipient.telegramDestinationId, campaign.messageContent);
    delivery.status = "sent";
    delivery.telegramMessageId = String(message.message_id);
    delivery.deliveredAt = new Date();
    delivery.attemptCount = attemptsMade + 1;
    delivery.error = undefined;
    await delivery.save();
    await finishCampaignIfTerminal(campaignId);
  } catch (error) {
    delivery.attemptCount = attemptsMade + 1;
    delivery.error = error.message;
    if (attemptsMade >= 2) {
      delivery.status = "failed";
      await delivery.save();
      await finishCampaignIfTerminal(campaignId);
      return;
    }
    await delivery.save();
    throw error;
  }
};

export const createCampaignWorker = ({ connection, queue, telegram }) => {
  const provider = {
    sendMessage: (destinationId, text, options) => telegram.sendMessage(destinationId, text, options)
  };
  const worker = new Worker(
    "campaign-delivery",
    async (job) => {
      if (job.name === "dispatch-campaign") {
        await dispatchCampaign({ ...job.data, queue });
        return;
      }
      if (job.name === "deliver-recipient") {
        await deliverRecipient({ ...job.data, provider, attemptsMade: job.attemptsMade });
        return;
      }
      throw new Error(`Unknown campaign job: ${job.name}`);
    },
    { connection, concurrency: 3 }
  );
  worker.on("failed", (job, error) => {
    console.error(`Campaign job failed (${job?.name || "unknown"}):`, error.message);
  });
  return worker;
};
