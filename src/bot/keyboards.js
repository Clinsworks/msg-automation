import { Markup } from "telegraf";

const button = (label, action) => Markup.button.callback(label, action);

export const mainMenuKeyboard = () => Markup.inlineKeyboard([
  [button("Dashboard", "nav:dashboard"), button("Campaigns", "nav:campaigns")],
  [button("Audience", "nav:audience"), button("Scheduled Messages", "nav:scheduled")],
  [button("Templates", "nav:templates"), button("Analytics", "nav:analytics")],
  [button("Subscription", "nav:subscription"), button("Settings", "nav:settings")],
  [button("Help & Support", "nav:help")]
]);

export const backMenuKeyboard = (back = "nav:main") => Markup.inlineKeyboard([
  [button("Back", back), button("Main Menu", "nav:main")]
]);

export const audienceKeyboard = () => Markup.inlineKeyboard([
  [button("All Recipients", "audience:list:all")],
  [button("Individual Contacts", "audience:list:user")],
  [button("Telegram Groups", "audience:list:group"), button("Telegram Channels", "audience:list:channel")],
  [button("Add Current Chat", "audience:add:current")],
  [button("Saved Audiences", "audience:saved"), button("Create Audience", "audience:create")],
  [button("Main Menu", "nav:main")]
]);

export const dashboardKeyboard = () => Markup.inlineKeyboard([
  [button("Create Campaign", "campaign:create"), button("View Campaigns", "campaign:list")],
  [button("Manage Audience", "nav:audience"), button("View Analytics", "nav:analytics")],
  [button("Manage Subscription", "nav:subscription")],
  [button("Refresh Dashboard", "nav:dashboard"), button("Main Menu", "nav:main")]
]);

export const campaignsKeyboard = () => Markup.inlineKeyboard([
  [button("Create New Campaign", "campaign:create")],
  [button("All Campaigns", "campaign:list")],
  [button("Draft Campaigns", "campaign:drafts"), button("Active Campaigns", "campaign:active")],
  [button("Scheduled Campaigns", "campaign:scheduled")],
  [button("Completed Campaigns", "campaign:completed"), button("Failed Campaigns", "campaign:failed")],
  [button("Main Menu", "nav:main")]
]);

export const campaignMethodKeyboard = () => Markup.inlineKeyboard([
  [button("Standard Bot Sending", "campaign:method:standard")],
  [button("Premium Personal Account", "campaign:method:premium")],
  [button("Back", "campaign:back:name"), button("Cancel", "flow:cancel")]
]);

export const campaignRecipientsKeyboard = () => Markup.inlineKeyboard([
  [button("Individual Recipients", "campaign:recipient:individual")],
  [button("Saved Audiences", "campaign:recipient:audience")],
  [button("Groups", "campaign:recipient:groups"), button("Channels", "campaign:recipient:channels")],
  [button("Select All", "campaign:recipient:all"), button("Deselect All", "campaign:recipient:none")],
  [button("Next", "campaign:delivery"), button("Back", "campaign:back:method")],
  [button("Cancel", "flow:cancel")]
]);

export const campaignDeliveryKeyboard = () => Markup.inlineKeyboard([
  [button("Send Immediately", "campaign:delivery:now")],
  [button("Schedule for Later", "campaign:delivery:schedule")],
  [button("Save as Draft", "campaign:delivery:draft")],
  [button("Back", "campaign:back:recipients"), button("Cancel", "flow:cancel")]
]);

export const campaignPreviewKeyboard = () => Markup.inlineKeyboard([
  [button("Confirm and Send", "campaign:confirm:send")],
  [button("Schedule Campaign", "campaign:confirm:schedule")],
  [button("Edit Message", "campaign:back:message"), button("Change Recipients", "campaign:back:recipients")],
  [button("Save Draft", "campaign:confirm:draft"), button("Cancel", "flow:cancel")]
]);

export const paginationKeyboard = (prefix, hasNext = true) => Markup.inlineKeyboard([
  [button("Previous", `${prefix}:page:prev`), button("Next", `${prefix}:page:${hasNext ? "next" : "end"}`)],
  [button("Back", "nav:main"), button("Main Menu", "nav:main")]
]);
