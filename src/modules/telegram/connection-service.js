import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { TelegramConnection } from "../../database/models.js";
import { config } from "../../config/env.js";
import { decryptSession, encryptSession } from "./session-crypto.js";
import { NewMessage } from "telegram/events/index.js";
import { TelegramUserProvider } from "./user-provider.js";
import { processCrossPostMessage } from "../crossposting/service.js";

const pending = new Map();
const monitored = new Map();

const requireConfig = () => {
  if (!Number.isInteger(config.telegramApiId) || !config.telegramApiHash) {
    throw new Error("TELEGRAM_API_ID and TELEGRAM_API_HASH are required for personal Telegram connections");
  }
};

const createClient = (session = "") => {
  requireConfig();
  return new TelegramClient(new StringSession(session), config.telegramApiId, config.telegramApiHash, {
    connectionRetries: 3
  });
};

export const beginConnection = async ({ businessId, phoneNumber }) => {
  if (!phoneNumber?.startsWith("+")) throw new Error("Use an international phone number beginning with +.");
  if (pending.has(String(businessId))) throw new Error("A Telegram connection is already in progress.");

  const client = createClient();
  await client.connect();
  let resolveCode;
  let rejectCode;
  const codePromise = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  const authPromise = client.start({
    phoneNumber: async () => phoneNumber,
    phoneCode: async () => codePromise,
    password: async () => {
      throw new Error("Two-step verification requires the secure authorization flow and is not accepted in the bot.");
    },
    onError: rejectCode
  });
  pending.set(String(businessId), { client, phoneNumber, resolveCode, rejectCode, authPromise });
  await new Promise((resolve) => setTimeout(resolve, 250));
  return { status: "code_required" };
};

export const completeConnection = async ({ businessId, phoneCode }) => {
  const key = String(businessId);
  const attempt = pending.get(key);
  if (!attempt) throw new Error("No Telegram connection is waiting for a code.");
  if (!/^\d{4,8}$/.test(phoneCode || "")) throw new Error("Telegram verification codes contain digits only.");

  attempt.resolveCode(phoneCode);
  try {
    await attempt.authPromise;
    const session = attempt.client.session.save();
    const user = await attempt.client.getMe();
    await TelegramConnection.findOneAndUpdate(
      { business: businessId, connectionType: "personal" },
      {
        $set: {
          accountIdentifier: String(user.id),
          encryptedSession: encryptSession(session),
          status: "connected",
          lastSynchronizedAt: new Date()
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await startPersonalMonitoring({ businessId, client: attempt.client });
    return { accountIdentifier: String(user.id), username: user.username };
  } finally {
    pending.delete(key);
  }
};

export const startPersonalMonitoring = async ({ businessId, client }) => {
  const key = String(businessId);
  if (monitored.has(key)) return monitored.get(key);
  const handler = async (event) => {
    const text = event.message?.message;
    const sourceChatId = event.chatId?.toString?.() || event.message?.chatId?.toString?.();
    if (!text || !sourceChatId) return;
    const provider = new TelegramUserProvider(client);
    await processCrossPostMessage({ businessId, sourceChatId, text, provider });
  };
  client.addEventHandler(handler, new NewMessage({ incoming: true }));
  monitored.set(key, { client, handler });
  return client;
};

export const disconnectPersonalAccount = async (businessId) => {
  await TelegramConnection.updateOne(
    { business: businessId, connectionType: "personal" },
    { $set: { status: "disconnected", encryptedSession: null } }
  );
  pending.delete(String(businessId));
  const active = monitored.get(String(businessId));
  if (active) {
    active.client.removeEventHandler(active.handler);
    await active.client.disconnect();
    monitored.delete(String(businessId));
  }
};

export const getPersonalProvider = async (businessId) => {
  const connection = await TelegramConnection.findOne({
    business: businessId,
    connectionType: "personal",
    status: "connected"
  }).select("+encryptedSession");
  if (!connection?.encryptedSession) throw new Error("No connected personal Telegram account.");
  const client = createClient(decryptSession(connection.encryptedSession));
  await client.connect();
  return { client, connection };
};

export const restorePersonalMonitoring = async () => {
  const connections = await TelegramConnection.find({ connectionType: "personal", status: "connected" }).select("+encryptedSession");
  for (const connection of connections) {
    const client = createClient(decryptSession(connection.encryptedSession));
    await client.connect();
    await startPersonalMonitoring({ businessId: connection.business, client });
  }
};
