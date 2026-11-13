import mongoose from "mongoose";

const { Schema } = mongoose;
const objectId = () => Schema.Types.ObjectId;
const timestamps = { createdAt: "createdAt", updatedAt: "updatedAt" };

const userSchema = new Schema({
  telegramUserId: { type: String, required: true, unique: true, index: true },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, trim: true },
  username: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  accountStatus: { type: String, enum: ["active", "suspended"], default: "active", index: true },
  business: { type: objectId(), ref: "Business", unique: true, sparse: true }
}, timestamps);

const businessSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 500 },
  owner: { type: objectId(), ref: "User", required: true, unique: true, index: true },
  adminPasswordHash: { type: String, required: true, select: false },
  adminPasswordChangedAt: { type: Date },
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
  orderButtonLabel: { type: String, trim: true, maxlength: 64 },
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
campaignDeliverySchema.index({ campaign: 1, recipient: 1 }, { unique: true });

const templateSchema = new Schema({
  business: { type: objectId(), ref: "Business", required: true, index: true },
  name: { type: String, required: true, trim: true },
  content: { type: String, required: true },
  media: { type: Schema.Types.Mixed }
}, timestamps);

const productSchema = new Schema({
  business: { type: objectId(), ref: "Business", required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, trim: true, maxlength: 1000 },
  price: { type: Number, required: true, min: 0 },
  stock: { type: Number, min: 0 },
  active: { type: Boolean, default: true, index: true }
}, timestamps);

const paymentDetailsSchema = new Schema({
  business: { type: objectId(), ref: "Business", required: true, unique: true },
  bankName: { type: String, trim: true },
  accountName: { type: String, trim: true },
  accountNumber: { type: String, trim: true },
  paymentReference: { type: String, trim: true }
}, timestamps);

const orderSchema = new Schema({
  business: { type: objectId(), ref: "Business", required: true, index: true },
  customerTelegramUserId: { type: String, required: true, index: true },
  customerName: { type: String, trim: true },
  product: { type: objectId(), ref: "Product", required: true },
  receiptFileId: { type: String },
  receiptText: { type: String, trim: true },
  status: { type: String, enum: ["awaiting_receipt", "pending_approval", "approved", "rejected"], default: "awaiting_receipt", index: true }
}, timestamps);

const staffSchema = new Schema({
  business: { type: objectId(), ref: "Business", required: true, index: true },
  telegramUserId: { type: String, required: true, index: true },
  displayName: { type: String, trim: true },
  role: { type: String, enum: ["manager", "marketer", "support"], default: "support" },
  status: { type: String, enum: ["active", "revoked"], default: "active", index: true }
}, timestamps);
staffSchema.index({ business: 1, telegramUserId: 1 }, { unique: true });

const crossPostRuleSchema = new Schema({
  business: { type: objectId(), ref: "Business", required: true, index: true },
  sourceChatId: { type: String, required: true },
  destinationRecipients: [{ type: objectId(), ref: "Recipient" }],
  mode: { type: String, enum: ["copy", "forward"], default: "copy" },
  active: { type: Boolean, default: true, index: true }
}, timestamps);
crossPostRuleSchema.index({ business: 1, sourceChatId: 1 }, { unique: true });

const botInteractionSchema = new Schema({
  business: { type: objectId(), ref: "Business", required: true, index: true },
  telegramUserId: { type: String, required: true, index: true },
  displayName: { type: String, trim: true },
  lastInteractionAt: { type: Date, required: true, index: true },
  optedOut: { type: Boolean, default: false }
}, timestamps);
botInteractionSchema.index({ business: 1, telegramUserId: 1 }, { unique: true });

const winbackCampaignSchema = new Schema({
  business: { type: objectId(), ref: "Business", required: true, index: true },
  message: { type: String, required: true },
  buttonLabel: { type: String, trim: true },
  inactiveDays: { type: Number, required: true, min: 1, default: 30 },
  status: { type: String, enum: ["draft", "sent"], default: "draft" },
  sentCount: { type: Number, default: 0 }
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
export const Product = model("Product", productSchema);
export const PaymentDetails = model("PaymentDetails", paymentDetailsSchema);
export const Order = model("Order", orderSchema);
export const Staff = model("Staff", staffSchema);
export const CrossPostRule = model("CrossPostRule", crossPostRuleSchema);
export const BotInteraction = model("BotInteraction", botInteractionSchema);
export const WinbackCampaign = model("WinbackCampaign", winbackCampaignSchema);
export const Plan = model("Plan", planSchema);
export const Subscription = model("Subscription", subscriptionSchema);
export const Payment = model("Payment", paymentSchema);
export const ConversationState = model("ConversationState", conversationStateSchema);
