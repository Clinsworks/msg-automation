import crypto from "node:crypto";
import { adminAuthKeyboard, mainMenuKeyboard, publicKeyboard, startKeyboard } from "./keyboards.js";
import { config } from "../config/env.js";
import { verifyPassword } from "../modules/auth/password.js";
import { Business } from "../database/models.js";

export const startScreen = (ctx) => ({
  text: `Welcome back, ${ctx.from?.first_name || "there"}!\n\nChoose an option below.`,
  keyboard: publicKeyboard(),
});

export const showAdminPanel = async (ctx) => {
  ctx.session.adminAuth = { step: "password" };
  await ctx.reply("🔒 Enter your admin password:", adminAuthKeyboard());
};

export const showGuide = async (ctx) => {
  await ctx.reply("<b>Guide</b>\n\n• Admin Panel: enter the business admin password to manage campaigns, recipients, subscriptions, and settings.\n• Add recipients with /addrecipient or from Audience.\n• Create campaigns from Campaigns.\n• Set a billing email with /setemail before checkout.\n• Personal Telegram sending requires a Pro plan and /connecttelegram.\n\nNever share your admin password, Telegram verification code, or session credentials.", {
    parse_mode: "HTML",
    ...publicKeyboard(),
  });
};

export const requestAdminPassword = async (ctx) => {
  ctx.session.adminAuth = { step: "password" };
  await ctx.answerCbQuery();
  await ctx.editMessageText("🔒 Enter your admin password:", { ...adminAuthKeyboard() });
};

export const handleAdminPassword = async (ctx) => {
  if (ctx.session.adminAuth?.step !== "password") return false;
  const valid = await verifyPassword(ctx.message.text, await getPasswordHash(ctx.business._id));
  if (!valid) {
    await ctx.reply("Incorrect admin password. Try again or choose Forgot password.");
    return true;
  }
  delete ctx.session.adminAuth;
  ctx.session.adminUnlocked = true;
  await ctx.reply("Admin access granted.", { ...mainMenuKeyboard() });
  return true;
};

export const startSuperadminAuth = async (ctx) => {
  if (!config.superadminPassword) {
    throw new Error("SUPERADMIN_PASSWORD is not configured.");
  }
  ctx.session.superadminAuth = { step: "password" };
  await ctx.reply("🔒 Enter the superadmin password:");
};

export const handleSuperadminPassword = async (ctx) => {
  if (ctx.session.superadminAuth?.step !== "password") return false;
  const supplied = Buffer.from(ctx.message.text);
  const expected = Buffer.from(config.superadminPassword || "");
  const valid = supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  if (!valid) {
    await ctx.reply("Incorrect superadmin password.");
    return true;
  }
  delete ctx.session.superadminAuth;
  ctx.session.superadminUnlocked = true;
  await ctx.reply("Superadmin access granted.");
  return true;
};


const getPasswordHash = async (businessId) => {
  const business = await Business.findById(businessId).select("+adminPasswordHash").lean();
  if (!business?.adminPasswordHash) throw new Error("Admin credentials are not configured.");
  return business.adminPasswordHash;
};

export const cancelAdminAuth = async (ctx) => {
  delete ctx.session.adminAuth;
  await ctx.answerCbQuery("Cancelled");
  await ctx.editMessageText("Choose an option below.", { ...startKeyboard() });
};

export const forgotAdminPassword = async (ctx) => {
  delete ctx.session.adminAuth;
  await ctx.answerCbQuery();
  await ctx.editMessageText("Password recovery requires support verification. Contact support with your Telegram account ID, then use /myid if needed.", {
    ...startKeyboard(),
  });
};

export const guide = async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText("<b>Guide</b>\n\n• Admin Panel: enter the business admin password to manage campaigns, recipients, subscriptions, and settings.\n• Add recipients with /addrecipient or from Audience.\n• Create campaigns from Campaigns.\n• Set a billing email with /setemail before checkout.\n• Personal Telegram sending requires a Pro plan and /connecttelegram.\n\nNever share your admin password, Telegram verification code, or session credentials.", {
    parse_mode: "HTML",
    ...startKeyboard(),
  });
};
