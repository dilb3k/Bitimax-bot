import { Composer } from 'telegraf';
import { User } from '../../models/User';
import { Product } from '../../models/Product';
import { EscrowHold } from '../../models/EscrowHold';
import { botApi } from '../services/api';
import { notificationService } from '../../services/notificationService';
import { paymentService, AlreadyProcessedError } from '../../services/paymentService';
import {
  mainMenuKeyboard,
  productActionButtons,
  paymentConfirmationButtons,
  escrowActionButtons,
  refundReasonButtons,
} from '../keyboards';

export const buyerHandler = new Composer();

/**
 * Telegram callback_data is attacker-controllable (a crafted client can send arbitrary
 * callback_query data, not just what was on the button it was shown). Every handler that
 * acts on an escrowId taken from callback_data MUST verify the clicking user actually owns
 * it before touching money or releasing product credentials.
 */
async function loadOwnedEscrow(telegramId: number, escrowId: string) {
  const user = await User.findOne({ telegramId });
  if (!user) return { error: 'Foydalanuvchi topilmadi' as const };

  const escrow = await EscrowHold.findById(escrowId);
  if (!escrow) return { error: 'Buyurtma topilmadi' as const };

  if (escrow.buyerId.toString() !== user._id.toString()) {
    return { error: 'Ruxsat yo\'q' as const };
  }

  return { escrow, user };
}

buyerHandler.hears('🛍 Mahsulotlar', async (ctx) => {
  const { products, total, pages } = await botApi.getActiveProducts(1, 10);

  if (products.length === 0) {
    await ctx.reply('Hozircha faol mahsulotlar mavjud emas. Keyinroq urinib ko\'ring.');
    return;
  }

  await ctx.replyWithHTML(
    `<b>🛍 Mahsulotlar (1-${products.length}/${total})</b>`
  );

  for (const product of products) {
    const msg = `
<b>${product.title}</b>
${product.description.substring(0, 100)}${product.description.length > 100 ? '...' : ''}

💰 <b>Narx:</b> ${product.price.toLocaleString()} UZS
📂 <b>Kategoriya:</b> ${product.category}
🏷 <b>ID:</b> ${product._id}
    `.trim();

    await ctx.replyWithHTML(msg, productActionButtons(product._id.toString()));
  }

  if (pages > 1) {
    await ctx.replyWithHTML(
      `<b>📄 Sahifalar:</b> 1/${pages}\n\nKeyingi sahifani ko'rish uchun /next ni bosing.`
    );
  }
});

buyerHandler.action(/^buy_(.+)$/, async (ctx) => {
  try {
    const productId = ctx.match[1];
    const telegramId = ctx.from!.id;
    const user = await User.findOne({ telegramId });

    if (!user) {
      await ctx.answerCbQuery('Foydalanuvchi topilmadi');
      return;
    }

    const product = await Product.findById(productId);
    if (!product || product.status !== 'active') {
      await ctx.answerCbQuery('❌ Mahsulot mavjud emas yoki allaqachon sotilgan');
      return;
    }

    if (product.sellerId.toString() === user._id.toString()) {
      await ctx.answerCbQuery('❌ O\'z mahsulotingizni sotib ololmaysiz');
      return;
    }

    const { transaction, uniqueAmount } = await botApi.initiatePurchase(
      productId,
      user._id.toString()
    );

    const paymentMessage = `
<b>💳 To'lov Ma'lumotlari</b>

<b>Mahsulot:</b> ${product.title}
<b>Narx:</b> ${product.price.toLocaleString()} UZS

<b>📌 To'lov uchun summa:</b>
<code>${uniqueAmount.toLocaleString()} UZS</code>

<b>🏦 Bank:</b> Istalgan O'zbekiston banki orqali
<b>💳 Karta:</b> <code>8600 XXXX XXXX XXXX</code>

<i>⚠️ Diqqat! Aynan yuqoridagi summani to'lang. SMS-xabar avtomatik tizim tomonidan aniqlanadi.</i>

<i>⏱ To'lov uchun 10 daqiqa vaqtingiz bor.</i>
    `.trim();

    await ctx.editMessageText(paymentMessage, {
      parse_mode: 'HTML',
      reply_markup: paymentConfirmationButtons(productId).reply_markup,
    });

    await ctx.answerCbQuery();
  } catch (error: any) {
    await ctx.answerCbQuery(`Xatolik: ${error.message}`);
  }
});

buyerHandler.action(/^detail_(.+)$/, async (ctx) => {
  try {
    const productId = ctx.match[1];
    const product = await Product.findById(productId).populate(
      'sellerId',
      'telegramId username'
    );

    if (!product) {
      await ctx.answerCbQuery('Mahsulot topilmadi');
      return;
    }

    const detailText = `
<b>📋 Mahsulot Tafsilotlari</b>

<b>Nomi:</b> ${product.title}
<b>Tavsif:</b> ${product.description}
<b>Narx:</b> ${product.price.toLocaleString()} UZS
<b>Kategoriya:</b> ${product.category}
<b>Sotuvchi:</b> ${(product.sellerId as any)?.username || 'Noma\'lum'}
<b>Holat:</b> 🟢 Mavjud

<i>Akkaunt login/parol ma'lumotlari to'lovdan so'ng taqdim etiladi.</i>
    `.trim();

    await ctx.editMessageText(detailText, {
      parse_mode: 'HTML',
      reply_markup: productActionButtons(productId).reply_markup,
    });

    await ctx.answerCbQuery();
  } catch (error) {
    await ctx.answerCbQuery('Xatolik yuz berdi');
  }
});

buyerHandler.action(/^confirm_payment_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.replyWithHTML(
    '<b>💡 To\'lovni amalga oshirish</b>\n\n' +
    '1. Yuqoridagi summani bank kartangiz orqali to\'lang\n' +
    '2. SMS-xabar kelgach, tizim avtomatik to\'lovni tasdiqlaydi\n' +
    '3. To\'lov tasdiqlangach, akkaunt ma\'lumotlari avtomatik yuboriladi\n\n' +
    '<i>Agar 10 daqiqa ichida SMS kelmasa, yangi to\'lov yarating.</i>'
  );
});

buyerHandler.action(/^cancel_payment_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery('To\'lov bekor qilindi');
  await ctx.reply('To\'lov jarayoni bekor qilindi. Boshqa mahsulotni tanlashingiz mumkin.');
});

buyerHandler.hears('📦 Mening buyurtmalarim', async (ctx) => {
  const user = await User.findOne({ telegramId: ctx.from!.id });
  if (!user) return;

  const escrows = await botApi.getEscrowHolds(user._id.toString(), 'buyer');

  if (escrows.length === 0) {
    await ctx.reply('Sizda hali buyurtmalar mavjud emas.');
    return;
  }

  for (const escrow of escrows) {
    const product = await Product.findById(escrow.productId);
    const statusEmoji =
      escrow.status === 'holding' ? '🟡' :
      escrow.status === 'released' ? '✅' : '🔄';

    const msg = `
${statusEmoji} <b>${product?.title || 'Noma\'lum mahsulot'}</b>

💰 <b>Summa:</b> ${escrow.amount.toLocaleString()} UZS
📊 <b>Holat:</b> ${escrow.status}
🕐 <b>Sotib olingan:</b> ${new Date(escrow.boughtAt).toLocaleString('uz-UZ')}
    `.trim();

    if (escrow.status === 'holding') {
      await ctx.replyWithHTML(msg, escrowActionButtons(escrow._id.toString()));
    } else {
      await ctx.replyWithHTML(msg);
    }
  }
});

buyerHandler.action(/^confirm_escrow_(.+)$/, async (ctx) => {
  try {
    const escrowId = ctx.match[1];
    const owned = await loadOwnedEscrow(ctx.from!.id, escrowId);
    if ('error' in owned) {
      await ctx.answerCbQuery(owned.error);
      return;
    }

    const result = await paymentService.confirmAndRelease(escrowId);

    const escrow = await EscrowHold.findById(escrowId).populate('sellerId');
    if (escrow && (escrow.sellerId as any)?.telegramId) {
      const sellerTelegramId = (escrow.sellerId as any).telegramId;
      const product = await Product.findById(escrow.productId);

      await notificationService.notifySeller(
        sellerTelegramId,
        `✅ <b>Mahsulot tasdiqlandi!</b>\n\n` +
        `Mahsulot: ${product?.title || 'Noma\'lum'}\n` +
        `Summa: ${result.sellerPayout.toLocaleString()} UZS\n` +
        `Komissiya (7%): ${(escrow.amount - result.sellerPayout).toLocaleString()} UZS\n\n` +
        `Pul balansingizga o'tkazildi.`
      );
    }

    const product = await Product.findById(escrow?.productId);
    const accessMessage = `
✅ <b>To'lov tasdiqlandi! Mahsulot sizga taqdim etildi.</b>

<b>${product?.title || 'Mahsulot'}</b>

<b>🔑 Akkaunt ma'lumotlari:</b>
<b>Login:</b> <code>${product?.sensitiveData?.login || 'N/A'}</code>
<b>Parol:</b> <code>${product?.sensitiveData?.password || 'N/A'}</code>
${product?.sensitiveData?.recoveryCode ? `<b>Tiklash kodi:</b> <code>${product.sensitiveData.recoveryCode}</code>` : ''}

⚠️ <b>MUHIM:</b> Akkaunt ma'lumotlarini <b>DARHOL</b> o'zingizga to'liq o'zgartiring (email, parol, tiklash ma'lumotlari)!
    `.trim();

    await ctx.editMessageText(accessMessage, { parse_mode: 'HTML' });
    await ctx.answerCbQuery('✅ Tasdiqlandi!');
  } catch (error: any) {
    if (error instanceof AlreadyProcessedError) {
      await ctx.answerCbQuery('Bu buyurtma allaqachon qayta ishlangan.');
      return;
    }
    await ctx.answerCbQuery(`Xatolik: ${error.message}`);
  }
});

buyerHandler.action(/^refund_escrow_(.+)$/, async (ctx) => {
  const escrowId = ctx.match[1];
  const owned = await loadOwnedEscrow(ctx.from!.id, escrowId);
  if ('error' in owned) {
    await ctx.answerCbQuery(owned.error);
    return;
  }

  await ctx.editMessageText(
    '<b>🔄 Qaytarish Sababi</b>\n\nNima sababdan akkauntni qaytarmoqchisiz?',
    {
      parse_mode: 'HTML',
      reply_markup: refundReasonButtons(escrowId).reply_markup,
    }
  );
  await ctx.answerCbQuery();
});

buyerHandler.action(/^refund_reason_(.+?)_(.+)$/, async (ctx) => {
  try {
    const reasonType = ctx.match[1];
    const escrowId = ctx.match[2];

    const reasonMap: Record<string, string> = {
      not_working: 'Akkaunt ishlamayapti',
      wrong_info: 'Noto\'g\'ri ma\'lumot berilgan',
      other: 'Boshqa sabab',
    };

    const reason = reasonMap[reasonType] || 'Boshqa sabab';

    const owned = await loadOwnedEscrow(ctx.from!.id, escrowId);
    if ('error' in owned) {
      await ctx.answerCbQuery(owned.error);
      return;
    }

    await ctx.answerCbQuery(`Sabab: ${reason}`);

    const escrow = await EscrowHold.findById(escrowId)
      .populate('buyerId')
      .populate('sellerId')
      .populate('productId');

    if (!escrow) {
      await ctx.reply('Buyurtma topilmadi.');
      return;
    }

    const result = await paymentService.processRefund(escrowId, reason);

    if (result.allowed) {
      const refundMessage = `
🔄 <b>Qaytarish Natijasi</b>

✅ <b>Qaytarish tasdiqlandi!</b>

<b>Sabab:</b> ${reason}
<b>Davr:</b> ${result.period}
<b>Jarima:</b> ${result.penaltyAmount?.toLocaleString() || 0} UZS
<b>Sizga qaytarildi:</b> ${result.refundToBuyer?.toLocaleString() || 0} UZS

${result.message}
      `.trim();

      await ctx.editMessageText(refundMessage, { parse_mode: 'HTML' });

      const product = escrow.productId as any;
      const buyer = escrow.buyerId as any;
      const seller = escrow.sellerId as any;

      await notificationService.notifyRefundToAdmin(
        `@${buyer.username || buyer.telegramId}`,
        `@${seller.username || seller.telegramId}`,
        product.title,
        escrow.amount,
        reason,
        result,
        escrowId
      );

      if (seller.telegramId) {
        await notificationService.notifySeller(
          seller.telegramId,
          `🔄 <b>Qaytarish amalga oshirildi</b>\n\n` +
          `Mahsulot: ${product.title}\n` +
          `Sabab: ${reason}\n` +
          `Jarima: ${result.penaltyAmount?.toLocaleString() || 0} UZS\n` +
          `Sizga o\'tkazildi: ${result.sellerKeeps?.toLocaleString() || 0} UZS`
        );
      }
    } else {
      await ctx.editMessageText(
        `❌ <b>Qaytarish mumkin emas</b>\n\n${result.message}`,
        { parse_mode: 'HTML' }
      );
    }
  } catch (error: any) {
    if (error instanceof AlreadyProcessedError) {
      await ctx.answerCbQuery('Bu buyurtma allaqachon qayta ishlangan.');
      return;
    }
    await ctx.answerCbQuery(`Xatolik: ${error.message}`);
  }
});

buyerHandler.action(/^refund_cancel_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery('Bekor qilindi');
  await ctx.reply('Qaytarish jarayoni bekor qilindi.', mainMenuKeyboard);
});

buyerHandler.action(/^help_escrow_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.replyWithHTML(
    '<b>❓ Escrow Yordam</b>\n\n' +
    '<b>✅ Tasdiqlayman</b> — Akkaunt bilan hammasi joyida, pulni sotuvchiga o\'tkazish.\n' +
    '<b>🔄 Qaytarish</b> — Akkauntda muammo bo\'lsa, pulni qaytarib olish.\n\n' +
    '<b>Qaytarish shartlari:</b>\n' +
    '• 0-10 daqiqa: to\'liq qaytarish\n' +
    '• 10 min - 2 soat: 10% jarima\n' +
    '• 2-24 soat: 50% jarima\n' +
    '• 24 soatdan oshsa: qaytarish mumkin emas'
  );
});
