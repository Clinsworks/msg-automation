import { Payment, Plan, Subscription } from "../../database/models.js";

export const seedPlans = async () => {
  const plans = [
    { name: "Free", price: 0, durationDays: 36500, entitlements: ["standard_bot"], usageLimits: { campaigns: 3, messages: 100 } },
    { name: "Basic", price: 5000, durationDays: 30, entitlements: ["standard_bot", "scheduling"], usageLimits: { campaigns: 30, messages: 1000 } },
    { name: "Pro", price: 15000, durationDays: 30, entitlements: ["standard_bot", "scheduling", "personal_telegram"], usageLimits: { campaigns: 100, messages: 10000 } },
  ];
  await Promise.all(plans.map((plan) => Plan.findOneAndUpdate(
    { name: plan.name },
    { $setOnInsert: plan },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )));
};

export const getBusinessSubscription = (businessId) =>
  Subscription.findOne({ business: businessId }).populate("plan").lean();

export const hasActiveSubscription = async (businessId) => {
  const subscription = await getBusinessSubscription(businessId);
  return Boolean(subscription?.status === "active" && subscription.expiresAt > new Date());
};

export const canAccessFeature = async (businessId, feature) => {
  const subscription = await getBusinessSubscription(businessId);
  if (!subscription || subscription.expiresAt <= new Date()) return feature === "standard_bot";
  return subscription.status === "active" && subscription.plan.entitlements.includes(feature);
};

export const getActivePlans = () => Plan.find({ active: true }).sort({ price: 1 }).lean();

export const getPaymentHistory = (businessId) =>
  Payment.find({ business: businessId }).sort({ createdAt: -1 }).limit(20).lean();
