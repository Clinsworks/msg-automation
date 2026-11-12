import { Business, User } from "../../database/models.js";
import { hashPassword } from "../auth/password.js";

const defaultAdminPassword = "admin1234";

export const ensureUserWorkspace = async (telegramUser) => {
  const user = await User.findOneAndUpdate(
    { telegramUserId: String(telegramUser.id) },
    {
      $set: {
        firstName: telegramUser.first_name || "there",
        lastName: telegramUser.last_name,
        username: telegramUser.username
      },
      $setOnInsert: { accountStatus: "active" }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  let business = user.business ? await Business.findById(user.business).select("+adminPasswordHash") : null;
  if (!business) {
    business = await Business.findOneAndUpdate(
      { owner: user._id },
      {
        $setOnInsert: {
          name: `${user.firstName}'s Business`,
          owner: user._id,
          status: "active",
          adminPasswordHash: await hashPassword(defaultAdminPassword)
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).select("+adminPasswordHash");
  }
  if (!business.adminPasswordHash) {
    business.adminPasswordHash = await hashPassword(defaultAdminPassword);
    business.adminPasswordChangedAt = null;
    await business.save();
  }
  if (!user.business || String(user.business) !== String(business._id)) {
    await User.updateOne({ _id: user._id }, { $set: { business: business._id } });
  }

  return { user, business };
};

export const updateUserEmail = (userId, email) =>
  User.findByIdAndUpdate(userId, { $set: { email: email.toLowerCase().trim() } }, { new: true });
