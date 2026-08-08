import { config } from '../config';
import { RefundQuote } from '../types';
import { escapeHtml, formatUzs } from '../utils/helpers';
import { adminRefundButtons } from '../bot/keyboards';

type NotifyType = 'buyer' | 'seller' | 'admin';

interface NotifyPayload {
  type: NotifyType;
  chatId: number | string | undefined | null;
  message: string;
  buttons?: any[];
  /** Silences the delivery for low-priority updates. */
  silent?: boolean;
}

class NotificationService {
  private bot: any = null;

  setBot(botInstance: any) {
    this.bot = botInstance;
  }

  async send(payload: NotifyPayload): Promise<boolean> {
    if (!this.bot) {
      console.warn('[Notify] Bot not initialized, message skipped:', payload.message.slice(0, 60));
      return false;
    }
    if (!payload.chatId) return false;

    try {
      await this.bot.telegram.sendMessage(String(payload.chatId), payload.message, {
        parse_mode: 'HTML',
        disable_notification: payload.silent,
        ...(payload.buttons?.length ? { reply_markup: { inline_keyboard: payload.buttons } } : {}),
      });
      return true;
    } catch (error: any) {
      // 403 means the user blocked the bot — expected, not an incident worth a stack trace.
      const code = error?.response?.error_code;
      if (code === 403) {
        console.warn(`[Notify] ${payload.chatId} has blocked the bot`);
      } else {
        console.error(`[Notify] Failed to send to ${payload.chatId}:`, error?.message || error);
      }
      return false;
    }
  }

  async notifyAdmin(message: string, buttons?: any[]) {
    return this.send({
      type: 'admin',
      chatId: config.adminChatId,
      message: `🤖 <b>Bitimax Admin</b>\n\n${message}`,
      buttons,
    });
  }

  async notifyBuyer(chatId: number | string | undefined | null, message: string, buttons?: any[]) {
    return this.send({ type: 'buyer', chatId, message, buttons });
  }

  async notifySeller(chatId: number | string | undefined | null, message: string, buttons?: any[]) {
    return this.send({ type: 'seller', chatId, message, buttons });
  }

  /** Tells the buyer their transfer landed, with the button that opens the credentials. */
  async notifyPaymentConfirmed(
    chatId: number | string | undefined | null,
    productTitle: string,
    amount: number,
    escrowId: string
  ) {
    return this.send({
      type: 'buyer',
      chatId,
      message: [
        `✅ <b>To‘lov qabul qilindi!</b>`,
        '',
        `<b>Mahsulot:</b> ${escapeHtml(productTitle)}`,
        `<b>Summa:</b> ${formatUzs(amount)}`,
        '',
        `Pul <b>escrow</b>da (kafilda) saqlanmoqda. Akkaunt ma’lumotlarini ochish uchun ` +
          `pastdagi tugmani bosing.`,
        '',
        `<i>⏱ Qaytarish muddati ma’lumotlarni ochgan daqiqadan boshlanadi — shoshilmang, ` +
          `tayyor bo‘lganingizda bosing.</i>`,
      ].join('\n'),
      buttons: [[{ text: '🔑 Ma’lumotlarni ochish', callback_data: `reveal_${escrowId}` }]],
    });
  }

  async notifyRefundToAdmin(input: {
    buyer: string;
    seller: string;
    productTitle: string;
    amount: number;
    reason: string;
    quote: RefundQuote;
    escrowId: string;
    sellerId: string;
    productId: string;
  }) {
    const message = [
      `🔄 <b>Qaytarish amalga oshirildi</b>`,
      '',
      `<b>Xaridor:</b> ${escapeHtml(input.buyer)}`,
      `<b>Sotuvchi:</b> ${escapeHtml(input.seller)}`,
      `<b>Mahsulot:</b> ${escapeHtml(input.productTitle)}`,
      `<b>Summa:</b> ${formatUzs(input.amount)}`,
      `<b>Sabab:</b> ${escapeHtml(input.reason)}`,
      '',
      `<b>Davr:</b> ${input.quote.label} (${input.quote.elapsedMinutes} daq.)`,
      `<b>Jarima:</b> ${input.quote.penaltyPercent}%`,
      `<b>Xaridorga:</b> ${formatUzs(input.quote.refundToBuyer)}`,
      `<b>Sotuvchiga:</b> ${formatUzs(input.quote.sellerKeeps)}`,
      `<b>Platformaga:</b> ${formatUzs(input.quote.platformKeeps)}`,
      '',
      `<i>Akkauntni tekshiring va kerakli chorani ko‘ring.</i>`,
    ].join('\n');

    return this.notifyAdmin(
      message,
      adminRefundButtons(input.escrowId, input.sellerId, input.productId).reply_markup.inline_keyboard
    );
  }
}

export const notificationService = new NotificationService();
