import { Markup } from "telegraf";

const button = (label, action) => Markup.button.callback(label, action);

export const mainMenuKeyboard = () => Markup.inlineKeyboard([
  [button("📊 Stats", "nav:dashboard"), button("📦 Products", "product:list")],
  [button("🧾 Pending approvals", "order:pending")],
  [button("📦 Approved orders", "order:approved")],
  [button("💳 Payment details", "payment:details")],
  [button("📞 Customer service", "nav:help")],
  [button("👥 Staff access", "settings:staff")],
  [button("📣 Cross-posting", "crosspost:menu")],
  [button("💌 Win-back", "winback:menu")],
  [button("⭐ Subscription", "nav:subscription")],
  [button("🔑 Change password", "settings:password"), button("🔒 Lock", "auth:lock")],
  [button("📖 Guide", "start:guide")]
]);

export const startKeyboard = () => Markup.inlineKeyboard([
  [button("Admin Panel", "start:admin"), button("Guide", "start:guide")],
]);

export const publicKeyboard = () => Markup.keyboard([
  ["Admin Panel", "Guide"],
  ["Support"],
]).resize();

export const menuOptionsKeyboard = () => Markup.inlineKeyboard([
  [button("Admin Panel", "start:admin"), button("Guide", "start:guide")],
]);

export const adminAuthKeyboard = () => Markup.inlineKeyboard([
  [button("Forgot password?", "auth:forgot")],
  [button("Cancel", "auth:cancel")],
]);

export const backMenuKeyboard = (back = "nav:main") => Markup.inlineKeyboard([
  [button("Back", back), button("Main Menu", "nav:main")]
]);

export const productsKeyboard = () => Markup.inlineKeyboard([
  [button("➕ Add product", "product:add")],
  [button("💳 Edit payment details", "payment:edit")],
  [button("Back to panel", "nav:main")],
]);

export const orderReviewKeyboard = (orderId) => Markup.inlineKeyboard([
  [button("✅ Approve", `order:approve:${orderId}`), button("❌ Reject", `order:reject:${orderId}`)],
]);

export const customerProductKeyboard = (productId) => Markup.inlineKeyboard([
  [button("🛒 Order", `order:start:${productId}`)],
]);

export const subscriptionKeyboard = (plans = []) => Markup.inlineKeyboard([
  ...plans.filter((plan) => plan.price > 0).map((plan) => [
    button(`${plan.name} - ₦${plan.price.toLocaleString()}`, `subscription:buy:${plan._id}`)
  ]),
  [button("View Plans", "subscription:plans")],
  [button("Payment History", "subscription:history"), button("Main Menu", "nav:main")]
]);

export const analyticsKeyboard = () => Markup.inlineKeyboard([
  [button("Today", "analytics:today"), button("Last 7 Days", "analytics:7d")],
  [button("Last 30 Days", "analytics:30d"), button("All Time", "analytics:all")],
  [button("Main Menu", "nav:main")],
]);

export const audienceKeyboard = () => Markup.inlineKeyboard([
  [button("Telegram Groups", "audience:list:group"), button("Telegram Channels", "audience:list:channel")],
  [button("Add Bot to a Group", "audience:add:group")],
  [button("Saved Audiences", "audience:saved"), button("Create Audience", "audience:create")],
  [button("Main Menu", "nav:main")]
]);

export const contactSelectionKeyboard = () => Markup.keyboard([
  [Markup.button.userRequest("Select User Contacts", 2001, { max_quantity: 20 })],
  ["Cancel"],
]).oneTime().resize();

export const channelSelectionKeyboard = () => Markup.keyboard([
  [Markup.button.channelRequest("Select Existing Channel", 1002, { request_title: true })],
  ["Cancel"],
]).oneTime().resize();

export const addBotToGroupKeyboard = (botUsername, ownerId) => Markup.inlineKeyboard([
  [Markup.button.url("Add Bot to a Group", `https://t.me/${botUsername}?startgroup=add_recipient_${ownerId}`)],
  [button("How to add a Channel", "audience:add:channel-help")],
  [button("Back to Audience", "nav:audience")],
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

export const campaignAudienceKeyboard = (audiences) => Markup.inlineKeyboard([
  ...audiences.map((audience) => [
    button(`${audience.name} (${audience.recipients.length})`, `campaign:audience:${audience._id}`),
  ]),
  [button("Back", "campaign:back:method"), button("Cancel", "flow:cancel")],
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
