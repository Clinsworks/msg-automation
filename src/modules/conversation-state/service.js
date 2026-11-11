import { ConversationState } from "../../database/models.js";

const stateExpiry = () => new Date(Date.now() + 24 * 60 * 60 * 1000);

export const loadConversationState = async (telegramUserId) => {
  const state = await ConversationState.findOne({ telegramUserId: String(telegramUserId) }).lean();
  return state
    ? { campaign: state.workflow === "campaign" ? state.temporaryData : undefined, workflow: state.workflow, step: state.currentStep }
    : {};
};

export const saveConversationState = async (telegramUserId, session = {}) => {
  const campaign = session.campaign;
  await ConversationState.findOneAndUpdate(
    { telegramUserId: String(telegramUserId) },
    {
      $set: {
        workflow: campaign ? "campaign" : "idle",
        currentStep: campaign?.step || "idle",
        temporaryData: campaign || {}
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
