export class TelegramUserProvider {
  constructor(client) {
    this.client = client;
  }

  async sendMessage(destinationId, text, options = {}) {
    if (options.file) {
      return this.client.sendMessage(destinationId, {
        message: text,
        file: options.file,
        forceDocument: false,
      });
    }
    return this.client.sendMessage(destinationId, { message: text, ...options, buttons });
  }

  async getConnectionStatus() {
    const user = await this.client.getMe();
    return { connected: true, accountIdentifier: String(user.id), username: user.username };
  }
}
