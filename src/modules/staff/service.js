import { Staff, User } from "../../database/models.js";

export const listStaff = (businessId) =>
  Staff.find({ business: businessId, status: "active" }).sort({ createdAt: 1 }).lean();

export const addStaffMember = async ({ businessId, telegramUserId, displayName, role }) =>
  Staff.findOneAndUpdate(
    { business: businessId, telegramUserId: String(telegramUserId) },
    { $set: { displayName, role, status: "active" } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

export const revokeStaffMember = (businessId, telegramUserId) =>
  Staff.findOneAndUpdate(
    { business: businessId, telegramUserId: String(telegramUserId) },
    { $set: { status: "revoked" } },
    { new: true }
  );

export const getStaffWorkspace = async (telegramUserId) => {
  const staff = await Staff.findOne({ telegramUserId: String(telegramUserId), status: "active" }).populate("business").lean();
  if (!staff?.business) return null;
  const user = await User.findOneAndUpdate(
    { telegramUserId: String(telegramUserId) },
    { $setOnInsert: { telegramUserId: String(telegramUserId), firstName: staff.displayName || String(telegramUserId), accountStatus: "active" } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return { staff, user, business: staff.business };
};
