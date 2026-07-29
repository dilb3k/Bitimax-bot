import { Composer } from 'telegraf';
import { User } from '../../models/User';
import { Product } from '../../models/Product';
import { EscrowHold } from '../../models/EscrowHold';
import { Transaction } from '../../models/Transaction';
import { notificationService } from '../../services/notificationService';
import { adminMenuKeyboard, mainMenuKeyboard } from '../keyboards';
import { config } from '../../config';

export const adminHandler = new Composer();

function isAdmin(telegramId: number): boolean {
  return String(telegramId) === config.adminChatId;
}

adminHandler.use(async (ctx, next) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return next();

  if (String(telegramId) === config.adminChatId) {
    const user = await User.findOne({ telegramId });
    if (user && user.role !== 'admin') {
      user.role = 'admin';
      await user.save();
    }
  }
  return next();
});

adminHandler.hears('👥 Foydalanuvchilar', async (ctx) => {
  if (!isAdmin(ctx.from!.id)) return;

  const totalUsers = await User.countDocuments();
  const buyers = await User.countDocuments({ role: 'buyer' });
  const sellers = await User.countDocuments({ role: 'seller' });
  const blocked = await User.countDocuments({ isBlocked: true });

  const msg = `
<b>👥 Foydalanuvchilar Statistikasi</b>

<b>Jami:</b> ${totalUsers}
<b>Xaridorlar:</b> ${buyers}
<b>Sotuvchilar:</b> ${sellers}
<b>Bloklangan:</b> ${blocked}
  `.trim();

  await ctx.replyWithHTML(msg);
});

adminHandler.hears('📊 Statistika', async (ctx) => {
  if (!isAdmin(ctx.from!.id)) return;

  const totalProducts = await Product.countDocuments();
  const activeProducts = await Product.countDocuments({ status: 'active' });
  const soldProducts = await Product.countDocuments({ status: 'sold' });
  const totalTransactions = await Transaction.countDocuments();
  const pendingPayments = await Transaction.countDocuments({ status: 'pending_payment' });
  const escrowHolding = await EscrowHold.countDocuments({ status: 'holding' });

  const msg = `
<b>📊 Platforma Statistikasi</b>

<b>Mahsulotlar:</b>
• Jami: ${totalProducts}
• Faol: ${activeProducts}
• Sotilgan: ${soldProducts}

<b>Tranzaksiyalar:</b>
• Jami: ${totalTransactions}
• Kutilayotgan to\'lov: ${pendingPayments}

<b>Escrow:</b>
• Kafildagi: ${escrowHolding}
  `.trim();

  await ctx.replyWithHTML(msg);
});

adminHandler.action(/^admin_delete_product_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from!.id)) {
    await ctx.answerCbQuery('Ruxsat yo\'q');
    return;
  }

  try {
    const escrowId = ctx.match[1];
    const escrow = await EscrowHold.findById(escrowId);
    if (escrow) {
      await Product.findByIdAndUpdate(escrow.productId, { status: 'refunded' });
      await ctx.editMessageText('✅ Mahsulot o\'chirildi (refunded status)', { parse_mode: 'HTML' });
    } else {
      await Product.findByIdAndUpdate(escrowId, { status: 'refunded' });
      await ctx.editMessageText('✅ Mahsulot o\'chirildi', { parse_mode: 'HTML' });
    }
    await ctx.answerCbQuery('✅ Bajarildi');
  } catch (error) {
    await ctx.answerCbQuery('Xatolik yuz berdi');
  }
});

adminHandler.action(/^admin_ban_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from!.id)) {
    await ctx.answerCbQuery('Ruxsat yo\'q');
    return;
  }

  try {
    const escrowId = ctx.match[1];
    const escrow = await EscrowHold.findById(escrowId);
    if (escrow) {
      await User.findByIdAndUpdate(escrow.sellerId, { isBlocked: true });
      await ctx.editMessageText('🚫 Sotuvchi bloklandi', { parse_mode: 'HTML' });
    }
    await ctx.answerCbQuery('✅ Bajarildi');
  } catch (error) {
    await ctx.answerCbQuery('Xatolik yuz berdi');
  }
});

adminHandler.action(/^admin_ban_seller_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from!.id)) {
    await ctx.answerCbQuery('Ruxsat yo\'q');
    return;
  }

  try {
    const productId = ctx.match[1];
    const product = await Product.findById(productId);
    if (product) {
      await User.findByIdAndUpdate(product.sellerId, { isBlocked: true });
      await Product.findByIdAndUpdate(productId, { status: 'refunded' });
      await ctx.editMessageText('🚫 Sotuvchi bloklandi va mahsulot o\'chirildi', { parse_mode: 'HTML' });
    }
    await ctx.answerCbQuery('✅ Bajarildi');
  } catch (error) {
    await ctx.answerCbQuery('Xatolik yuz berdi');
  }
});

adminHandler.action(/^admin_details_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from!.id)) return;

  try {
    const escrowId = ctx.match[1];
    const escrow = await EscrowHold.findById(escrowId)
      .populate('buyerId', 'telegramId username firstName')
      .populate('sellerId', 'telegramId username firstName')
      .populate('productId', 'title price category');

    if (!escrow) {
      await ctx.answerCbQuery('Topilmadi');
      return;
    }

    const product = escrow.productId as any;
    const buyer = escrow.buyerId as any;
    const seller = escrow.sellerId as any;

    const msg = `
<b>📋 Escrow Tafsilotlari</b>

<b>Mahsulot:</b> ${product?.title || 'N/A'}
<b>Narx:</b> ${escrow.amount.toLocaleString()} UZS
<b>Komissiya:</b> ${escrow.commission.toLocaleString()} UZS
<b>Sotuvchi oladi:</b> ${escrow.sellerPayout.toLocaleString()} UZS

<b>Xaridor:</b> ${buyer?.firstName || ''} @${buyer?.username || buyer?.telegramId || 'N/A'}
<b>Sotuvchi:</b> ${seller?.firstName || ''} @${seller?.username || seller?.telegramId || 'N/A'}

<b>Holat:</b> ${escrow.status}
<b>Sotib olingan:</b> ${new Date(escrow.boughtAt).toLocaleString('uz-UZ')}
<b>Sabab:</b> ${escrow.refundReason || 'Yo\'q'}
    `.trim();

    await ctx.editMessageText(msg, { parse_mode: 'HTML' });
    await ctx.answerCbQuery();
  } catch (error) {
    await ctx.answerCbQuery('Xatolik');
  }
});

adminHandler.action('admin_menu', async (ctx) => {
  await ctx.reply('Admin menyusi', adminMenuKeyboard);
  await ctx.answerCbQuery();
});

adminHandler.hears('🏠 Asosiy menu', async (ctx) => {
  const telegramId = ctx.from!.id;
  const user = await User.findOne({ telegramId });
  const keyboard = user?.role === 'admin' ? adminMenuKeyboard :
                   user?.role === 'seller' ? adminMenuKeyboard :
                   mainMenuKeyboard;
  await ctx.reply('Asosiy menu', keyboard);
});

adminHandler.hears('⚙️ Sozlamalar', async (ctx) => {
  const user = await User.findOne({ telegramId: ctx.from!.id });
  if (!user) return;

  const msg = `
<b>⚙️ Sozlamalar</b>

<b>Rol:</b> ${user.role}
<b>Bildirishnomalar:</b>
• Yangi buyurtma: ${user.notificationSettings.newOrder ? '✅' : '❌'}
• To'lov tasdiqlash: ${user.notificationSettings.paymentConfirm ? '✅' : '❌'}
• Qaytarish: ${user.notificationSettings.refundUpdate ? '✅' : '❌'}
  `.trim();

  await ctx.replyWithHTML(msg, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📢 Bildirishnomalar', callback_data: 'settings_notifications' }],
        [{ text: '⬅ Orqaga', callback_data: 'back_main' }],
      ],
    },
  });
});
