const publicBaseUrl = process.env.PUBLIC_BASE_URL?.trim().replace(/\/$/, "") || "";

export const config = {
  botToken: process.env.BOT_TOKEN,
  port: Number(process.env.PORT || 8000),
  publicBaseUrl,
  mongoUri: process.env.MONGODB_URI,
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY,
  paystackCallbackUrl: process.env.PAYSTACK_CALLBACK_URL || (publicBaseUrl ? `${publicBaseUrl}/payments/callback` : ""),
  telegramApiId: Number(process.env.TELEGRAM_API_ID),
  telegramApiHash: process.env.TELEGRAM_API_HASH,
  sessionEncryptionKey: process.env.SESSION_ENCRYPTION_KEY,
  superadminPassword: process.env.SUPERADMIN_PASSWORD
};

export const validateEnvironmentUrls = () => {
  if (config.publicBaseUrl) {
    const url = new URL(config.publicBaseUrl);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("PUBLIC_BASE_URL must use HTTP or HTTPS.");
  }
  if (config.paystackCallbackUrl) {
    const url = new URL(config.paystackCallbackUrl);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("PAYSTACK_CALLBACK_URL must use HTTP or HTTPS.");
  }
};
