import crypto from "node:crypto";

const algorithm = "scrypt";
const keyLength = 64;

export const hashPassword = async (password) => {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("Admin password must be at least 8 characters.");
  }
  const salt = crypto.randomBytes(16);
  const derivedKey = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keyLength, (error, key) => error ? reject(error) : resolve(key));
  });
  return `${algorithm}$${salt.toString("base64")}$${derivedKey.toString("base64")}`;
};

export const verifyPassword = async (password, storedHash) => {
  const [storedAlgorithm, saltValue, keyValue] = String(storedHash || "").split("$");
  if (storedAlgorithm !== algorithm || !saltValue || !keyValue) return false;
  const salt = Buffer.from(saltValue, "base64");
  const expected = Buffer.from(keyValue, "base64");
  const actual = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, expected.length, (error, key) => error ? reject(error) : resolve(key));
  });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};
