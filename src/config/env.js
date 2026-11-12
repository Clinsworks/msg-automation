export const config = {
  botToken: process.env.BOT_TOKEN,
  port: Number(process.env.PORT || 8000),
  mongoUri: process.env.MONGODB_URI,
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY,
  paystackCallbackUrl: process.env.PAYSTACK_CALLBACK_URL,
  telegramApiId: Number(process.env.TELEGRAM_API_ID),
  telegramApiHash: process.env.TELEGRAM_API_HASH,
  sessionEncryptionKey: process.env.SESSION_ENCRYPTION_KEY,
  superadminPassword: process.env.SUPERADMIN_PASSWORD
};
