import mongoose from "mongoose";

const { Schema } = mongoose;
const objectId = () => Schema.Types.ObjectId;
const timestamps = { createdAt: "createdAt", updatedAt: "updatedAt" };

const userSchema = new Schema({
  telegramUserId: { type: String, required: true, unique: true, index: true },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, trim: true },
  username: { type: String, trim: true },
  accountStatus: { type: String, enum: ["active", "suspended"], default: "active", index: true },
  business: { type: objectId(), ref: "Business", unique: true, sparse: true }
}, timestamps);

const businessSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 500 },
  owner: { type: objectId(), ref: "User", required: true, unique: true, index: true },
  status: { type: String, enum: ["active", "suspended"], default: "active", index: true }
}, timestamps);

const telegramConnectionSchema = new Schema({
  business: { type: objectId(), ref: "Business", required: true, index: true },
  connectionType: { type: String, enum: ["bot", "personal"], required: true },
  accountIdentifier: { type: String, required: true },
  encryptedSession: { type: String, select: false },
  status: { type: String, enum: ["pending", "connected", "disconnected"], default: "pending" },
  lastSynchronizedAt: Date
}, timestamps);
telegramConnectionSchema.index({ business: 1, connectionType: 1 }, { unique: true });

const recipientSchema = new Schema({
  business: { type: objectId(), ref: "Business", required: true, index: true },
  telegramDestinationId: { type: String, required: true },
  displayName: { type: String, required: true, trim: true },
  destinationType: { type: String, enum: ["user", "group", "channel"], required: true },
  sendingEligible: { type: Boolean, default: false },
  consentStatus: { type: String, enum: ["unknown", "granted", "revoked"], default: "unknown" }
}, timestamps);
recipientSchema.index({ business: 1, telegramDestinationId: 1 }, { unique: true });

const audienceSchema = new Schema({
  business: { type: objectId(), ref: "Business", required: true, index: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  recipients: [{ type: objectId(), ref: "Recipient" }]
}, timestamps);

const campaignSchema = new Schema({
  business: { type: objectId(), ref: "Business", required: true, index: true },
  name: { type: String, required: true, trim: true },
  messageContent: { type: String, required: true },
  media: { type: Schema.Types.Mixed },
  sendingMethod: { type: String, enum: ["standard_bot", "personal_account"], required: true },
  recipients: [{ type: objectId(), ref: "Recipient" }],
  audiences: [{ type: objectId(), ref: "Audience" }],
  scheduledFor: Date,
  status: { type: String, enum: ["draft", "active", "scheduled", "completed", "failed", "cancelled"], default: "draft", index: true }
}, timestamps);

const campaignDeliverySchema = new Schema({
  campaign: { type: objectId(), ref: "Campaign", required: true, index: true },
  recipient: { type: objectId(), ref: "Recipient", required: true, index: true },
  sendingProvider: { type: String, enum: ["telegram_bot", "telegram_user"], required: true },
  status: { type: String, enum: ["pending", "sent", "failed"], default: "pending", index: true },
  telegramMessageId: String,
  error: String,
  attemptCount: { type: Number, default: 0, min: 0 },
  deliveredAt: Date
}, timestamps);

const templateSchema = new Schema({
  business: { type: objectId(), ref: "Business", required: true, index: true },
  name: { type: String, required: true, trim: true },
  content: { type: String, required: true },
  media: { type: Schema.Types.Mixed }
}, timestamps);

const planSchema = new Schema({
  name: { type: String, required: true, unique: true, trim: true },
  price: { type: Number, required: true, min: 0 },
  durationDays: { type: Number, required: true, min: 1 },
  entitlements: [{ type: String }],
  usageLimits: { type: Schema.Types.Mixed, default: {} },
  active: { type: Boolean, default: true, index: true }
}, timestamps);

const subscriptionSchema = new Schema({
  business: { type: objectId(), ref: "Business", required: true, unique: true, index: true },
  plan: { type: objectId(), ref: "Plan", required: true },
  status: { type: String, enum: ["active", "expired", "cancelled"], default: "active", index: true },
  startsAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  renewalHistory: [{ type: Schema.Types.Mixed }]
}, timestamps);

const paymentSchema = new Schema({
  business: { type: objectId(), ref: "Business", required: true, index: true },
  subscription: { type: objectId(), ref: "Subscription" },
  paystackReference: { type: String, required: true, unique: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: "NGN" },
  status: { type: String, enum: ["pending", "success", "failed"], default: "pending", index: true },
  verifiedAt: Date,
  webhookProcessed: { type: Boolean, default: false }
}, timestamps);

const conversationStateSchema = new Schema({
  telegramUserId: { type: String, required: true, unique: true, index: true },
  workflow: { type: String, default: "idle" },
  currentStep: { type: String, default: "idle" },
  temporaryData: { type: Schema.Types.Mixed, default: {} },
  expiresAt: { type: Date, required: true }
}, { ...timestamps, strict: true });
conversationStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

export const User = model("User", userSchema);
export const Business = model("Business", businessSchema);
export const TelegramConnection = model("TelegramConnection", telegramConnectionSchema);
export const Recipient = model("Recipient", recipientSchema);
export const Audience = model("Audience", audienceSchema);
export const Campaign = model("Campaign", campaignSchema);
export const CampaignDelivery = model("CampaignDelivery", campaignDeliverySchema);
export const Template = model("Template", templateSchema);
export const Plan = model("Plan", planSchema);
export const Subscription = model("Subscription", subscriptionSchema);
export const Payment = model("Payment", paymentSchema);
export const ConversationState = model("ConversationState", conversationStateSchema);
