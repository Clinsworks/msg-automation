import { CrossPostRule, Recipient } from "../../database/models.js";

export const listCrossPostRules = (businessId) =>
  CrossPostRule.find({ business: businessId }).populate("destinationRecipients", "displayName telegramDestinationId").lean();

export const saveCrossPostRule = async ({ businessId, sourceChatId, destinationIds, mode = "copy" }) => {
  const recipients = await Recipient.find({
    business: businessId,
    _id: { $in: destinationIds },
    sendingEligible: true,
  }).select("_id");
  if (!recipients.length) throw new Error("Select at least one eligible destination.");
  return CrossPostRule.findOneAndUpdate(
    { business: businessId, sourceChatId: String(sourceChatId) },
    { $set: { destinationRecipients: recipients.map((item) => item._id), mode, active: true } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

export const processCrossPostMessage = async ({ businessId, sourceChatId, text, provider }) => {
  const rules = await CrossPostRule.find({ business: businessId, sourceChatId: String(sourceChatId), active: true }).populate("destinationRecipients");
  for (const rule of rules) {
    for (const destination of rule.destinationRecipients) {
      if (!destination.sendingEligible) continue;
      await provider.sendMessage(destination.telegramDestinationId, text);
    }
  }
};
