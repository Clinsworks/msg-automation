import { Campaign, CampaignDelivery, CrossPostDelivery, Recipient } from "../../database/models.js";

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
  const [deliveries, savedDestinations] = await Promise.all([
    CrossPostDelivery.aggregate([
      { $match: { business: businessId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Recipient.countDocuments({
      business: businessId,
      recipientSource: "personal_sync",
      selectedForCrossPost: true,
      sendingEligible: true,
    }),
  ]);
  const totals = deliveries.reduce((summary, item) => ({ ...summary, [item._id]: item.count }), {});
  const successful = totals.sent || 0;
  const failed = totals.failed || 0;
  const attempted = successful + failed;
  return {
    attempted,
    successful,
    failed,
    successRate: attempted ? Math.round((successful / attempted) * 100) : 0,
    savedDestinations,
  };
};
