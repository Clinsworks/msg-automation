import { CrossPostDelivery, CrossPostRule, Recipient } from "../../database/models.js";

const getDialogType = (entity) => {
  if (entity.className === "Channel") return entity.megagroup ? "group" : "channel";
  if (entity.className === "Chat") return "group";
  return "user";
};

export const syncPersonalDialogs = async ({ businessId, client, limit = 100 }) => {
  const dialogs = await client.getDialogs({ limit });
  const previousRecipients = await Recipient.find({
    business: businessId,
    recipientSource: "personal_sync",
  }).select("_id").lean();
  if (previousRecipients.length) {
    await CrossPostRule.updateMany(
      { business: businessId },
      { $pull: { destinationRecipients: { $in: previousRecipients.map((recipient) => recipient._id) } } },
    );
    await Recipient.deleteMany({
      business: businessId,
      recipientSource: "personal_sync",
    });
  }
  const saved = [];
  for (const dialog of dialogs) {
    const entity = dialog.entity;
    if (!entity || entity.bot || entity.self) continue;
    const destinationType = getDialogType(entity);
    const displayName = entity.title || [entity.firstName, entity.lastName].filter(Boolean).join(" ") || entity.username || String(entity.id);
    const telegramDestinationId = dialog.id?.toString?.() || (entity.username ? `@${entity.username}` : String(entity.id));
    const recipient = await Recipient.findOneAndUpdate(
      { business: businessId, telegramDestinationId },
      { $set: { displayName, destinationType, recipientSource: "personal_sync", sendingEligible: true, selectedForCrossPost: false, consentStatus: "granted" } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    saved.push(recipient);
  }
  return saved;
};

export const listPersonalRecipients = (businessId) =>
  Recipient.find({
    business: businessId,
    recipientSource: "personal_sync",
    sendingEligible: true,
    destinationType: { $in: ["user", "group", "channel"] },
  }).sort({ displayName: 1 }).lean();

export const setCrossPostRecipientSelected = async ({ businessId, recipientId, selected }) =>
  Recipient.findOneAndUpdate(
    { _id: recipientId, business: businessId, recipientSource: "personal_sync", sendingEligible: true },
    { $set: { selectedForCrossPost: selected } },
    { new: true },
  ).lean();

export const getSelectedCrossPostRecipients = (businessId) =>
  Recipient.find({
    business: businessId,
    recipientSource: "personal_sync",
    sendingEligible: true,
    selectedForCrossPost: true,
  }).sort({ displayName: 1 }).lean();

export const clearPersonalRecipients = async (businessId) => {
  const recipients = await Recipient.find({
    business: businessId,
    recipientSource: "personal_sync",
    selectedForCrossPost: true,
  }).select("_id").lean();
  if (!recipients.length) return 0;
  await CrossPostRule.updateMany(
    { business: businessId },
    { $pull: { destinationRecipients: { $in: recipients.map((recipient) => recipient._id) } } },
  );
  await Recipient.updateMany({
    business: businessId,
    recipientSource: "personal_sync",
    selectedForCrossPost: true,
  }, {
    $set: { selectedForCrossPost: false },
  });
  return recipients.length;
};

export const sendToRecipients = async ({ businessId, recipientIds, text, options = {}, provider }) => {
  const recipients = await Recipient.find({
    business: businessId,
    _id: { $in: recipientIds },
    sendingEligible: true,
  }).lean();
  if (!recipients.length) throw new Error("Select at least one eligible chat or contact.");
  let sent = 0;
  const failures = [];
  for (const recipient of recipients) {
    try {
      await provider.sendMessage(recipient.telegramDestinationId, text, options);
      sent += 1;
      await CrossPostDelivery.create({ business: businessId, recipient: recipient._id, status: "sent" });
    } catch (error) {
      failures.push(`${recipient.displayName}: ${error.message}`);
      await CrossPostDelivery.create({ business: businessId, recipient: recipient._id, status: "failed", error: error.message });
    }
  }
  return { sent, failures };
};

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
