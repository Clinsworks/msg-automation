import { BotInteraction, WinbackCampaign } from "../../database/models.js";

export const recordInteraction = ({ businessId, telegramUserId, displayName }) =>
  BotInteraction.findOneAndUpdate(
    { business: businessId, telegramUserId: String(telegramUserId) },
    { $set: { displayName, lastInteractionAt: new Date() }, $setOnInsert: { optedOut: false } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

export const findWinbackRecipients = (businessId, inactiveDays) =>
  BotInteraction.find({
    business: businessId,
    optedOut: false,
    lastInteractionAt: { $lte: new Date(Date.now() - inactiveDays * 86400000) }
  }).lean();

export const createWinbackCampaign = (input) => WinbackCampaign.create(input);

export const listWinbackCampaigns = (businessId) =>
  WinbackCampaign.find({ business: businessId }).sort({ createdAt: -1 }).limit(50).lean();
