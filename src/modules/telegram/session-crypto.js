import crypto from "node:crypto";
import { config } from "../../config/env.js";

const getKey = () => {
  if (!/^[0-9a-fA-F]{64}$/.test(config.sessionEncryptionKey || "")) {
    throw new Error("SESSION_ENCRYPTION_KEY must be exactly 64 hexadecimal characters");
  }
  return Buffer.from(config.sessionEncryptionKey, "hex");
};

export const encryptSession = (session) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(session, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
};

export const decryptSession = (payload) => {
  const data = Buffer.from(payload, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
};
