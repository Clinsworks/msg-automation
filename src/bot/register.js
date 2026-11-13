import { Telegraf } from "telegraf";
import { config } from "../config/env.js";
import { cancelCampaign, chooseDelivery, handleCampaignText, saveDraft, scheduleCampaign, selectAudience, selectMethod, selectRecipients, sendCampaign, showDelivery, showPreview, startCampaign } from "./campaign-flow.js";
import { addBotToGroupKeyboard, campaignMethodKeyboard, campaignRecipientsKeyboard, channelSelectionKeyboard, contactSelectionKeyboard, customerProductKeyboard, mainMenuKeyboard, orderReviewKeyboard } from "./keyboards.js";
import { audiences, analytics, campaigns, campaignAudiences, campaignList, createAudience, dashboard, help, mainMenu, orders, paymentDetails, paymentHistory, products, recipientList, savedAudiences, scheduled, settings, subscription, subscriptionPlans, templates } from "./views.js";
import { loadConversationState, saveConversationState } from "../modules/conversation-state/service.js";
import { ensureUserWorkspace } from "../modules/users/service.js";
import { listRecipients, registerRecipient, removeRecipient } from "../modules/recipients/service.js";
import { TelegramBotProvider } from "../modules/messaging/providers/telegram-bot-provider.js";
import { initializePayment } from "../modules/payments/service.js";
import { updateUserEmail } from "../modules/users/service.js";
import { getActivePlans } from "../modules/subscriptions/service.js";
import { beginConnection, completeConnection, disconnectPersonalAccount } from "../modules/telegram/connection-service.js";
import { findExpiringSubscription, getSubscriptionNotification } from "../modules/notifications/service.js";
import { BotInteraction, Business, Campaign, Order, PaymentDetails, Product, User } from "../database/models.js";
import { cancelAdminAuth, forgotAdminPassword, guide, handleAdminPassword, handleSuperadminPassword, isSuperadmin, requestAdminPassword, showAdminPanel, showGuide, startPasswordChange, startScreen, startSuperadminAuth } from "./auth-flow.js";
import { hashPassword } from "../modules/auth/password.js";
import { getStaffWorkspace, addStaffMember, listStaff, revokeStaffMember } from "../modules/staff/service.js";
import { createWinbackCampaign, findWinbackRecipients, recordInteraction } from "../modules/winback/service.js";
import { processCrossPostMessage, saveCrossPostRule, listCrossPostRules } from "../modules/crossposting/service.js";

const render = async (ctx, view, viewArgument = ctx.from) => {
  const { text, keyboard } = await view(viewArgument);
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", ...keyboard });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", ...keyboard });
  }
};

const runCampaignAction = (action) => async (ctx) => {
  try {
    await action(ctx);
  } catch (error) {
    console.error("Campaign action failed:", error);
    await ctx.answerCbQuery("Campaign action failed");
    await ctx.reply(`Unable to complete that campaign action: ${error.message}`);
  }
};

export const createBot = () => {
  if (!config.botToken) throw new Error("BOT_TOKEN is required to start the Telegram bot");
  const bot = new Telegraf(config.botToken);
  const provider = new TelegramBotProvider(bot.telegram);
  bot.use(async (ctx, next) => {
    if (!ctx.from) return next();
    const staffWorkspace = await getStaffWorkspace(ctx.from.id);
    const workspace = staffWorkspace || await ensureUserWorkspace(ctx.from);
    ctx.dbUser = workspace.user;
    ctx.business = workspace.business;
    ctx.session = await loadConversationState(ctx.from.id);
    if (staffWorkspace) {
      ctx.session.staffUnlocked = true;
      ctx.staffMembership = staffWorkspace.staff;
    }
    if (ctx.chat?.type === "private") {
      await recordInteraction({ businessId: ctx.business._id, telegramUserId: ctx.from.id, displayName: ctx.from.first_name });
    }
    await next();
    await saveConversationState(ctx.from.id, ctx.session);
  });
  bot.action(/^order:review:(.+)$/, async (ctx) => {
    const order = await Order.findOne({ _id: ctx.match[1], business: ctx.business._id }).populate("product", "name price");
    if (!order) { await ctx.answerCbQuery("Order not found"); return; }
    await ctx.answerCbQuery();
    await ctx.reply(`Order: ${order.product.name}\nCustomer: ${order.customerName || order.customerTelegramUserId}\nStatus: ${order.status}`, orderReviewKeyboard(order._id));
  });

  bot.use(async (ctx, next) => {
    if (!ctx.callbackQuery || ctx.session.adminUnlocked || ctx.session.superadminUnlocked || ctx.session.staffUnlocked) return next();
    const action = ctx.callbackQuery.data || "";
    if (
      ["start:admin", "start:guide", "auth:forgot", "auth:cancel"].includes(action)
      || action.startsWith("order:start:")
      || action.startsWith("order:catalog:")
    ) return next();
    await ctx.answerCbQuery("Open Admin Panel and enter your password first.");
  });

  bot.use(async (ctx, next) => {
    const text = ctx.message?.text || "";
    const command = text.match(/^\/([a-z0-9_]+)/i)?.[1]?.toLowerCase();
    if (!command || ctx.session.adminUnlocked || ctx.session.superadminUnlocked || ctx.session.staffUnlocked || ["start", "help", "myid", "superadmin"].includes(command)) return next();
    await ctx.reply("Admin access is locked. Use /start and choose Admin Panel.");
  });

  bot.start(async (ctx) => {
    const payload = ctx.startPayload || "";
    if (payload.startsWith("add_recipient_")) {
      const ownerId = payload.slice("add_recipient_".length);
      if (String(ctx.from.id) !== ownerId) {
        await ctx.reply("Only the user who started this add flow can register this chat.");
        return;
      }
      if (!["group", "supergroup", "channel"].includes(ctx.chat?.type)) {
        await ctx.reply("Open the Add Bot link and select a group or channel to continue.");
        return;
      }
      try {
        const recipient = await registerRecipient({ businessId: ctx.business._id, destinationId: ctx.chat.id, provider });
        await ctx.reply(`✅ ${recipient.displayName} was added as a recipient.\nThe bot has verified its permissions and can send messages to this chat.`);
      } catch (error) {
        await ctx.reply(error.code === "INELIGIBLE_DESTINATION"
          ? error.message
          : "The bot was added, but could not verify permission to send messages in this chat.");
      }
      return;
    }
    await render(ctx, startScreen, ctx);
    const expiring = await findExpiringSubscription(ctx.business._id);
    if (expiring) await ctx.reply(getSubscriptionNotification(expiring));
  });
  bot.command("menu", async (ctx) => {
    if (!ctx.session.adminUnlocked && !ctx.session.superadminUnlocked) {
      await ctx.reply("Admin access is locked. Use /start and choose Admin Panel.");
      return;
    }
    await render(ctx, mainMenu, ctx);
  });
  bot.command("help", (ctx) => render(ctx, help));
  bot.command("winbackoptout", async (ctx) => {
    await recordInteraction({ businessId: ctx.business._id, telegramUserId: ctx.from.id, displayName: ctx.from.first_name });
    await ctx.reply("You will not receive future win-back messages.");
    await BotInteraction.updateOne({ business: ctx.business._id, telegramUserId: String(ctx.from.id) }, { $set: { optedOut: true } });
  });
  bot.command("superadmin", startSuperadminAuth);
  bot.hears("Admin Panel", showAdminPanel);
  bot.hears("Guide", showGuide);
  bot.hears("Support", (ctx) => render(ctx, help));
  bot.hears("Cancel", (ctx) => ctx.reply("Chat selection cancelled."));
  bot.on("photo", async (ctx, next) => {
    if (!ctx.session.order) return next();
    const order = await Order.findById(ctx.session.order.orderId).populate("product", "name");
    if (!order || String(order.customerTelegramUserId) !== String(ctx.from.id)) {
      await ctx.reply("This order is no longer available.");
      return;
    }
    order.receiptFileId = ctx.message.photo.at(-1).file_id;
    order.receiptText = ctx.message.caption || "";
    order.status = "pending_approval";
    await order.save();
    delete ctx.session.order;
    const business = await Business.findById(order.business).select("owner").lean();
    const owner = business?.owner ? await User.findById(business.owner).lean() : null;
    if (owner?.telegramUserId) {
      await ctx.telegram.sendMessage(owner.telegramUserId, `🧾 New order pending approval\nProduct: ${order.product.name}\nCustomer: ${ctx.from.first_name || ctx.from.id}`, orderReviewKeyboard(order._id));
    }
    await ctx.reply("Receipt received. The seller will review your order and notify you.");
  });
  bot.on("message", async (ctx, next) => {
    const sharedUsers = ctx.message?.users_shared?.user_ids || [];
    if (sharedUsers.length) {
      const results = await Promise.allSettled(sharedUsers.map((destinationId) =>
        registerRecipient({ businessId: ctx.business._id, destinationId, provider })
      ));
      const saved = results.filter((result) => result.status === "fulfilled").length;
      const rejected = results.length - saved;
      await ctx.reply(
        `Added ${saved} contact${saved === 1 ? "" : "s"} to recipients.${rejected ? ` ${rejected} contact${rejected === 1 ? "" : "s"} could not be verified by the bot.` : ""}`,
        { reply_markup: { remove_keyboard: true } }
      );
      return;
    }
    const shared = ctx.message?.chat_shared;
    if (shared) {
      try {
        const recipient = await registerRecipient({ businessId: ctx.business._id, destinationId: shared.chat_id, provider });
        await ctx.reply(`Recipient saved: ${recipient.displayName}\nType: ${recipient.destinationType}`, { reply_markup: { remove_keyboard: true } });
      } catch (error) {
        await ctx.reply(error.code === "INELIGIBLE_DESTINATION" ? error.message : "Unable to add the selected chat.");
      }
      return;
    }
    if (ctx.chat?.type === "group" || ctx.chat?.type === "supergroup" || ctx.chat?.type === "channel") {
      const text = ctx.message?.text || ctx.message?.caption;
      if (text) await processCrossPostMessage({ businessId: ctx.business._id, sourceChatId: ctx.chat.id, text, provider });
    }
    return next();
  });
  bot.on("text", async (ctx, next) => {
    if (await handleSuperadminPassword(ctx)) return;
    if (await handleAdminPassword(ctx)) return;
    if (ctx.session.product) {
      const product = ctx.session.product;
      if (product.step === "name") {
        product.name = ctx.message.text.trim();
        product.step = "description";
        await ctx.reply("Send the product description.");
      } else if (product.step === "description") {
        product.description = ctx.message.text.trim();
        product.step = "price";
        await ctx.reply("Send the product price in naira.");
      } else if (product.step === "price") {
        const price = Number(ctx.message.text.trim());
        if (!Number.isFinite(price) || price < 0) { await ctx.reply("Send a valid non-negative price."); return; }
        product.price = price;
        product.step = "stock";
        await ctx.reply("Send the stock quantity, or type unlimited.");
      } else if (product.step === "stock") {
        const stock = /^unlimited$/i.test(ctx.message.text.trim()) ? undefined : Number(ctx.message.text.trim());
        if (stock !== undefined && (!Number.isInteger(stock) || stock < 0)) { await ctx.reply("Send a whole-number stock quantity or unlimited."); return; }
        await Product.create({ business: ctx.business._id, name: product.name, description: product.description, price: product.price, stock });
        delete ctx.session.product;
        await ctx.reply("Product saved.", mainMenuKeyboard());
      }
      return;
    }
    if (ctx.session.paymentDetails) {
      const details = ctx.session.paymentDetails;
      const value = ctx.message.text.trim();
      if (details.step === "bankName") {
        details.bankName = value;
        details.step = "accountName";
        await ctx.reply("Send the account name.");
      } else if (details.step === "accountName") {
        details.accountName = value;
        details.step = "accountNumber";
        await ctx.reply("Send the account number.");
      } else if (details.step === "accountNumber") {
        details.accountNumber = value;
        details.step = "paymentReference";
        await ctx.reply("Send the payment instructions or reference.");
      } else {
        details.paymentReference = value;
        await PaymentDetails.findOneAndUpdate(
          { business: ctx.business._id },
          { $set: details },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        delete ctx.session.paymentDetails;
        await ctx.reply("Payment details saved.", mainMenuKeyboard());
      }
      return;
    }
    if (ctx.session.staffInvite) {
      const invite = ctx.session.staffInvite;
      if (invite.step === "telegramUserId") {
        if (!/^\d+$/.test(ctx.message.text.trim())) {
          await ctx.reply("Send a numeric Telegram user ID.");
          return;
        }
        invite.telegramUserId = ctx.message.text.trim();
        invite.step = "role";
        await ctx.reply("Send the role: manager, marketer, or support.");
      } else {
        const role = ctx.message.text.trim().toLowerCase();
        if (!["manager", "marketer", "support"].includes(role)) {
          await ctx.reply("Role must be manager, marketer, or support.");
          return;
        }
        await addStaffMember({ businessId: ctx.business._id, telegramUserId: invite.telegramUserId, role, displayName: invite.telegramUserId });
        delete ctx.session.staffInvite;
        await ctx.reply("Staff member added. They can use /start and access this business workspace.");
      }
      return;
    }
    if (ctx.session.winback) {
      const winback = ctx.session.winback;
      if (winback.step === "message") {
        winback.message = ctx.message.text.trim();
        winback.step = "button";
        await ctx.reply("Send the button label, or send none.");
      } else if (winback.step === "button") {
        winback.buttonLabel = /^none$/i.test(ctx.message.text.trim()) ? undefined : ctx.message.text.trim();
        winback.step = "inactiveDays";
        await ctx.reply("How many inactive days should qualify a customer? Send a whole number.");
      } else {
        const inactiveDays = Number(ctx.message.text.trim());
        if (!Number.isInteger(inactiveDays) || inactiveDays < 1) {
          await ctx.reply("Send a whole number of at least 1.");
          return;
        }
        const recipients = await findWinbackRecipients(ctx.business._id, inactiveDays);
        for (const recipient of recipients) {
          const options = winback.buttonLabel
            ? { reply_markup: { inline_keyboard: [[{ text: winback.buttonLabel, callback_data: `order:catalog:${ctx.business._id}` }]] } }
            : {};
          await provider.sendMessage(recipient.telegramUserId, winback.message, options);
        }
        await createWinbackCampaign({ business: ctx.business._id, message: winback.message, buttonLabel: winback.buttonLabel, inactiveDays, status: "sent", sentCount: recipients.length });
        delete ctx.session.winback;
        await ctx.reply(`Win-back message sent to ${recipients.length} eligible customer(s).`, mainMenuKeyboard());
      }
      return;
    }
    if (ctx.session.crossPost) {
      const crossPost = ctx.session.crossPost;
      if (crossPost.step === "sourceChatId") {
        crossPost.sourceChatId = ctx.message.text.trim();
        crossPost.step = "destinations";
        await ctx.reply("Send recipient record IDs separated by commas.");
      } else {
        const destinationIds = ctx.message.text.split(",").map((value) => value.trim()).filter(Boolean);
        await saveCrossPostRule({ businessId: ctx.business._id, sourceChatId: crossPost.sourceChatId, destinationIds, mode: "copy" });
        delete ctx.session.crossPost;
        await ctx.reply("Cross-post rule saved. New messages from that source will be copied to the selected destinations.", mainMenuKeyboard());
      }
      return;
    }
    if (ctx.session.passwordChange) {
      const passwordChange = ctx.session.passwordChange;
      if (passwordChange.step === "new") {
        if (ctx.message.text.length < 8) {
          await ctx.reply("Password must be at least 8 characters.");
          return;
        }
        passwordChange.password = ctx.message.text;
        passwordChange.step = "confirm";
        await ctx.reply("Send the new password again to confirm it.");
      } else if (passwordChange.password !== ctx.message.text) {
        delete ctx.session.passwordChange;
        await ctx.reply("Passwords did not match. Start again from Change password.");
      } else {
        const business = await Business.findById(ctx.business._id).select("+adminPasswordHash");
        if (!business) throw new Error("Business was not found.");
        business.adminPasswordHash = await hashPassword(passwordChange.password);
        business.adminPasswordChangedAt = new Date();
        await business.save();
        delete ctx.session.passwordChange;
        await ctx.reply("Admin password changed successfully.", mainMenuKeyboard());
      }
      return;
    }
    if (!(await handleCampaignText(ctx))) await next();
  });
  bot.command("setemail", async (ctx) => {
    const email = ctx.message.text.split(/\s+/)[1];
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await ctx.reply("Usage: /setemail <billing_email>");
      return;
    }
    ctx.dbUser = await updateUserEmail(ctx.dbUser._id, email);
    await ctx.reply("Billing email saved securely.");
  });
  bot.command("connecttelegram", async (ctx) => {
    const phoneNumber = ctx.message.text.split(/\s+/)[1];
    if (!phoneNumber) {
      await ctx.reply("Usage: /connecttelegram +2348012345678");
      return;
    }
    try {
      await beginConnection({ businessId: ctx.business._id, phoneNumber });
      ctx.session.telegramAuth = { step: "code" };
      await ctx.reply("Telegram sent a verification code. Reply with /telegramcode <code>. Never share this code with anyone.");
    } catch (error) {
      await ctx.reply(`Unable to start Telegram connection: ${error.message}`);
    }
  });
  bot.command("telegramcode", async (ctx) => {
    const code = ctx.message.text.split(/\s+/)[1];
    if (!code) {
      await ctx.reply("Usage: /telegramcode <verification_code>");
      return;
    }
    try {
      const account = await completeConnection({ businessId: ctx.business._id, phoneCode: code });
      delete ctx.session.telegramAuth;
      await ctx.reply(`Personal Telegram account connected: @${account.username || "account"}`);
    } catch (error) {
      await ctx.reply(`Unable to complete Telegram connection: ${error.message}`);
    }
  });
  bot.command("disconnecttelegram", async (ctx) => {
    await disconnectPersonalAccount(ctx.business._id);
    await ctx.reply("Personal Telegram account disconnected and its stored session was removed.");
  });
  bot.command("myid", (ctx) => ctx.reply(`Your Telegram user ID is ${ctx.from.id}.`));
  bot.command("addrecipient", async (ctx) => {
    const destinationId = ctx.message.text.split(/\s+/)[1];
    if (!destinationId) {
      await ctx.reply("Usage: /addrecipient <telegram_chat_id>");
      return;
    }
    try {
      const recipient = await registerRecipient({ businessId: ctx.business._id, destinationId, provider });
      await ctx.reply(`Recipient saved: ${recipient.displayName}\nType: ${recipient.destinationType}\nSending eligibility: ${recipient.sendingEligible ? "Eligible" : "Not eligible"}`);
    } catch (error) {
      if (error.code === "INELIGIBLE_DESTINATION") {
        await ctx.reply(error.message);
        return;
      }
      throw error;
    }
  });
  bot.command("recipients", async (ctx) => {
    const recipients = await listRecipients(ctx.business._id, { sendingEligible: true });
    const text = recipients.length
      ? recipients.map((recipient) => `• ${recipient.displayName} (${recipient.destinationType})`).join("\n")
      : "No eligible recipients have been added.";
    await ctx.reply(`<b>Eligible recipients</b>\n\n${text}`, { parse_mode: "HTML" });
  });
  bot.command("removerecipient", async (ctx) => {
    const destinationId = ctx.message.text.split(/\s+/)[1];
    if (!destinationId) {
      await ctx.reply("Usage: /removerecipient <telegram_chat_id>");
      return;
    }
    const recipient = await removeRecipient(ctx.business._id, destinationId);
    await ctx.reply(recipient ? "Recipient disabled for sending." : "Recipient was not found.");
  });
  bot.action("start:admin", requestAdminPassword);
  bot.action("start:guide", guide);
  bot.action("auth:forgot", forgotAdminPassword);
  bot.action("auth:cancel", cancelAdminAuth);

  bot.action("nav:main", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, mainMenu, ctx); });
  bot.action("product:list", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, products, ctx); });
  bot.action("product:add", async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.product = { step: "name" };
    await ctx.reply("Send the product name.");
  });
  bot.action("order:pending", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, () => orders(ctx, "pending_approval"), ctx); });
  bot.action("order:approved", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, () => orders(ctx, "approved"), ctx); });
  bot.action("payment:details", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, () => paymentDetails(ctx), ctx); });
  bot.action("payment:edit", async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.paymentDetails = { step: "bankName" };
    await ctx.reply("Send the bank name.");
  });
  bot.action("crosspost:menu", async (ctx) => {
    await ctx.answerCbQuery();
    const rules = await listCrossPostRules(ctx.business._id);
    await ctx.reply(
      rules.length
        ? `📣 Cross-post rules\n\n${rules.map((rule) => `• ${rule.sourceChatId} → ${rule.destinationRecipients.length} destination(s) (${rule.active ? "active" : "paused"})`).join("\n")}`
        : "📣 No cross-post rules configured.",
      { reply_markup: { inline_keyboard: [[{ text: "Create rule", callback_data: "crosspost:create" }], [{ text: "Main Menu", callback_data: "nav:main" }]] } },
    );
  });
  bot.action("crosspost:create", async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.crossPost = { step: "sourceChatId" };
    await ctx.reply("Send the source Telegram chat ID. The bot must be a member of that chat.");
  });
  bot.action("winback:menu", async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.winback = { step: "message" };
    await ctx.reply("Send the win-back message. Only users who interacted with this bot and have been inactive will be contacted.");
  });
  bot.action("settings:staff", async (ctx) => {
    if (ctx.staffMembership) {
      await ctx.answerCbQuery("Only the business owner can manage staff.", { show_alert: true });
      return;
    }
    const staff = await listStaff(ctx.business._id);
    await ctx.answerCbQuery();
    ctx.session.staffInvite = { step: "telegramUserId" };
    await ctx.reply(`${staff.length ? `Current active staff: ${staff.map((item) => `${item.displayName || item.telegramUserId} (${item.role})`).join(", ")}\n\n` : ""}Send the Telegram user ID to add, or use /staffremove <id> to revoke access.`);
  });
  bot.command("staffremove", async (ctx) => {
    if (ctx.staffMembership) { await ctx.reply("Only the business owner can manage staff."); return; }
    const telegramUserId = ctx.message.text.split(/\s+/)[1];
    if (!telegramUserId) { await ctx.reply("Usage: /staffremove <telegram_user_id>"); return; }
    await revokeStaffMember(ctx.business._id, telegramUserId);
    await ctx.reply("Staff access revoked.");
  });
  bot.action("settings:password", startPasswordChange);
  bot.action("auth:lock", async (ctx) => { delete ctx.session.adminUnlocked; delete ctx.session.superadminUnlocked; await ctx.answerCbQuery("Panel locked"); await ctx.reply("Admin panel locked. Use Admin Panel to unlock it again."); });
  bot.action(/^order:start:(.+)$/, async (ctx) => {
    const product = await Product.findById(ctx.match[1]).lean();
    if (!product?.active) { await ctx.answerCbQuery("Product unavailable"); return; }
    const details = await PaymentDetails.findOne({ business: product.business }).lean();
    const order = await Order.create({ business: product.business, customerTelegramUserId: String(ctx.from.id), customerName: ctx.from.first_name, product: product._id });
    ctx.session.order = { orderId: String(order._id) };
    await ctx.answerCbQuery("Order started");
    await ctx.reply(`🛒 <b>${product.name}</b>\nPrice: ₦${product.price.toLocaleString()}\n\nPay using:\nBank: ${details?.bankName || "Not configured"}\nAccount name: ${details?.accountName || "Not configured"}\nAccount number: ${details?.accountNumber || "Not configured"}\nReference: ${details?.paymentReference || "Include your product name"}\n\nSend your payment receipt as a photo with the product name in the caption.`, { parse_mode: "HTML" });
  });
  bot.action(/^order:catalog:(.+)$/, async (ctx) => {
    const items = await Product.find({ business: ctx.match[1], active: true }).sort({ createdAt: -1 }).limit(50).lean();
    await ctx.answerCbQuery();
    if (!items.length) {
      await ctx.reply("No products are currently available.");
      return;
    }
    await ctx.reply(`<b>Choose a product</b>\n\n${items.map((item) => `• ${item.name} — ₦${item.price.toLocaleString()}\n${item.description || ""}`).join("\n\n")}`, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: items.map((item) => [{ text: `🛒 ${item.name}`, callback_data: `order:start:${item._id}` }]),
      },
    });
  });
  bot.action(/^order:(approve|reject):(.+)$/, async (ctx) => {
    const order = await Order.findOne({ _id: ctx.match[2], business: ctx.business._id }).populate("product", "name");
    if (!order || order.status !== "pending_approval") { await ctx.answerCbQuery("Order is no longer pending"); return; }
    order.status = ctx.match[1] === "approve" ? "approved" : "rejected";
    await order.save();
    await ctx.answerCbQuery(order.status === "approved" ? "Approved" : "Rejected");
    await ctx.telegram.sendMessage(order.customerTelegramUserId, `Your order for ${order.product.name} was ${order.status}.`);
    await ctx.editMessageText(`Order for ${order.product.name}: ${order.status}.`);
  });
  bot.action("nav:dashboard", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, dashboard, ctx); });
  bot.action("nav:campaigns", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, campaigns); });
  bot.action("nav:audience", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, audiences); });
  bot.action("nav:scheduled", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, scheduled, ctx); });
  bot.action("nav:templates", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, templates, ctx); });
  bot.action("nav:analytics", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, analytics, ctx); });
  for (const range of ["today", "7d", "30d", "all"]) {
    bot.action(`analytics:${range}`, async (ctx) => {
      await ctx.answerCbQuery();
      await render(ctx, () => analytics(ctx, range), ctx);
    });
  }
  bot.action("nav:subscription", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, () => subscription(ctx), ctx); });
  bot.action("nav:settings", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, settings); });
  bot.action("nav:help", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, help); });
  bot.action("subscription:plans", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, subscriptionPlans); });
  bot.action("subscription:history", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, () => paymentHistory(ctx), ctx); });
  bot.action(/^subscription:buy:(.+)$/, async (ctx) => {
    try {
      const plans = await getActivePlans();
      const plan = plans.find((item) => String(item._id) === ctx.match[1]);
      if (!plan) throw new Error("Selected plan is no longer available.");
      const result = await initializePayment({
        businessId: ctx.business._id,
        userEmail: ctx.dbUser.email,
        planId: plan._id
      });
      await ctx.answerCbQuery("Checkout created");
      await ctx.editMessageText(`<b>${plan.name} checkout</b>\n\nAmount: ₦${plan.price.toLocaleString()}\n\nComplete payment securely here:\n${result.checkoutUrl}\n\nYour subscription activates only after Paystack verification.`, { parse_mode: "HTML", ...mainMenuKeyboard() });
    } catch (error) {
      await ctx.answerCbQuery("Unable to create checkout");
      await ctx.reply(error.message);
    }
  });

  bot.action("campaign:create", async (ctx) => { await ctx.answerCbQuery(); await startCampaign(ctx); });
  bot.action("campaign:list", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, () => campaignList(ctx), ctx); });
  for (const [label, status] of [["drafts", "draft"], ["active", "active"], ["scheduled", "scheduled"], ["completed", "completed"], ["failed", "failed"]]) {
    bot.action(`campaign:${label}`, async (ctx) => { await ctx.answerCbQuery(); await render(ctx, () => campaignList(ctx, status), ctx); });
  }
  bot.action("campaign:method:standard", async (ctx) => { await ctx.answerCbQuery(); await selectMethod(ctx, "Standard Bot"); });
  bot.action("campaign:method:premium", async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.campaign.method = "Premium Personal Account";
    await ctx.editMessageText("<b>Premium sending</b>\n\nYour Pro entitlement is active. A connected personal Telegram account is required before sending.", { parse_mode: "HTML", ...campaignRecipientsKeyboard() });
  });
  bot.action("campaign:recipient:individual", async (ctx) => selectRecipients(ctx, "user"));
  bot.action("campaign:recipient:audience", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, campaignAudiences, ctx); });
  bot.action(/^campaign:audience:(.+)$/, async (ctx) => {
    try {
      await selectAudience(ctx, ctx.match[1]);
    } catch (error) {
      await ctx.answerCbQuery("Unable to select audience");
      await ctx.reply(error.message);
    }
  });
  bot.action("campaign:recipient:groups", async (ctx) => selectRecipients(ctx, "group"));
  bot.action("campaign:recipient:channels", async (ctx) => selectRecipients(ctx, "channel"));
  bot.action("campaign:recipient:all", async (ctx) => selectRecipients(ctx, "all"));
  bot.action("campaign:recipient:none", async (ctx) => selectRecipients(ctx, "none"));
  bot.action("campaign:delivery", async (ctx) => { await ctx.answerCbQuery(); await showDelivery(ctx); });
  bot.action("campaign:delivery:now", async (ctx) => { await ctx.answerCbQuery(); await chooseDelivery(ctx, "now"); });
  bot.action("campaign:delivery:schedule", async (ctx) => { await ctx.answerCbQuery(); await chooseDelivery(ctx, "schedule"); });
  bot.action("campaign:delivery:draft", async (ctx) => { await ctx.answerCbQuery(); await chooseDelivery(ctx, "draft"); });
  bot.action("campaign:confirm:send", runCampaignAction((ctx) => sendCampaign(ctx, provider)));
  bot.action("campaign:confirm:schedule", runCampaignAction(scheduleCampaign));
  bot.action("campaign:confirm:draft", runCampaignAction(saveDraft));
  bot.action("campaign:back:name", async (ctx) => { await ctx.answerCbQuery(); await ctx.editMessageText("Send a campaign name.", { parse_mode: "HTML" }); ctx.session.campaign.step = "name"; });
  bot.action("campaign:back:method", async (ctx) => { await ctx.answerCbQuery(); await ctx.editMessageText("Choose a sending method.", { parse_mode: "HTML", ...campaignMethodKeyboard() }); ctx.session.campaign.step = "method"; });
  bot.action("campaign:back:recipients", async (ctx) => { await ctx.answerCbQuery(); await ctx.editMessageText("Select recipients.", { parse_mode: "HTML", ...campaignRecipientsKeyboard() }); ctx.session.campaign.step = "recipients"; });
  bot.action("campaign:back:message", async (ctx) => { await ctx.answerCbQuery(); await ctx.editMessageText("Send the updated message content.", { parse_mode: "HTML" }); ctx.session.campaign.step = "message"; });
  bot.action("flow:cancel", cancelCampaign);

  bot.action(/^(campaign|audience|template):page:/, async (ctx) => { await ctx.answerCbQuery("There are no more mock pages."); });
  bot.action("audience:add:current", async (ctx) => {
    try {
      const recipient = await registerRecipient({ businessId: ctx.business._id, destinationId: ctx.from.id, provider });
      await ctx.answerCbQuery("Current chat added");
      await ctx.editMessageText(`Recipient saved: ${recipient.displayName}`, { parse_mode: "HTML", ...mainMenuKeyboard() });
    } catch (error) {
      await ctx.answerCbQuery(error.code === "INELIGIBLE_DESTINATION" ? error.message : "Unable to add this chat");
      if (error.code !== "INELIGIBLE_DESTINATION") throw error;
    }
  });
  bot.action("audience:add:group", async (ctx) => {
    await ctx.answerCbQuery();
    const { username } = await provider.getConnectionStatus();
    if (!username) {
      await ctx.reply("The bot username is unavailable. Try again after the bot is connected.");
      return;
    }
    await ctx.reply("Choose a group from Telegram. Confirm adding the bot and grant it permission to send messages. The bot will register the chat automatically.", addBotToGroupKeyboard(username, ctx.from.id));
  });
  bot.action("audience:add:channel-help", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply("Add the bot as an administrator with permission to post, then select the channel below.", channelSelectionKeyboard());
  });
  for (const type of ["group", "channel"]) {
    bot.action(`audience:list:${type}`, async (ctx) => {
      await ctx.answerCbQuery();
      await render(ctx, () => recipientList(ctx, type), ctx);
    });
  }
  bot.action("audience:saved", async (ctx) => { await ctx.answerCbQuery(); await render(ctx, savedAudiences, ctx); });
  bot.action("audience:create", async (ctx) => {
    await ctx.answerCbQuery();
    await render(ctx, createAudience, ctx);
    await ctx.reply("Select the user contacts you want to add.", contactSelectionKeyboard());
  });
  bot.catch(async (error, ctx) => {
    console.error("Telegram bot error:", error);
    try {
      if (ctx?.callbackQuery) await ctx.answerCbQuery("Something went wrong");
      if (ctx?.chat) await ctx.reply("Something went wrong while processing that action. Please try again.");
    } catch (notificationError) {
      console.error("Telegram error notification failed:", notificationError);
    }
  });
  return bot;
};
