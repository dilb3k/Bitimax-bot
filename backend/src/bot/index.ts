import { Telegraf, Scenes, session } from 'telegraf';
import { config } from '../config';
import { connectDatabase } from '../db/mongoose';
import { notificationService } from '../services/notificationService';
import { startHandler } from './handlers/start';
import { sellerHandler, createSellerWizard } from './handlers/seller';
import { buyerHandler } from './handlers/buyer';
import { adminHandler } from './handlers/admin';

async function startBot() {
  await connectDatabase();

  if (!config.botToken || config.botToken === 'YOUR_BOT_TOKEN_HERE') {
    console.error('[Bot] BOT_TOKEN is not configured!');
    console.error('[Bot] Please set BOT_TOKEN in .env file');
    process.exit(1);
  }

  const bot = new Telegraf(config.botToken);

  notificationService.setBot(bot);

  const stage = new Scenes.Stage<any>([createSellerWizard()]);

  bot.use(session());
  bot.use(stage.middleware());

  bot.use(startHandler);
  bot.use(sellerHandler);
  bot.use(buyerHandler);
  bot.use(adminHandler);

  // Settings callback handlers
  bot.action('settings_notifications', async (ctx) => {
    const user = await require('../models/User').User.findOne({ telegramId: ctx.from!.id });
    if (!user) return;

    user.notificationSettings.newOrder = !user.notificationSettings.newOrder;
    await user.save();

    await ctx.answerCbQuery('Bildirishnoma sozlamalari yangilandi');
    await ctx.replyWithHTML(
      `✅ Bildirishnomalar yangilandi:\n` +
      `• Yangi buyurtma: ${user.notificationSettings.newOrder ? '✅' : '❌'}\n` +
      `• To'lov: ${user.notificationSettings.paymentConfirm ? '✅' : '❌'}\n` +
      `• Qaytarish: ${user.notificationSettings.refundUpdate ? '✅' : '❌'}`
    );
  });

  bot.action('back_main', async (ctx) => {
    await ctx.deleteMessage();
    await ctx.reply('Asosiy menu', {
      reply_markup: {
        keyboard: [
          ['🛍 Mahsulotlar', '💰 Balans'],
          ['📦 Mening buyurtmalarim', '📋 E\'lonlarim'],
          ['⚙️ Sozlamalar', '❓ Yordam'],
        ],
        resize_keyboard: true,
      },
    });
    await ctx.answerCbQuery();
  });

  // Category browsing
  bot.action(/^cat_(.+)$/, async (ctx) => {
    const category = ctx.match[1];
    const Product = require('../models/Product').Product;
    const products = await Product.find({ status: 'active', category })
      .select('-sensitiveData')
      .sort('-createdAt')
      .limit(10)
      .populate('sellerId', 'telegramId username');

    if (products.length === 0) {
      await ctx.editMessageText(
        `Bu kategoriyada mahsulot topilmadi: ${category}`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    let msg = `<b>📂 ${category}</b>\n\n`;
    for (const p of products) {
      msg += `• <b>${p.title}</b> — ${p.price.toLocaleString()} UZS\n`;
    }

    await ctx.editMessageText(msg, { parse_mode: 'HTML' });
    await ctx.answerCbQuery();
  });

  bot.command('next', async (ctx) => {
    const { products, total, pages } = await require('./services/api').botApi.getActiveProducts(1, 10);
    // Simple pagination - in production track page per user
    await ctx.replyWithHTML(`Barcha mahsulotlar: ${total} | Sahifalar: ${pages}`);
  });

  // Error handler
  bot.catch((err: any, ctx: any) => {
    console.error(`[Bot] Error for ${ctx.updateType}:`, err);
  });

  // Launch
  await bot.launch();
  console.log(`[Bot] Bitimax bot started`);

  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

startBot().catch(console.error);
