import { config } from '../config';

type NotifyType = 'buyer' | 'seller' | 'admin';

interface NotifyPayload {
  type: NotifyType;
  chatId: number | string;
  message: string;
  buttons?: any[];
}

class NotificationService {
  private bot: any = null;

  setBot(botInstance: any) {
    this.bot = botInstance;
  }

  async send(payload: NotifyPayload): Promise<boolean> {
    if (!this.bot) {
      console.warn('[Notify] Bot not initialized, message skipped:', payload.message.substring(0, 50));
      return false;
    }

    try {
      const chatId = String(payload.chatId);
      if (payload.buttons && payload.buttons.length > 0) {
        await this.bot.telegram.sendMessage(chatId, payload.message, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: payload.buttons },
        });
      } else {
        await this.bot.telegram.sendMessage(chatId, payload.message, {
          parse_mode: 'HTML',
        });
      }
      return true;
    } catch (error) {
      console.error(`[Notify] Failed to send to ${payload.chatId}:`, error);
      return false;
    }
  }

  async notifyAdmin(message: string, buttons?: any[]) {
    return this.send({
      type: 'admin',
      chatId: config.adminChatId,
      message: `🤖 <b>Admin Xabari</b>\n\n${message}`,
      buttons,
    });
  }

  async notifyBuyer(chatId: number | string, message: string, buttons?: any[]) {
    return this.send({ type: 'buyer', chatId, message, buttons });
  }

  async notifySeller(chatId: number | string, message: string, buttons?: any[]) {
    return this.send({ type: 'seller', chatId, message, buttons });
  }

  async notifyRefundToAdmin(
    buyerInfo: string,
    sellerInfo: string,
    productTitle: string,
    amount: number,
    reason: string,
    refundResult: any,
    escrowId: string
  ) {
    const message = `
🔄 <b>Qaytarish (Refund) So'rovi</b>

<b>Xaridor:</b> ${buyerInfo}
<b>Sotuvchi:</b> ${sellerInfo}
<b>Mahsulot:</b> ${productTitle}
<b>Summa:</b> ${amount.toLocaleString()} UZS
<b>Sabab:</b> ${reason}
<b>Davr:</b> ${refundResult.period}
<b>Jarima:</b> ${refundResult.penaltyPercent}%
<b>Qaytariladigan:</b> ${refundResult.refundToBuyer?.toLocaleString() || 0} UZS

<i>Iltimos, akkauntni tekshiring va kerakli chora ko'ring.</i>
    `.trim();

    const buttons = [
      [
        { text: '✅ Akkauntni o\'chirish', callback_data: `admin_delete_product_${escrowId}` },
        { text: '🚫 Bloklash', callback_data: `admin_ban_${escrowId}` },
      ],
      [{ text: '📋 Batafsil', callback_data: `admin_details_${escrowId}` }],
    ];

    return this.notifyAdmin(message, buttons);
  }
}

export const notificationService = new NotificationService();
