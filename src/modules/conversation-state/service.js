import { ConversationState } from "../../database/models.js";

const stateExpiry = () => new Date(Date.now() + 24 * 60 * 60 * 1000);

export const loadConversationState = async (telegramUserId) => {
  const state = await ConversationState.findOne({ telegramUserId: String(telegramUserId) }).lean();
  return state?.temporaryData || {};
};

export const saveConversationState = async (telegramUserId, session = {}) => {
  const workflow = session.adminAuth ? "admin_auth" : session.campaign ? "campaign" : "idle";
  const currentStep = session.adminAuth?.step || session.campaign?.step || "idle";
  await ConversationState.findOneAndUpdate(
    { telegramUserId: String(telegramUserId) },
    {
      $set: {
        workflow,
        currentStep,
        temporaryData: session
      },
      $setOnInsert: { expiresAt: stateExpiry() }
    },
    { upsert: true, setDefaultsOnInsert: true }
  );
  await ConversationState.updateOne(
    { telegramUserId: String(telegramUserId) },
    { $set: { expiresAt: stateExpiry() } }
  );
};
