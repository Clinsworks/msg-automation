import { getWorkspace } from "../mocks/workspace.js";
import {
  backMenuKeyboard,
  campaignsKeyboard,
  campaignAudienceKeyboard,
  dashboardKeyboard,
  audienceKeyboard,
  mainMenuKeyboard,
  paginationKeyboard,
  subscriptionKeyboard,
  analyticsKeyboard,
} from "./keyboards.js";
import { listCampaigns } from "../modules/campaigns/service.js";
import { getActivePlans, getBusinessSubscription, getPaymentHistory } from "../modules/subscriptions/service.js";
import { getBusinessAnalytics, getDashboardStats } from "../modules/analytics/service.js";
import { Audience, Campaign, Recipient, Template } from "../database/models.js";

export const mainMenu = async (ctx) => {
  const workspace = getWorkspace(ctx.from);
  const [stats, current] = await Promise.all([
    getDashboardStats(ctx.business._id),
    getBusinessSubscription(ctx.business._id),
  ]);
  const plan = current?.plan?.name || "Free";
  const status = current?.expiresAt > new Date() ? current.status : "expired";
  return {
    text: `WELCOME BACK, ${ctx.from?.first_name || "there"}!\n\nBusiness: ${workspace.businessName}\n\nHere's an overview of your messaging workspace.\n\n<b>Dashboard statistics</b>\n• Campaigns: ${stats.campaigns}\n• Messages attempted: ${stats.attempted}\n• Successful deliveries: ${stats.successful}\n• Failed deliveries: ${stats.failed}\n• Subscription: ${plan} (${status})`,
    keyboard: mainMenuKeyboard(),
  };
};

export const dashboard = async (ctx) => {
  const workspace = getWorkspace(ctx.from);
  const stats = await getDashboardStats(ctx.business._id);
  return {
    text: `<b>Dashboard</b>\n\nBusiness: ${workspace.businessName}\nAccount status: Active\nPlan: ${workspace.plan.name}\nCampaigns: ${stats.campaigns}\nMessages attempted: ${stats.attempted}\nSuccessful deliveries: ${stats.successful}\nFailed deliveries: ${stats.failed}\n\nUpcoming scheduled campaigns: ${stats.upcoming}`,
    keyboard: dashboardKeyboard(),
  };
};

const listView = (title, items, formatter, prefix) => ({
  text: `<b>${title}</b>\n\n${items.length ? items.map(formatter).join("\n") : "No records found."}`,
  keyboard: paginationKeyboard(prefix, false),
});

export const campaigns = () => ({
  text: "<b>Campaigns</b>\n\nCreate and manage your messaging campaigns. Standard and premium delivery are available when their requirements are met.",
  keyboard: campaignsKeyboard(),
});

export const campaignList = async (ctx, status) => {
  const items = await listCampaigns(ctx.business._id, status);
  return listView(
    status ? `${status[0].toUpperCase()}${status.slice(1)} Campaigns` : "All Campaigns",
    items.map((item) => ({
      name: item.name,
      status: item.status,
      recipients: item.recipients.length,
    })),
    (item) => `• ${item.name} — ${item.status} (${item.recipients} recipients)`,
    "campaign",
  );
};
export const audiences = () => ({
  text: "<b>Audience</b>\n\nGroups and channels show chats the bot has verified it can message. Create Audience lets you choose user contacts; users must have started a conversation with the bot before direct messages can be sent.",
  keyboard: audienceKeyboard(),
});

export const recipientList = async (ctx, destinationType) => {
  const recipients = await Recipient.find({
    business: ctx.business._id,
    destinationType,
    sendingEligible: true,
  }).sort({ displayName: 1 }).lean();
  const title = destinationType === "group" ? "Telegram Groups" : "Telegram Channels";
  return {
    text: `<b>${title}</b>\n\n${recipients.length
      ? recipients.map((recipient) => `• ${recipient.displayName}`).join("\n")
      : `No verified ${destinationType === "group" ? "groups" : "channels"} found. Add the bot to a chat first, then return here.`}`,
    keyboard: backMenuKeyboard("nav:audience"),
  };
};
export const templates = async (ctx) =>
  listView(
    "Templates",
    await Template.find({ business: ctx.business._id }).sort({ createdAt: -1 }).limit(50).lean(),
    (item) => `• ${item.name}\n  ${item.content.slice(0, 120)}`,
    "template",
  );

export const savedAudiences = async (ctx) =>
  listView(
    "Saved Audiences",
    await Audience.find({ business: ctx.business._id }).sort({ createdAt: -1 }).limit(50).lean(),
    (item) => `• ${item.name} — ${item.recipients.length} recipients`,
    "audience",
  );

export const createAudience = () => ({
  text: "<b>Create Audience</b>\n\nChoose user contacts to add as eligible recipients. Telegram only allows contacts who have granted access to this bot.",
  keyboard: backMenuKeyboard("nav:audience"),
});

export const campaignAudiences = async (ctx) => {
  const audiences = await Audience.find({ business: ctx.business._id })
    .populate({ path: "recipients", match: { sendingEligible: true }, select: "displayName" })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  return {
    text: `<b>Select a saved audience</b>\n\n${audiences.length ? "Choose an audience below." : "No saved audiences are available."}`,
    keyboard: campaignAudienceKeyboard(audiences),
  };
};

export const scheduled = async (ctx) => {
  const [upcoming, completed, cancelled] = await Promise.all([
    Campaign.countDocuments({ business: ctx.business._id, status: "scheduled", scheduledFor: { $gt: new Date() } }),
    Campaign.countDocuments({ business: ctx.business._id, status: "completed" }),
    Campaign.countDocuments({ business: ctx.business._id, status: "cancelled" }),
  ]);
  return {
    text: `<b>Scheduled Messages</b>\n\nUpcoming: ${upcoming}\nCompleted: ${completed}\nCancelled: ${cancelled}\n\nScheduled campaigns are stored for review. Automatic dispatch is disabled.`,
    keyboard: backMenuKeyboard(),
  };
};

export const analytics = async (ctx, range = "all") => {
  const stats = await getBusinessAnalytics(ctx.business._id, range);
  return {
    text: `<b>Analytics</b>\n\nCampaigns: ${stats.campaigns}\nMessages attempted: ${stats.attempted}\nSuccessful deliveries: ${stats.successful}\nFailed deliveries: ${stats.failed}\nPending deliveries: ${stats.pending}\nDelivery success rate: ${stats.successRate}%\n\nFilter: ${range}`,
    keyboard: analyticsKeyboard(),
  };
};

export const subscription = async (ctx) => {
  const [current, plans] = await Promise.all([
    getBusinessSubscription(ctx.business._id),
    getActivePlans(),
  ]);
  const status = current?.expiresAt > new Date() ? current.status : "expired";
  const planName = current?.plan?.name || "Free";
  const expiry = current?.expiresAt ? current.expiresAt.toISOString() : "No expiry";
  return {
    text: `<b>Subscription</b>\n\nCurrent plan: ${planName}\nStatus: ${status}\nExpiry date: ${expiry}\n\nSelect a plan to open a secure Paystack checkout. Subscription activation only occurs after verified payment.`,
    keyboard: subscriptionKeyboard(plans),
  };
};

export const subscriptionPlans = async () => {
  const plans = await getActivePlans();
  return {
    text: `<b>Available plans</b>\n\n${plans.map((plan) => `• ${plan.name}: ₦${plan.price.toLocaleString()} / ${plan.durationDays} days\n  Campaigns: ${plan.usageLimits.campaigns ?? "—"} | Messages: ${plan.usageLimits.messages ?? "—"}\n  Features: ${plan.entitlements.join(", ")}`).join("\n\n")}`,
    keyboard: subscriptionKeyboard(plans),
  };
};

export const paymentHistory = async (ctx) => {
  const payments = await getPaymentHistory(ctx.business._id);
  return {
    text: `<b>Payment history</b>\n\n${payments.length ? payments.map((payment) => `• ${payment.paystackReference} — ${payment.status} — ₦${payment.amount.toLocaleString()}`).join("\n") : "No payments recorded."}`,
    keyboard: backMenuKeyboard("nav:subscription"),
  };
};

export const settings = () => ({
  text: "<b>Settings</b>\n\nManage your workspace preferences.",
  keyboard: backMenuKeyboard("nav:main"),
});

export const help = () => ({
  text: "<b>Help & Support</b>\n\nChoose a topic to get started:\n• Getting Started\n• How Campaigns Work\n• How to Connect Telegram\n• Subscription Guide\n• Frequently Asked Questions\n• Contact Support",
  keyboard: backMenuKeyboard(),
});
