const chatTypeToDestinationType = {
  private: "user",
  group: "group",
  supergroup: "group",
  channel: "channel"
};

const isPermissionError = (error) => [400, 403].includes(error.response?.error_code);

export class TelegramBotProvider {
  constructor(telegram) {
    this.telegram = telegram;
  }

  async sendMessage(destinationId, text, options = {}) {
    return this.telegram.sendMessage(destinationId, text, options);
  }

  async sendMedia(destinationId, media, caption, options = {}) {
    const methodByType = {
      photo: "sendPhoto",
      video: "sendVideo",
      document: "sendDocument"
    };
    const method = methodByType[media.type];
    if (!method) throw new Error(`Unsupported Telegram media type: ${media.type}`);
    return this.telegram[method](destinationId, media.fileId, { caption, ...options });
  }

  async validateDestination(destinationId) {
    try {
      const chat = await this.telegram.getChat(destinationId);
      const destinationType = chatTypeToDestinationType[chat.type];
      if (!destinationType) {
        return { valid: false, reason: `Unsupported Telegram chat type: ${chat.type}` };
      }

      const permission = await this.checkSendPermission(chat);
      return {
        valid: permission.allowed,
        reason: permission.reason,
        destinationType,
        displayName: chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(" ") || chat.username || String(chat.id),
        telegramDestinationId: String(chat.id)
      };
    } catch (error) {
      if (isPermissionError(error)) {
        return { valid: false, reason: "The bot cannot access this Telegram destination." };
      }
      throw error;
    }
  }

  async checkSendPermission(chat) {
    if (chat.type === "private") {
      return { allowed: true };
    }

    const bot = await this.telegram.getMe();
    const membership = await this.telegram.getChatMember(chat.id, bot.id);
    if (chat.type === "channel") {
      return {
        allowed: ["administrator", "creator"].includes(membership.status) && membership.can_post_messages === true,
        reason: "The bot must be an administrator with permission to post in this channel."
      };
    }

    return {
      allowed: ["member", "administrator", "creator"].includes(membership.status)
        || (membership.status === "restricted" && membership.can_send_messages === true),
      reason: "The bot must be a member with permission to send messages in this group."
    };
  }

  async getConnectionStatus() {
    const bot = await this.telegram.getMe();
    return { connected: true, accountIdentifier: String(bot.id), username: bot.username };
  }
}
