import crypto from "node:crypto";
import axios from "axios";
import { Payment, Plan, Subscription } from "../../database/models.js";
import { config } from "../../config/env.js";

const paystack = axios.create({
  baseURL: "https://api.paystack.co",
  headers: { Authorization: `Bearer ${config.paystackSecretKey}` }
});

const requirePaystackConfig = () => {
  if (!config.paystackSecretKey || config.paystackSecretKey.startsWith("replace-")) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured");
  }
};

export const initializePayment = async ({ businessId, userEmail, planId }) => {
  requirePaystackConfig();
  if (!userEmail) throw new Error("A billing email is required. Set it with /setemail.");
  const plan = await Plan.findOne({ _id: planId, active: true }).lean();
  if (!plan || plan.price <= 0) throw new Error("This plan cannot be purchased.");

  const reference = `msg_${businessId}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const payment = await Payment.create({
    business: businessId,
    paystackReference: reference,
    amount: plan.price,
    currency: "NGN",
    status: "pending"
  });
  try {
    const { data } = await paystack.post("/transaction/initialize", {
      email: userEmail,
      amount: plan.price * 100,
      reference,
      callback_url: config.paystackCallbackUrl,
      metadata: { businessId: String(businessId), planId: String(plan._id) }
    });
    return { payment, plan, checkoutUrl: data.data.authorization_url };
  } catch (error) {
    await Payment.updateOne({ _id: payment._id }, { $set: { status: "failed" } });
    throw new Error(`Paystack initialization failed: ${error.response?.data?.message || error.message}`);
  }
};

export const verifyPayment = async (reference) => {
  requirePaystackConfig();
  const payment = await Payment.findOne({ paystackReference: reference });
  if (!payment) throw new Error("Payment reference not found.");
  if (payment.status === "success") return payment;

  const { data } = await paystack.get(`/transaction/verify/${encodeURIComponent(reference)}`);
  const transaction = data.data;
  const expectedAmount = payment.amount * 100;
  if (transaction.status !== "success" || transaction.amount !== expectedAmount || transaction.currency !== payment.currency) {
    await Payment.updateOne({ _id: payment._id }, { $set: { status: transaction.status === "failed" ? "failed" : "pending" } });
    return Payment.findById(payment._id);
  }
  return activateSubscription(payment._id, transaction);
};

export const activateSubscription = async (paymentId, transaction) => {
  const payment = await Payment.findById(paymentId);
  if (!payment) throw new Error("Payment not found.");
  if (payment.status === "success") return payment;
  const planId = transaction.metadata?.planId;
  const plan = await Plan.findById(planId);
  if (!plan) throw new Error("Payment plan not found.");

  const existing = await Subscription.findOne({ business: payment.business });
  const now = new Date();
  const start = existing?.expiresAt > now ? existing.expiresAt : now;
  const expires = new Date(start.getTime() + plan.durationDays * 86400000);
  const subscription = await Subscription.findOneAndUpdate(
    { business: payment.business },
    {
      $set: { plan: plan._id, status: "active", startsAt: existing?.startsAt || now, expiresAt: expires },
      $push: { renewalHistory: { payment: payment._id, renewedAt: now, startsAt: start, expiresAt: expires } }
    },
    { upsert: true, new: true }
  );
  return Payment.findOneAndUpdate(
    { _id: payment._id, status: { $ne: "success" } },
    { $set: { subscription: subscription._id, status: "success", verifiedAt: now, webhookProcessed: true } },
    { new: true }
  );
};

export const isValidPaystackSignature = (rawBody, signature) => {
  if (!signature || !config.paystackSecretKey) return false;
  const expected = crypto.createHmac("sha512", config.paystackSecretKey).update(rawBody).digest("hex");
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
};

export const processPaystackWebhook = async (payload) => {
  const reference = payload.data?.reference;
  if (!reference) throw new Error("Webhook payment reference is missing.");
  if (payload.event === "charge.success") return verifyPayment(reference);
  if (payload.event === "charge.failed") {
    return Payment.findOneAndUpdate({ paystackReference: reference }, { $set: { status: "failed", webhookProcessed: true } }, { new: true });
  }
  return null;
};
