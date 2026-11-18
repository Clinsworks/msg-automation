import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { TelegramConnection } from "../../database/models.js";
import { config } from "../../config/env.js";
import { decryptSession, encryptSession } from "./session-crypto.js";
import { NewMessage } from "telegram/events/index.js";
import { TelegramUserProvider } from "./user-provider.js";
import { processCrossPostMessage } from "../crossposting/service.js";
import { randomBytes } from "node:crypto";

const pending = new Map();
const monitored = new Map();
const twoFactorChallenges = new Map();

const toLoginUrl = (token) =>
  `tg://login?token=${Buffer.from(token).toString("base64url")}`;

const qrExpiredError = () => {
  const error = new Error("The Telegram QR code expired.");
  error.code = "TELEGRAM_QR_EXPIRED";
  return error;
};

const challengeExpiredError = () => {
  const error = new Error("The Telegram 2FA password page expired.");
  error.code = "TELEGRAM_2FA_CHALLENGE_EXPIRED";
  return error;
};

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

export const beginQrConnection = async ({ businessId, onQrCode, onTwoFactorRequired, onConnected, onError }) => {
  const key = String(businessId);
  if (pending.has(key)) throw new Error("A Telegram connection is already in progress.");

  const client = createClient();
  await client.connect();
  const authPromise = client.signInUserWithQrCode(
    { apiId: config.telegramApiId, apiHash: config.telegramApiHash },
    {
    qrCode: async ({ token, expires }) => {
      await onQrCode({ url: toLoginUrl(token), expires });
      // Stop before GramJS's 30-second refresh loop can issue another token.
      const remainingMs = Math.min(28000, Math.max(1000, expires * 1000 - Date.now() + 1000));
      await new Promise((resolve) => setTimeout(resolve, remainingMs));
      throw qrExpiredError();
    },
    password: async (hint) => {
      if (!onTwoFactorRequired) {
        const error = new Error("TELEGRAM_2FA_REQUIRED");
        error.code = "TELEGRAM_2FA_REQUIRED";
        throw error;
      }
      const token = randomBytes(32).toString("base64url");
      let timeout;
      const password = new Promise((resolve, reject) => {
        timeout = setTimeout(() => {
          twoFactorChallenges.delete(token);
          reject(challengeExpiredError());
        }, 10 * 60 * 1000);
        timeout.unref?.();
        twoFactorChallenges.set(token, { resolve, reject, businessId });
      });
      try {
        await onTwoFactorRequired({ token, hint });
        return await password;
      } finally {
        clearTimeout(timeout);
        twoFactorChallenges.delete(token);
      }
    },
    onError: async (error) => {
      throw error;
    }
    },
  );
  pending.set(key, { client, authPromise });
  authPromise
    .then(async () => {
      const session = client.session.save();
      const user = await client.getMe();
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
      await startPersonalMonitoring({ businessId, client });
      if (onConnected) await onConnected({ accountIdentifier: String(user.id), username: user.username });
    })
    .catch(async (error) => {
      if (onError) await onError(error);
      await client.disconnect().catch(() => {});
    })
    .finally(() => pending.delete(key));
  return { status: "qr_required" };
};

export const submitTwoFactorPassword = (token, password) => {
  const challenge = twoFactorChallenges.get(token);
  if (!challenge || typeof password !== "string" || !password.trim() || password.length > 256) return false;
  challenge.resolve(password);
  return true;
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
  client.addEventHandler(handler, new NewMessage({ incoming: true, outgoing: true }));
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
  if (!await client.checkAuthorization()) {
    await TelegramConnection.updateOne(
      { _id: connection._id },
      { $set: { status: "disconnected", encryptedSession: null } },
    );
    await client.disconnect();
    throw new Error("The Telegram session is no longer active. Connect the account again.");
  }
  return { client, connection };
};

export const isPersonalConnectionActive = async (businessId) => {
  const connection = await TelegramConnection.findOne({
    business: businessId,
    connectionType: "personal",
    status: "connected",
  }).select("+encryptedSession");
  if (!connection?.encryptedSession) return false;
  const client = createClient(decryptSession(connection.encryptedSession));
  try {
    await client.connect();
    const active = await client.checkAuthorization();
    if (!active) {
      await TelegramConnection.updateOne(
        { _id: connection._id },
        { $set: { status: "disconnected", encryptedSession: null } },
      );
    }
    return active;
  } catch (error) {
    await TelegramConnection.updateOne(
      { _id: connection._id },
      { $set: { status: "disconnected", encryptedSession: null } },
    );
    return false;
  } finally {
    await client.disconnect().catch(() => {});
  }
};

export const restorePersonalMonitoring = async () => {
  const connections = await TelegramConnection.find({ connectionType: "personal", status: "connected" }).select("+encryptedSession");
  for (const connection of connections) {
    const client = createClient(decryptSession(connection.encryptedSession));
    try {
      await client.connect();
      if (await client.checkAuthorization()) {
        await startPersonalMonitoring({ businessId: connection.business, client });
      } else {
        await TelegramConnection.updateOne({ _id: connection._id }, { $set: { status: "disconnected", encryptedSession: null } });
        await client.disconnect();
      }
    } catch (error) {
      console.error("Unable to restore personal Telegram monitoring:", error.message);
      await TelegramConnection.updateOne({ _id: connection._id }, { $set: { status: "disconnected", encryptedSession: null } });
      await client.disconnect().catch(() => {});
    }
  }
};
