import { Composer } from 'telegraf';
import { User } from '../../models/User';
import { Product } from '../../models/Product';
import { EscrowHold } from '../../models/EscrowHold';
import { botApi } from '../services/api';
import { notificationService } from '../../services/notificationService';
import {
  paymentService,
  AlreadyProcessedError,
  ProductUnavailableError,
  ForbiddenError,
} from '../../services/paymentService';
import { describeRefundPolicy } from '../../services/refundEngine';
import { config } from '../../config';
import { escapeHtml, formatUzs } from '../../utils/helpers';
import {
  mainMenuKeyboard,
  productActionButtons,
  revealButton,
  escrowActionButtons,
  refundReasonButtons,
  refundConfirmButtons,
} from '../keyboards';

export const buyerHandler = new Composer();

/**
 * Telegram callback_data is attacker-controllable — a crafted client can send arbitrary
 * callback_query data, not just what was on the button it was shown. Every handler that acts
 * on an escrowId from callback_data MUST verify the clicking user owns it before touching
 * money or releasing credentials.
 */
async function loadOwnedEscrow(telegramId: number, escrowId: string) {
  const user = await User.findOne({ telegramId });
  if (!user) return { error: 'Foydalanuvchi topilmadi' as const };
  if (user.isBlocked) return { error: 'Hisobingiz bloklangan' as const };

  const escrow = await EscrowHold.findById(escrowId).catch(() => null);
  if (!escrow) return { error: 'Buyurtma topilmadi' as const };

  if (escrow.buyerId.toString() !== user._id.toString()) {
    return { error: 'Ruxsat yo‘q' as const };
  }

  return { escrow, user };
}

buyerHandler.hears('🛍 Mahsulotlar', async (ctx) => {
  const { products, total, pages } = await botApi.getActiveProducts(1, 10);

  if (products.length === 0) {
    await ctx.reply('Hozircha faol mahsulotlar mavjud emas. Keyinroq urinib ko‘ring.');
    return;
  }

  await ctx.replyWithHTML(
    `<b>🛍 Mahsulotlar (1–${products.length} / ${total})</b>\n\n` +
      `<i>To‘liq katalog va filtrlar: ${config.siteUrl}</i>`
  );

  for (const product of products) {
    const seller = product.sellerId as any;
    const rating = seller?.sellerStats?.ratingCount
      ? `⭐ ${(seller.sellerStats.ratingSum / seller.sellerStats.ratingCount).toFixed(1)} (${seller.sellerStats.ratingCount})`
      : '⭐ yangi sotuvchi';

    const msg = [
      `<b>${escapeHtml(product.title)}</b>`,
      escapeHtml(product.description.slice(0, 140)) + (product.description.length > 140 ? '…' : ''),
      '',
      `💰 <b>${formatUzs(product.price)}</b>`,
      `📂 ${escapeHtml(product.category)}`,
      `👤 ${rating}`,
    ].join('\n');

    await ctx.replyWithHTML(msg, productActionButtons(product._id.toString()));
  }

  if (pages > 1) {
    await ctx.replyWithHTML(`<b>📄 Sahifa 1 / ${pages}</b> — keyingisi uchun /next`);
  }
});

buyerHandler.action(/^buy_(.+)$/, async (ctx) => {
  try {
    const productId = ctx.match[1];
    const user = await User.findOne({ telegramId: ctx.from!.id });

    if (!user) {
      await ctx.answerCbQuery('Foydalanuvchi topilmadi — /start bosing');
      return;
    }
    if (user.isBlocked) {
      await ctx.answerCbQuery('Hisobingiz bloklangan');
      return;
    }

    const { product, uniqueAmount, card, expiresAt } = await botApi.initiatePurchase(
      productId,
      user._id.toString()
    );

    const cardBlock = card
      ? `<b>💳 Karta:</b> <code>${card.raw}</code>\n<b>👤 Egasi:</b> ${escapeHtml(card.holder)}\n<b>🏦 Bank:</b> ${escapeHtml(card.bank)}`
      : `<i>⚠️ To‘lov kartasi sozlanmagan — admin bilan bog‘laning.</i>`;

    const paymentMessage = [
      `<b>💳 To‘lov ma’lumotlari</b>`,
      '',
      `<b>Mahsulot:</b> ${escapeHtml(product.title)}`,
      `<b>Narx:</b> ${formatUzs(product.price)}`,
      '',
      `<b>📌 AYNAN shu summani o‘tkazing:</b>`,
      `<code>${uniqueAmount}</code> UZS`,
      '',
      cardBlock,
      '',
      `⏱ <b>Muddat:</b> ${config.paymentWindowMinutes} daqiqa (${expiresAt.toLocaleTimeString('uz-UZ')} gacha)`,
      '',
      `<i>⚠️ Summadagi oxirgi raqamlar aynan sizning buyurtmangizni aniqlaydi. ` +
        `Boshqa summa o‘tkazsangiz, to‘lov avtomatik tanilmaydi.</i>`,
      '',
      `<i>To‘lov tushgach, bot sizga avtomatik xabar yuboradi.</i>`,
    ].join('\n');

    await ctx.editMessageText(paymentMessage, { parse_mode: 'HTML' });
    await ctx.answerCbQuery('To‘lov yaratildi');
  } catch (error: any) {
    if (error instanceof ProductUnavailableError) {
      await ctx.answerCbQuery('❌ Mahsulot sotilgan yoki band qilingan');
      return;
    }
    if (error instanceof ForbiddenError) {
      await ctx.answerCbQuery(`❌ ${error.message}`);
      return;
    }
    console.error('[Buyer] buy failed:', error);
    await ctx.answerCbQuery('Xatolik yuz berdi, qayta urinib ko‘ring');
  }
});

buyerHandler.action(/^detail_(.+)$/, async (ctx) => {
  try {
    const productId = ctx.match[1];
    const product = await Product.findById(productId).populate(
      'sellerId',
      'telegramId username trustLevel sellerStats'
    );

    if (!product) {
      await ctx.answerCbQuery('Mahsulot topilmadi');
      return;
    }

    const seller = product.sellerId as any;
    const detailText = [
      `<b>📋 ${escapeHtml(product.title)}</b>`,
      '',
      escapeHtml(product.description),
      '',
      `<b>Narx:</b> ${formatUzs(product.price)}`,
      `<b>Kategoriya:</b> ${escapeHtml(product.category)}`,
      `<b>Sotuvchi:</b> ${escapeHtml(seller?.username || 'noma’lum')} (${seller?.trustLevel || 'new'})`,
      `<b>Sotgan:</b> ${seller?.sellerStats?.sold ?? 0} ta`,
      '',
      `🛡 <b>Escrow himoyasi:</b>`,
      describeRefundPolicy(),
      '',
      `<i>Login/parol to‘lov tasdiqlangandan keyin ochiladi.</i>`,
    ].join('\n');

    await ctx.editMessageText(detailText, {
      parse_mode: 'HTML',
      reply_markup: productActionButtons(productId).reply_markup,
    });
    await ctx.answerCbQuery();
  } catch (error) {
    await ctx.answerCbQuery('Xatolik yuz berdi');
  }
});

/**
 * Reveals the credentials and starts the refund clock.
 *
 * In v1 the only way to see the login was to press "Tasdiqlayman" — which simultaneously
 * released the money to the seller. A buyer could not inspect what they bought before paying
 * out for it, which made the escrow guarantee meaningless. Reveal and confirm are now separate
 * steps: look first, decide second.
 */
buyerHandler.action(/^reveal_(.+)$/, async (ctx) => {
  try {
    const escrowId = ctx.match[1];
    const owned = await loadOwnedEscrow(ctx.from!.id, escrowId);
    if ('error' in owned) {
      await ctx.answerCbQuery(owned.error);
      return;
    }

    const { credentials, hold, firstReveal } = await paymentService.revealCredentials(
      escrowId,
      owned.user._id.toString()
    );
    const product = await Product.findById(hold.productId);

    const lines = [
      `🔑 <b>Akkaunt ma’lumotlari</b>`,
      '',
      `<b>${escapeHtml(product?.title || 'Mahsulot')}</b>`,
      '',
      `<b>Login:</b> <code>${escapeHtml(credentials.login)}</code>`,
      `<b>Parol:</b> <code>${escapeHtml(credentials.password)}</code>`,
    ];
    if (credentials.recoveryCode) {
      lines.push(`<b>Tiklash kodi:</b> <code>${escapeHtml(credentials.recoveryCode)}</code>`);
    }
    if (credentials.additionalInfo) {
      lines.push(`<b>Qo‘shimcha:</b> ${escapeHtml(credentials.additionalInfo)}`);
    }

    lines.push(
      '',
      `⚠️ <b>MUHIM — tartib bilan bajaring:</b>`,
      `1️⃣ Avval akkauntga <b>kiring va tekshiring</b> (hech narsani o‘zgartirmang)`,
      `2️⃣ Hammasi joyida bo‘lsa — <b>“Tasdiqlayman”</b> tugmasini bosing`,
      `3️⃣ Faqat shundan keyin parol/emailni o‘zingizga o‘zgartiring`,
      '',
      `<i>Agar tasdiqlashdan oldin ma’lumotlarni o‘zgartirsangiz va keyin qaytarish so‘rasangiz, ` +
        `sotuvchi dalil taqdim etib nizoni yutib olishi mumkin.</i>`,
      '',
      `⏱ Qaytarish muddati shu daqiqadan boshlandi:`,
      describeRefundPolicy(),
      '',
      `<i>${config.autoReleaseHours} soat ichida javob bermasangiz, pul avtomatik sotuvchiga o‘tadi.</i>`
    );

    await ctx.editMessageText(lines.join('\n'), {
      parse_mode: 'HTML',
      reply_markup: escrowActionButtons(escrowId).reply_markup,
    });
    await ctx.answerCbQuery(firstReveal ? '🔑 Ochildi — vaqt boshlandi' : '🔑 Qayta ko‘rsatildi');

    if (firstReveal) {
      const seller = await User.findById(hold.sellerId);
      if (seller?.telegramId) {
        await notificationService.notifySeller(
          seller.telegramId,
          `👀 <b>Xaridor ma’lumotlarni ochdi</b>\n\n` +
            `Mahsulot: ${escapeHtml(product?.title || '—')}\n` +
            `${config.autoReleaseHours} soat ichida e’tiroz bo‘lmasa, ` +
            `<b>${formatUzs(hold.sellerPayout)}</b> balansingizga o‘tadi.`
        );
      }
    }
  } catch (error: any) {
    if (error instanceof AlreadyProcessedError) {
      await ctx.answerCbQuery(error.message);
      return;
    }
    if (error instanceof ForbiddenError) {
      await ctx.answerCbQuery('Ruxsat yo‘q');
      return;
    }
    console.error('[Buyer] reveal failed:', error);
    await ctx.answerCbQuery('Xatolik yuz berdi');
  }
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
    const product = escrow.productId as any;
    const statusLabel: Record<string, string> = {
      holding: '🟡 Escrow’da',
      released: '✅ Yakunlangan',
      refunded: '🔄 Qaytarilgan',
      partial_refunded: '🔄 Qisman qaytarilgan',
      disputed: '⚖️ Nizoda',
    };

    const msg = [
      `${statusLabel[escrow.status] || escrow.status} <b>${escapeHtml(product?.title || 'Mahsulot')}</b>`,
      '',
      `💰 ${formatUzs(escrow.amount)}`,
      `🕐 ${new Date(escrow.boughtAt).toLocaleString('uz-UZ')}`,
      escrow.credentialsRevealedAt
        ? `🔑 Ochilgan: ${new Date(escrow.credentialsRevealedAt).toLocaleString('uz-UZ')}`
        : `🔒 Ma’lumotlar hali ochilmagan`,
    ].join('\n');

    if (escrow.status === 'holding') {
      const keyboard = escrow.credentialsRevealedAt
        ? escrowActionButtons(escrow._id.toString())
        : revealButton(escrow._id.toString());
      await ctx.replyWithHTML(msg, keyboard);
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

    const result = await paymentService.confirmAndRelease(escrowId, owned.user._id.toString());

    const escrow = await EscrowHold.findById(escrowId).populate('sellerId');
    const product = await Product.findById(escrow?.productId);
    const seller = escrow?.sellerId as any;

    if (seller?.telegramId) {
      await notificationService.notifySeller(
        seller.telegramId,
        `✅ <b>Xaridor bitimni tasdiqladi!</b>\n\n` +
          `Mahsulot: ${escapeHtml(product?.title || '—')}\n` +
          `Balansingizga: <b>${formatUzs(result.sellerPayout)}</b>\n` +
          `Komissiya (${config.platformCommission}%): ${formatUzs(result.commission)}`
      );
    }

    await ctx.editMessageText(
      [
        `✅ <b>Bitim yakunlandi!</b>`,
        '',
        `${escapeHtml(product?.title || 'Mahsulot')} bo‘yicha pul sotuvchiga o‘tkazildi.`,
        '',
        `⚠️ Endi akkaunt parolini, emailini va tiklash ma’lumotlarini <b>darhol</b> o‘zingizga o‘zgartiring!`,
        '',
        `<i>Sotuvchini baholang — bu boshqa xaridorlarga yordam beradi.</i>`,
      ].join('\n'),
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [1, 2, 3, 4, 5].map((n) => ({
              text: '⭐'.repeat(n),
              callback_data: `rate_${escrowId}_${n}`,
            })),
          ],
        },
      }
    );
    await ctx.answerCbQuery('✅ Tasdiqlandi!');
  } catch (error: any) {
    if (error instanceof AlreadyProcessedError) {
      await ctx.answerCbQuery('Bu buyurtma allaqachon yopilgan');
      return;
    }
    console.error('[Buyer] confirm failed:', error);
    await ctx.answerCbQuery('Xatolik yuz berdi');
  }
});

buyerHandler.action(/^rate_(.+)_([1-5])$/, async (ctx) => {
  try {
    const escrowId = ctx.match[1];
    const rating = parseInt(ctx.match[2], 10);

    const owned = await loadOwnedEscrow(ctx.from!.id, escrowId);
    if ('error' in owned) {
      await ctx.answerCbQuery(owned.error);
      return;
    }
    if (owned.escrow.buyerRating) {
      await ctx.answerCbQuery('Siz allaqachon baho bergansiz');
      return;
    }

    owned.escrow.buyerRating = rating;
    await owned.escrow.save();
    await User.findByIdAndUpdate(owned.escrow.sellerId, {
      $inc: { 'sellerStats.ratingSum': rating, 'sellerStats.ratingCount': 1 },
    });

    await ctx.editMessageReplyMarkup(undefined);
    await ctx.answerCbQuery(`Rahmat! Bahoyingiz: ${'⭐'.repeat(rating)}`);
  } catch (error) {
    await ctx.answerCbQuery('Xatolik yuz berdi');
  }
});

buyerHandler.action(/^refund_escrow_(.+)$/, async (ctx) => {
  const escrowId = ctx.match[1];
  const owned = await loadOwnedEscrow(ctx.from!.id, escrowId);
  if ('error' in owned) {
    await ctx.answerCbQuery(owned.error);
    return;
  }

  // Show the buyer exactly what they will receive before they commit to anything.
  const quote = await paymentService.quoteRefundFor(escrowId);

  if (!quote.allowed) {
    await ctx.editMessageText(
      `❌ <b>Avtomatik qaytarish mumkin emas</b>\n\n${quote.message}\n\n` +
        `Nizo ochish uchun: ${botApi.supportLink()}`,
      { parse_mode: 'HTML' }
    );
    await ctx.answerCbQuery();
    return;
  }

  await ctx.editMessageText(
    [
      `<b>🔄 Qaytarish hisob-kitobi</b>`,
      '',
      `<b>Davr:</b> ${quote.label} (${quote.elapsedMinutes} daqiqa o‘tdi)`,
      `<b>Jarima:</b> ${quote.penaltyPercent}% — ${formatUzs(quote.penaltyAmount)}`,
      `<b>Sizga qaytariladi:</b> <b>${formatUzs(quote.refundToBuyer)}</b>`,
      '',
      quote.requiresArbitration
        ? `⚠️ <i>Sizda so‘nggi 30 kunda ko‘p qaytarish bo‘lgan. So‘rov admin ko‘rigiga yuboriladi.</i>`
        : `<i>Sababni tanlang:</i>`,
    ].join('\n'),
    { parse_mode: 'HTML', reply_markup: refundReasonButtons(escrowId).reply_markup }
  );
  await ctx.answerCbQuery();
});

buyerHandler.action(/^rr_(not_working|wrong_info|recovered|other)_(.+)$/, async (ctx) => {
  const reasonType = ctx.match[1];
  const escrowId = ctx.match[2];

  const reasonMap: Record<string, string> = {
    not_working: 'Akkaunt ishlamayapti (login/parol noto‘g‘ri)',
    wrong_info: 'E’londagi ma’lumot haqiqatga mos emas',
    recovered: 'Asl egasi akkauntni qaytarib oldi',
    other: 'Boshqa sabab',
  };

  await ctx.editMessageText(
    `<b>🔄 Tasdiqlash</b>\n\nSabab: <b>${reasonMap[reasonType]}</b>\n\n` +
      `<i>Qaytarishni yakuniy tasdiqlaysizmi? Bu amalni bekor qilib bo‘lmaydi.</i>`,
    { parse_mode: 'HTML', reply_markup: refundConfirmButtons(escrowId, reasonType).reply_markup }
  );
  await ctx.answerCbQuery();
});

buyerHandler.action(/^rdo_(not_working|wrong_info|recovered|other)_(.+)$/, async (ctx) => {
  try {
    const reasonType = ctx.match[1];
    const escrowId = ctx.match[2];

    const reasonMap: Record<string, string> = {
      not_working: 'Akkaunt ishlamayapti (login/parol noto‘g‘ri)',
      wrong_info: 'E’londagi ma’lumot haqiqatga mos emas',
      recovered: 'Asl egasi akkauntni qaytarib oldi',
      other: 'Boshqa sabab',
    };
    const reason = reasonMap[reasonType] || 'Boshqa sabab';

    const owned = await loadOwnedEscrow(ctx.from!.id, escrowId);
    if ('error' in owned) {
      await ctx.answerCbQuery(owned.error);
      return;
    }

    const escrow = await EscrowHold.findById(escrowId)
      .populate('buyerId')
      .populate('sellerId')
      .populate('productId');
    if (!escrow) {
      await ctx.answerCbQuery('Buyurtma topilmadi');
      return;
    }

    const result = await paymentService.processRefund(escrowId, reason, owned.user._id.toString());

    if (!result.allowed) {
      await ctx.editMessageText(`❌ <b>Qaytarish mumkin emas</b>\n\n${result.message}`, {
        parse_mode: 'HTML',
      });
      await ctx.answerCbQuery();
      return;
    }

    await ctx.editMessageText(
      [
        `🔄 <b>Qaytarish bajarildi</b>`,
        '',
        `<b>Sabab:</b> ${reason}`,
        `<b>Jarima:</b> ${formatUzs(result.penaltyAmount ?? 0)}`,
        `<b>Balansingizga qaytarildi:</b> <b>${formatUzs(result.refundToBuyer ?? 0)}</b>`,
        '',
        `<i>Pulni kartangizga yechish uchun “💰 Balans” → “Pul yechish”.</i>`,
      ].join('\n'),
      { parse_mode: 'HTML' }
    );
    await ctx.answerCbQuery('Qaytarildi');

    const product = escrow.productId as any;
    const buyer = escrow.buyerId as any;
    const seller = escrow.sellerId as any;

    await notificationService.notifyRefundToAdmin({
      buyer: `@${buyer.username || buyer.telegramId}`,
      seller: `@${seller.username || seller.telegramId}`,
      productTitle: product?.title || '—',
      amount: escrow.amount,
      reason,
      quote: result.quote,
      escrowId,
      sellerId: String(seller._id),
      productId: String(product?._id),
    });

    if (seller?.telegramId) {
      await notificationService.notifySeller(
        seller.telegramId,
        [
          `🔄 <b>Xaridor qaytarish so‘radi</b>`,
          '',
          `Mahsulot: ${escapeHtml(product?.title || '—')}`,
          `Sabab: ${reason}`,
          `Sizga kompensatsiya: <b>${formatUzs(result.sellerKeeps ?? 0)}</b>`,
          '',
          `<i>Agar xaridor akkauntni o‘zlashtirib olib qaytargan bo‘lsa — dalil bilan ` +
            `nizo oching: ${botApi.supportLink()}</i>`,
        ].join('\n')
      );
    }
  } catch (error: any) {
    if (error instanceof AlreadyProcessedError) {
      await ctx.answerCbQuery('Bu buyurtma allaqachon yopilgan');
      return;
    }
    console.error('[Buyer] refund failed:', error);
    await ctx.answerCbQuery('Xatolik yuz berdi');
  }
});

buyerHandler.action(/^refund_cancel_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery('Bekor qilindi');
  await ctx.reply('Qaytarish jarayoni bekor qilindi.', mainMenuKeyboard);
});

buyerHandler.action(/^help_escrow_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.replyWithHTML(
    [
      `<b>❓ Escrow qanday ishlaydi</b>`,
      '',
      `<b>✅ Tasdiqlayman</b> — akkaunt joyida, pul sotuvchiga o‘tadi.`,
      `<b>🔄 Qaytarish</b> — muammo bo‘lsa, siyosat bo‘yicha pul qaytariladi.`,
      '',
      `<b>Qaytarish shartlari</b> (ma’lumotlarni ochgan vaqtdan hisoblanadi):`,
      describeRefundPolicy(),
      '',
      `<i>Vaqt to‘lov emas, ma’lumotlarni ochgan daqiqadan boshlanadi — ` +
        `to‘lov siz uxlab yotganingizda tasdiqlanishi mumkin.</i>`,
    ].join('\n')
  );
});
