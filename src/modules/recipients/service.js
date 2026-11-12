import { Recipient } from "../../database/models.js";

export const registerRecipient = async ({ businessId, destinationId, provider }) => {
  const validation = await provider.validateDestination(destinationId);
  if (!validation.valid) {
    const error = new Error(validation.reason || "Telegram destination is not eligible.");
    error.code = "INELIGIBLE_DESTINATION";
    throw error;
  }

  return Recipient.findOneAndUpdate(
    { business: businessId, telegramDestinationId: validation.telegramDestinationId },
    {
      $set: {
        displayName: validation.displayName,
        destinationType: validation.destinationType,
        sendingEligible: true,
        consentStatus: validation.destinationType === "user" ? "granted" : "unknown"
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
};

export const listRecipients = (businessId, filters = {}) =>
  Recipient.find({ business: businessId, ...filters }).sort({ createdAt: -1 }).lean();

export const removeRecipient = async (businessId, destinationId) =>
  Recipient.findOneAndUpdate(
    { business: businessId, telegramDestinationId: String(destinationId) },
    { $set: { sendingEligible: false, consentStatus: "revoked" } },
    { new: true }
  );
