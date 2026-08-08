import { Telegraf, Scenes, session } from 'telegraf';
import { config } from '../config';
import { connectDatabase } from '../db/mongoose';
import { notificationService } from '../services/notificationService';
import { startHandler } from './handlers/start';
import { sellerHandler, createSellerWizard } from './handlers/seller';
import { buyerHandler } from './handlers/buyer';
import { adminHandler } from './handlers/admin';

/**
 * Starts the Telegraf bot (long-polling). Assumes the caller has already connected to
 * the database — this lets it run either standalone (see the bottom of this file) or
 * embedded in the same process as the HTTP API (see src/index.ts), sharing one Mongo
 * connection instead of opening two.
 */
export async function startBot(): Promise<void> {
  if (!config.botToken || config.botToken === 'YOUR_BOT_TOKEN_HERE') {
    throw new Error('[Bot] BOT_TOKEN is not configured! Please set BOT_TOKEN in .env file');
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

  // Launch. In long-polling mode bot.launch() only resolves once the bot is stopped
  // (its internal loop runs until then) — awaiting it here would hang startBot()
  // forever and, when embedded in the HTTP server process, block start() from ever
  // finishing. Fire it and log/handle errors via the returned promise instead.
  bot.launch().catch((err) => {
    console.error('[Bot] Fatal polling error:', err);
  });
  console.log('[Bot] Bitimax bot started (long polling)');

  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

// Allows `npm run bot` to still run the bot as its own standalone process (e.g. if this
// ever gets split back out to a separate worker). When imported by src/index.ts instead,
// none of this runs — the importer calls startBot() itself after connecting the DB.
if (require.main === module) {
  connectDatabase()
    .then(startBot)
    .catch((err) => {
      console.error('[Bot] Fatal startup error:', err);
      process.exit(1);
    });
}
