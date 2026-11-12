export class TelegramUserProvider {
  constructor(client) {
    this.client = client;
  }

  async sendMessage(destinationId, text, options = {}) {
    return this.client.sendMessage(destinationId, { message: text, ...options });
  }

  async getConnectionStatus() {
    const user = await this.client.getMe();
    return { connected: true, accountIdentifier: String(user.id), username: user.username };
  }
}
