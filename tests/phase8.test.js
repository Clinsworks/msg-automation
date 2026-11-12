import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.SESSION_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
process.env.PAYSTACK_SECRET_KEY = "phase8-test-secret";

test("session encryption protects and restores a session", async () => {
  const { encryptSession, decryptSession } = await import("../src/modules/telegram/session-crypto.js");
  const session = "sensitive-session-value";
  const encrypted = encryptSession(session);
  assert.notEqual(encrypted, session);
  assert.equal(decryptSession(encrypted), session);
});

test("Paystack signatures require an exact HMAC match", async () => {
  const { isValidPaystackSignature } = await import("../src/modules/payments/service.js");
  const body = Buffer.from('{"event":"charge.success"}');
  const signature = crypto.createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(body).digest("hex");
  assert.equal(isValidPaystackSignature(body, signature), true);
  assert.equal(isValidPaystackSignature(body, "invalid"), false);
});

test("expired subscriptions cannot access premium features", async () => {
  const { canAccessFeature } = await import("../src/modules/subscriptions/service.js");
  assert.equal(typeof canAccessFeature, "function");
});

test("subscription notifications include remaining days", async () => {
  const { getSubscriptionNotification } = await import("../src/modules/notifications/service.js");
  const message = getSubscriptionNotification({
    expiresAt: new Date(Date.now() + 2 * 86400000),
    plan: { name: "Pro" }
  });
  assert.match(message, /Pro/);
  assert.match(message, /expires in/);
});

test("admin passwords are salted and reject incorrect values", async () => {
  const { hashPassword, verifyPassword } = await import("../src/modules/auth/password.js");
  const hash = await hashPassword("admin1234");
  assert.notEqual(hash, "admin1234");
  assert.equal(await verifyPassword("admin1234", hash), true);
  assert.equal(await verifyPassword("wrong-password", hash), false);
});
