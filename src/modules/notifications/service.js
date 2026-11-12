import { Subscription } from "../../database/models.js";

export const findExpiringSubscriptions = (days = 3) => {
  const now = new Date();
  const until = new Date(now.getTime() + days * 86400000);
  return Subscription.find({
    status: "active",
    expiresAt: { $gt: now, $lte: until }
  }).populate({ path: "business", select: "owner name" }).lean();
};

export const findExpiringSubscription = (businessId, days = 3) => {
  const now = new Date();
  const until = new Date(now.getTime() + days * 86400000);
  return Subscription.findOne({
    business: businessId,
    status: "active",
    expiresAt: { $gt: now, $lte: until },
  }).populate("plan").lean();
};

export const getSubscriptionNotification = (subscription) => {
  const remainingDays = Math.max(0, Math.ceil((new Date(subscription.expiresAt) - Date.now()) / 86400000));
  return `Your ${subscription.plan?.name || "subscription"} plan expires in ${remainingDays} day(s). Renew before expiry to retain premium access.`;
};
