import { Business, User } from "../../database/models.js";

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

  let business = user.business ? await Business.findById(user.business) : null;
  if (!business) {
    business = await Business.findOneAndUpdate(
      { owner: user._id },
      {
        $setOnInsert: {
          name: `${user.firstName}'s Business`,
          owner: user._id,
          status: "active"
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    await User.updateOne({ _id: user._id }, { $set: { business: business._id } });
  }

  return { user, business };
};

export const updateUserEmail = (userId, email) =>
  User.findByIdAndUpdate(userId, { $set: { email: email.toLowerCase().trim() } }, { new: true });
