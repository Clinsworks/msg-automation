import { Campaign, CampaignDelivery } from "../../database/models.js";

const rangeStart = (range) => {
  if (range === "today") return new Date(new Date().setHours(0, 0, 0, 0));
  if (range === "7d") return new Date(Date.now() - 7 * 86400000);
  if (range === "30d") return new Date(Date.now() - 30 * 86400000);
  return null;
};

export const getBusinessAnalytics = async (businessId, range = "all") => {
  const start = rangeStart(range);
  const dateFilter = start ? { createdAt: { $gte: start } } : {};
  const [campaigns, deliveries, campaignHistory] = await Promise.all([
    Campaign.countDocuments({ business: businessId, ...dateFilter }),
    CampaignDelivery.aggregate([
      { $match: { ...dateFilter, campaign: { $in: await Campaign.find({ business: businessId }).distinct("_id") } } },
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]),
    Campaign.find({ business: businessId, ...dateFilter })
      .select("name status createdAt scheduledFor")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean()
  ]);
  const totals = deliveries.reduce((summary, item) => ({ ...summary, [item._id]: item.count }), {});
  const attempted = (totals.sent || 0) + (totals.failed || 0) + (totals.pending || 0);
  return {
    campaigns,
    attempted,
    successful: totals.sent || 0,
    failed: totals.failed || 0,
    pending: totals.pending || 0,
    successRate: attempted ? Math.round(((totals.sent || 0) / attempted) * 100) : 0,
    campaignHistory
  };
};

export const getDashboardStats = async (businessId) => {
  const analytics = await getBusinessAnalytics(businessId);
  const upcoming = await Campaign.countDocuments({
    business: businessId,
    status: "scheduled",
    scheduledFor: { $gt: new Date() }
  });
  return { ...analytics, upcoming };
};
