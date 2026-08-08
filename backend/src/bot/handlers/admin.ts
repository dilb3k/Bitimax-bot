import { Composer } from 'telegraf';
import { User } from '../../models/User';
import { Product } from '../../models/Product';
import { EscrowHold } from '../../models/EscrowHold';
import { Transaction } from '../../models/Transaction';
import { PaymentInbox } from '../../models/PaymentInbox';
import { Payout } from '../../models/Payout';
import { Dispute } from '../../models/Dispute';
import { audit } from '../../models/AuditLog';
import { notificationService } from '../../services/notificationService';
import { payoutService } from '../../services/payoutService';
import { ledgerService, accounts } from '../../services/ledgerService';
import { adminMenuKeyboard, moderationButtons, payoutButtons } from '../keyboards';
import { config, isAdminTelegramId } from '../../config';
import { escapeHtml, formatUzs } from '../../utils/helpers';

export const adminHandler = new Composer();

/** Resolves the acting admin, or null when the caller isn't one. */
async function requireAdmin(ctx: any) {
  const telegramId = ctx.from?.id;
  if (!telegramId || !isAdminTelegramId(telegramId)) return null;
  return User.findOne({ telegramId });
}

adminHandler.use(async (ctx, next) => {
  const telegramId = ctx.from?.id;
  if (telegramId && isAdminTelegramId(telegramId)) {
    await User.updateOne({ telegramId, role: { $ne: 'admin' } }, { $set: { role: 'admin' } });
  }
  return next();
});

adminHandler.hears('👥 Foydalanuvchilar', async (ctx) => {
  if (!(await requireAdmin(ctx))) return;

  const [total, buyers, sellers, blocked, flagged] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: 'buyer' }),
    User.countDocuments({ role: 'seller' }),
    User.countDocuments({ isBlocked: true }),
    User.countDocuments({ refundAutoDisabled: true }),
  ]);

  await ctx.replyWithHTML(
    [
      `<b>👥 Foydalanuvchilar</b>`,
      '',
      `Jami: <b>${total}</b>`,
      `Xaridorlar: ${buyers}`,
      `Sotuvchilar: ${sellers}`,
      `Bloklangan: ${blocked}`,
      `Qaytarish cheklangan: ${flagged}`,
    ].join('\n')
  );
});

adminHandler.hears('📊 Statistika', async (ctx) => {
  if (!(await requireAdmin(ctx))) return;

  const [
    totalProducts,
    activeProducts,
    pendingReview,
    soldProducts,
    totalTransactions,
    pendingPayments,
    escrowHolding,
    unmatchedInbox,
    pendingPayouts,
    openDisputes,
  ] = await Promise.all([
    Product.countDocuments(),
    Product.countDocuments({ status: 'active' }),
    Product.countDocuments({ status: 'pending_review' }),
    Product.countDocuments({ status: 'sold' }),
    Transaction.countDocuments(),
    Transaction.countDocuments({ status: 'pending_payment' }),
    EscrowHold.countDocuments({ status: 'holding' }),
    PaymentInbox.countDocuments({ status: 'unmatched' }),
    Payout.countDocuments({ status: { $in: ['requested', 'approved', 'processing'] } }),
    Dispute.countDocuments({ status: { $in: ['open', 'under_review'] } }),
  ]);

  // Revenue and float come from the ledger, not from summing documents — the journal is the
  // only place these numbers are guaranteed to be internally consistent.
  const [revenue, escrowFloat] = await Promise.all([
    ledgerService.balanceOf(accounts.platformRevenue),
    (async () => {
      const balances = await ledgerService.allBalances();
      return Object.entries(balances)
        .filter(([account]) => account.startsWith('escrow:'))
        .reduce((sum, [, value]) => sum + value, 0);
    })(),
  ]);

  await ctx.replyWithHTML(
    [
      `<b>📊 Platforma statistikasi</b>`,
      '',
      `<b>💰 Moliya</b>`,
      `Platforma daromadi: <b>${formatUzs(revenue)}</b>`,
      `Escrow’dagi pul: <b>${formatUzs(escrowFloat)}</b>`,
      '',
      `<b>📦 Mahsulotlar</b>`,
      `Jami: ${totalProducts} | Faol: ${activeProducts} | Sotilgan: ${soldProducts}`,
      `Moderatsiyada: <b>${pendingReview}</b>`,
      '',
      `<b>💳 Tranzaksiyalar</b>`,
      `Jami: ${totalTransactions} | Kutilayotgan: ${pendingPayments}`,
      `Escrow’da: ${escrowHolding}`,
      '',
      `<b>⚠️ E’tibor talab qiladi</b>`,
      `Egasi topilmagan to‘lov: <b>${unmatchedInbox}</b>`,
      `Pul yechish so‘rovi: <b>${pendingPayouts}</b>`,
      `Ochiq nizolar: <b>${openDisputes}</b>`,
    ].join('\n')
  );
});

// ─── Moderation ────────────────────────────────────────────────────────────────

adminHandler.hears('🛡 Moderatsiya', async (ctx) => {
  if (!(await requireAdmin(ctx))) return;

  const queue = await Product.find({ status: 'pending_review' })
    .sort('createdAt')
    .limit(10)
    .populate('sellerId', 'telegramId username trustLevel sellerStats');

  if (queue.length === 0) {
    await ctx.reply('✅ Moderatsiya navbati bo‘sh.');
    return;
  }

  for (const product of queue) {
    const seller = product.sellerId as any;
    await ctx.replyWithHTML(
      [
        `<b>🛡 Ko‘rikda: ${escapeHtml(product.title)}</b>`,
        '',
        escapeHtml(product.description.slice(0, 500)),
        '',
        `Narx: <b>${formatUzs(product.price)}</b>`,
        `Kategoriya: ${escapeHtml(product.category)}`,
        `Sotuvchi: @${escapeHtml(seller?.username || String(seller?.telegramId))} (${seller?.trustLevel})`,
        `Sotgan: ${seller?.sellerStats?.sold ?? 0} | Qaytarilgan: ${seller?.sellerStats?.refunded ?? 0}`,
      ].join('\n'),
      moderationButtons(String(product._id))
    );
  }
});

adminHandler.action(/^mod_approve_(.+)$/, async (ctx) => {
  const admin = await requireAdmin(ctx);
  if (!admin) return void ctx.answerCbQuery('Ruxsat yo‘q');

  const productId = ctx.match[1];
  const product = await Product.findOneAndUpdate(
    { _id: productId, status: 'pending_review' },
    { $set: { status: 'active', moderatedBy: admin._id, moderatedAt: new Date() } },
    { new: true }
  );
  if (!product) return void ctx.answerCbQuery('Topilmadi yoki allaqachon ko‘rilgan');

  await audit({
    actorId: admin._id as any,
    action: 'product.approved',
    targetType: 'Product',
    targetId: product._id as any,
  });

  const seller = await User.findById(product.sellerId);
  await notificationService.notifySeller(
    seller?.telegramId,
    `✅ <b>E’loningiz tasdiqlandi</b>\n\n${escapeHtml(product.title)} — endi katalogda ko‘rinadi.`
  );

  await ctx.editMessageText(`✅ Tasdiqlandi: ${escapeHtml(product.title)}`, { parse_mode: 'HTML' });
  await ctx.answerCbQuery('Tasdiqlandi');
});

adminHandler.action(/^mod_reject_(.+)$/, async (ctx) => {
  const admin = await requireAdmin(ctx);
  if (!admin) return void ctx.answerCbQuery('Ruxsat yo‘q');

  const productId = ctx.match[1];
  const product = await Product.findOneAndUpdate(
    { _id: productId, status: 'pending_review' },
    {
      $set: {
        status: 'rejected',
        moderatedBy: admin._id,
        moderatedAt: new Date(),
        moderationNote: 'Moderator rad etdi',
      },
    },
    { new: true }
  );
  if (!product) return void ctx.answerCbQuery('Topilmadi yoki allaqachon ko‘rilgan');

  await audit({
    actorId: admin._id as any,
    action: 'product.rejected',
    targetType: 'Product',
    targetId: product._id as any,
  });

  const seller = await User.findById(product.sellerId);
  await notificationService.notifySeller(
    seller?.telegramId,
    `❌ <b>E’loningiz rad etildi</b>\n\n${escapeHtml(product.title)}\n\n` +
      `Sabab bo‘yicha savollar uchun: https://t.me/${config.supportUsername}`
  );

  await ctx.editMessageText(`❌ Rad etildi: ${escapeHtml(product.title)}`, { parse_mode: 'HTML' });
  await ctx.answerCbQuery('Rad etildi');
});

// ─── Payouts ───────────────────────────────────────────────────────────────────

adminHandler.hears('💸 To‘lov so‘rovlari', async (ctx) => {
  if (!(await requireAdmin(ctx))) return;

  const pending = await payoutService.listPending(10);
  if (pending.length === 0) {
    await ctx.reply('✅ Pul yechish so‘rovlari yo‘q.');
    return;
  }

  for (const payout of pending) {
    const user = payout.userId as any;
    await ctx.replyWithHTML(
      [
        `<b>💸 Pul yechish so‘rovi</b>`,
        '',
        `Foydalanuvchi: @${escapeHtml(user?.username || String(user?.telegramId))}`,
        `Summa: <b>${formatUzs(payout.amount)}</b>`,
        `Komissiya: ${formatUzs(payout.fee)}`,
        `O‘tkazish: <b>${formatUzs(payout.netAmount)}</b>`,
        `Karta: <code>${payout.destinationMasked}</code>`,
        `Egasi: ${escapeHtml(payout.destinationHolder || '—')}`,
        `Sana: ${payout.requestedAt.toLocaleString('uz-UZ')}`,
      ].join('\n'),
      payoutButtons(String(payout._id))
    );
  }
});

adminHandler.action(/^po_reveal_(.+)$/, async (ctx) => {
  const admin = await requireAdmin(ctx);
  if (!admin) return void ctx.answerCbQuery('Ruxsat yo‘q');

  try {
    const card = await payoutService.revealDestination(ctx.match[1], String(admin._id));
    // Sent as a separate message so it isn't left sitting in an edited queue entry.
    await ctx.reply(`💳 Karta: <code>${card}</code>`, { parse_mode: 'HTML' });
    await ctx.answerCbQuery('Ko‘rsatildi (audit qilindi)');
  } catch (error: any) {
    await ctx.answerCbQuery(error.message);
  }
});

adminHandler.action(/^po_paid_(.+)$/, async (ctx) => {
  const admin = await requireAdmin(ctx);
  if (!admin) return void ctx.answerCbQuery('Ruxsat yo‘q');

  try {
    const payout = await payoutService.markPaid(ctx.match[1], String(admin._id));
    const user = await User.findById(payout.userId);
    await notificationService.send({
      type: 'buyer',
      chatId: user?.telegramId,
      message: `✅ <b>Pul yuborildi</b>\n\n${formatUzs(payout.netAmount)} kartangizga o‘tkazildi.`,
    });
    await ctx.editMessageText(`✅ To‘landi: ${formatUzs(payout.netAmount)}`, { parse_mode: 'HTML' });
    await ctx.answerCbQuery('Belgilandi');
  } catch (error: any) {
    await ctx.answerCbQuery(error.message);
  }
});

adminHandler.action(/^po_reject_(.+)$/, async (ctx) => {
  const admin = await requireAdmin(ctx);
  if (!admin) return void ctx.answerCbQuery('Ruxsat yo‘q');

  try {
    const payout = await payoutService.reject(ctx.match[1], String(admin._id), 'Admin rad etdi');
    const user = await User.findById(payout.userId);
    await notificationService.send({
      type: 'buyer',
      chatId: user?.telegramId,
      message:
        `❌ <b>Pul yechish rad etildi</b>\n\n${formatUzs(payout.amount)} balansingizga qaytarildi.\n` +
        `Savollar uchun: https://t.me/${config.supportUsername}`,
    });
    await ctx.editMessageText('❌ Rad etildi, pul balansga qaytarildi', { parse_mode: 'HTML' });
    await ctx.answerCbQuery('Rad etildi');
  } catch (error: any) {
    await ctx.answerCbQuery(error.message);
  }
});

// ─── Payment inbox ─────────────────────────────────────────────────────────────

adminHandler.hears('📥 To‘lov inbox', async (ctx) => {
  if (!(await requireAdmin(ctx))) return;

  const unmatched = await PaymentInbox.find({ status: 'unmatched' }).sort('receivedAt').limit(10);
  if (unmatched.length === 0) {
    await ctx.reply('✅ Barcha to‘lovlar buyurtmalarga bog‘langan.');
    return;
  }

  const lines = unmatched.map(
    (item) =>
      `• <b>${item.parsedAmount ? formatUzs(item.parsedAmount) : '—'}</b> — ` +
      `${item.receivedAt.toLocaleString('uz-UZ')}\n  <code>${escapeHtml(item.rawText.slice(0, 90))}</code>`
  );

  await ctx.replyWithHTML(
    [
      `<b>📥 Egasi topilmagan to‘lovlar (${unmatched.length})</b>`,
      '',
      ...lines,
      '',
      `<i>Bu pullar bankka tushgan. Har birini tekshirib, xaridorga qo‘lda ` +
        `balans qo‘shing yoki pulni qaytaring.</i>`,
    ].join('\n')
  );
});

// ─── Disputes ──────────────────────────────────────────────────────────────────

adminHandler.hears('⚖️ Nizolar', async (ctx) => {
  if (!(await requireAdmin(ctx))) return;

  const disputes = await Dispute.find({ status: { $in: ['open', 'under_review'] } })
    .sort('slaDueAt')
    .limit(10)
    .populate('buyerId', 'username telegramId')
    .populate('sellerId', 'username telegramId')
    .populate('productId', 'title');

  if (disputes.length === 0) {
    await ctx.reply('✅ Ochiq nizolar yo‘q.');
    return;
  }

  for (const dispute of disputes) {
    const buyer = dispute.buyerId as any;
    const seller = dispute.sellerId as any;
    const product = dispute.productId as any;

    await ctx.replyWithHTML(
      [
        `<b>⚖️ Nizo — ${dispute.category}</b>`,
        '',
        `Mahsulot: ${escapeHtml(product?.title || '—')}`,
        `Summa: <b>${formatUzs(dispute.amount)}</b>`,
        `Xaridor: @${escapeHtml(buyer?.username || String(buyer?.telegramId))}`,
        `Sotuvchi: @${escapeHtml(seller?.username || String(seller?.telegramId))}`,
        `Sabab: ${escapeHtml(dispute.reason)}`,
        `Dalillar: ${dispute.evidence.length} ta`,
        `SLA: ${dispute.slaDueAt.toLocaleString('uz-UZ')}`,
        '',
        `<i>Hal qilish: /dispute_${dispute._id}</i>`,
      ].join('\n')
    );
  }
});

// ─── User actions ──────────────────────────────────────────────────────────────

/**
 * Blocks the seller behind a refund alert. The callback carries the *seller* id directly —
 * v1 packed an escrow id into both `admin_ban_` and `admin_ban_seller_`, and because the
 * shorter pattern was registered first it swallowed the longer one and then looked up
 * "seller_<id>" as an ObjectId, throwing on every use.
 */
adminHandler.action(/^adm_ban_(.+)$/, async (ctx) => {
  const admin = await requireAdmin(ctx);
  if (!admin) return void ctx.answerCbQuery('Ruxsat yo‘q');

  const userId = ctx.match[1];
  const target = await User.findByIdAndUpdate(
    userId,
    { $set: { isBlocked: true, blockReason: 'Admin tomonidan bloklandi' } },
    { new: true }
  ).catch(() => null);

  if (!target) return void ctx.answerCbQuery('Foydalanuvchi topilmadi');

  // Pull their listings out of the catalog too, otherwise a blocked scammer's accounts stay buyable.
  await Product.updateMany(
    { sellerId: target._id, status: { $in: ['active', 'pending_review'] } },
    { $set: { status: 'archived' } }
  );

  await audit({
    actorId: admin._id as any,
    action: 'user.blocked',
    targetType: 'User',
    targetId: target._id as any,
  });

  await ctx.answerCbQuery('🚫 Bloklandi');
  await ctx.reply(`🚫 @${target.username || target.telegramId} bloklandi va e’lonlari arxivlandi.`);
});

adminHandler.action(/^adm_delprod_(.+)$/, async (ctx) => {
  const admin = await requireAdmin(ctx);
  if (!admin) return void ctx.answerCbQuery('Ruxsat yo‘q');

  const product = await Product.findByIdAndUpdate(
    ctx.match[1],
    { $set: { status: 'archived' } },
    { new: true }
  ).catch(() => null);

  if (!product) return void ctx.answerCbQuery('Mahsulot topilmadi');

  await audit({
    actorId: admin._id as any,
    action: 'product.archived',
    targetType: 'Product',
    targetId: product._id as any,
  });

  await ctx.answerCbQuery('🗑 Arxivlandi');
  await ctx.reply(`🗑 E’lon arxivlandi: ${escapeHtml(product.title)}`);
});

adminHandler.action(/^adm_details_(.+)$/, async (ctx) => {
  if (!(await requireAdmin(ctx))) return void ctx.answerCbQuery('Ruxsat yo‘q');

  const escrow = await EscrowHold.findById(ctx.match[1])
    .populate('buyerId', 'telegramId username firstName buyerStats')
    .populate('sellerId', 'telegramId username firstName sellerStats trustLevel')
    .populate('productId', 'title price category')
    .catch(() => null);

  if (!escrow) return void ctx.answerCbQuery('Topilmadi');

  const product = escrow.productId as any;
  const buyer = escrow.buyerId as any;
  const seller = escrow.sellerId as any;

  await ctx.reply(
    [
      `<b>📋 Escrow tafsilotlari</b>`,
      '',
      `Mahsulot: ${escapeHtml(product?.title || '—')}`,
      `Summa: ${formatUzs(escrow.amount)}`,
      `Komissiya: ${formatUzs(escrow.commission)}`,
      `Sotuvchi ulushi: ${formatUzs(escrow.sellerPayout)}`,
      '',
      `Xaridor: @${escapeHtml(buyer?.username || String(buyer?.telegramId))} ` +
        `(xarid: ${buyer?.buyerStats?.purchased ?? 0}, qaytargan: ${buyer?.buyerStats?.refunded ?? 0})`,
      `Sotuvchi: @${escapeHtml(seller?.username || String(seller?.telegramId))} (${seller?.trustLevel})`,
      '',
      `Holat: <b>${escrow.status}</b>`,
      `Sotib olingan: ${escrow.boughtAt.toLocaleString('uz-UZ')}`,
      `Ma’lumot ochilgan: ${escrow.credentialsRevealedAt?.toLocaleString('uz-UZ') || 'ochilmagan'}`,
      `Ko‘rish soni: ${escrow.credentialRevealCount}`,
      `Sabab: ${escapeHtml(escrow.refundReason || '—')}`,
    ].join('\n'),
    { parse_mode: 'HTML' }
  );
  await ctx.answerCbQuery();
});

adminHandler.action('admin_menu', async (ctx) => {
  if (!(await requireAdmin(ctx))) return void ctx.answerCbQuery('Ruxsat yo‘q');
  await ctx.reply('Admin menyusi', adminMenuKeyboard);
  await ctx.answerCbQuery();
});
