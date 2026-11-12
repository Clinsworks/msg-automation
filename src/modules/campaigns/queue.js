import { Queue } from "bullmq";
import IORedis from "ioredis";
import { config } from "../../config/env.js";

export const createQueueRuntime = async () => {
  if (!config.redisUrl) throw new Error("REDIS_URL is required to start the queue runtime");
  const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
  const campaignQueue = new Queue("campaign-delivery", { connection });
  await campaignQueue.waitUntilReady();
  return {
    connection,
    campaignQueue,
    close: async () => {
      await campaignQueue.close();
      await connection.quit();
    }
  };
};

export const enqueueCampaign = async ({ queue, campaignId, businessId, scheduledFor }) => {
  const delay = scheduledFor ? Math.max(0, new Date(scheduledFor).getTime() - Date.now()) : 0;
  return queue.add(
    "dispatch-campaign",
    { campaignId: String(campaignId), businessId: String(businessId) },
    {
      jobId: `campaign:${campaignId}`,
      delay,
      removeOnComplete: 1000,
      removeOnFail: 1000
    }
  );
};
