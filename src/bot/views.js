import {
  getMockAudiences,
  getMockCampaigns,
  getMockTemplates,
  getWorkspace,
} from "../mocks/workspace.js";
import {
  backMenuKeyboard,
  campaignsKeyboard,
  dashboardKeyboard,
  audienceKeyboard,
  mainMenuKeyboard,
  paginationKeyboard,
} from "./keyboards.js";
import { listCampaigns } from "../modules/campaigns/service.js";

export const mainMenu = (user) => {
  const workspace = getWorkspace(user);
  return {
    text: `WELCOME BACK, ${user?.first_name || "there"}!\n\nBusiness: ${workspace.businessName}\n\nHere's an overview of your messaging workspace.\n\n<b>Dashboard statistics</b>\n• Campaigns: ${workspace.stats.campaigns}\n• Messages sent: ${workspace.stats.sent}\n• Successful deliveries: ${workspace.stats.successful}\n• Failed deliveries: ${workspace.stats.failed}\n• Subscription: ${workspace.plan.name} (${workspace.plan.status})\n• Expiry: ${workspace.plan.expiry}`,
    keyboard: mainMenuKeyboard(),
  };
};

export const dashboard = (user) => {
  const workspace = getWorkspace(user);
  return {
    text: `<b>Dashboard</b>\n\nBusiness: ${workspace.businessName}\nAccount status: Active\nPlan: ${workspace.plan.name}\nCampaigns: ${workspace.stats.campaigns}\nMessages sent: ${workspace.stats.sent}\nSuccessful deliveries: ${workspace.stats.successful}\nFailed deliveries: ${workspace.stats.failed}\n\nUpcoming scheduled campaigns: ${workspace.upcoming.length}\n\n<i>These are mock values for Phase 1.</i>`,
    keyboard: dashboardKeyboard(),
  };
};

const listView = (title, items, formatter, prefix) => ({
  text: `<b>${title}</b>\n\n${items.length ? items.map(formatter).join("\n") : "No records found."}`,
  keyboard: paginationKeyboard(prefix, false),
});

export const campaigns = () => ({
  text: "<b>Campaigns</b>\n\nCreate and manage your messaging campaigns. Delivery is not active in this interface phase.",
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
  text: "<b>Audience</b>\n\nManage recipients and destinations that the bot is legitimately allowed to reach.\n\nThe bot cannot access a user's personal contacts. Add a current chat or use a Telegram chat where the bot has been added.",
  keyboard: audienceKeyboard(),
});
export const templates = () =>
  listView(
    "Templates",
    getMockTemplates(),
    (item) => `• ${item.name}\n  ${item.preview}`,
    "template",
  );

export const scheduled = () => ({
  text: "<b>Scheduled Messages</b>\n\nUpcoming: 1 mock campaign\nCompleted: 0\nCancelled: 0\n\nScheduling controls will connect to persistent campaigns in a later phase.",
  keyboard: backMenuKeyboard(),
});

export const analytics = () => ({
  text: "<b>Analytics</b>\n\nCampaigns: 0\nMessages attempted: 0\nSuccessful deliveries: 0\nFailed deliveries: 0\nDelivery success rate: 0%\n\nFilter: All time\n\n<i>Mock values are clearly identified and do not represent delivery activity.</i>",
  keyboard: backMenuKeyboard(),
});

export const subscription = () => ({
  text: "<b>Subscription</b>\n\nCurrent plan: Free\nStatus: Active\nStart date: Not available\nExpiry date: No expiry\nRemaining days: —\n\n<b>Available plans</b>\n• Free — interface access\n• Basic — configurable limits\n• Pro — premium sending method\n• Business — future plan\n\nPayment processing is not active in Phase 1.",
  keyboard: backMenuKeyboard(),
});

export const settings = () => ({
  text: "<b>Settings</b>\n\nManage your workspace preferences.",
  keyboard: backMenuKeyboard("nav:main"),
});

export const help = () => ({
  text: "<b>Help & Support</b>\n\nChoose a topic to get started:\n• Getting Started\n• How Campaigns Work\n• How to Connect Telegram\n• Subscription Guide\n• Frequently Asked Questions\n• Contact Support",
  keyboard: backMenuKeyboard(),
});
