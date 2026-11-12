export const config = {
  botToken: process.env.BOT_TOKEN,
  port: Number(process.env.PORT || 8000),
  mongoUri: process.env.MONGODB_URI,
  redisUrl: process.env.REDIS_URL
};
