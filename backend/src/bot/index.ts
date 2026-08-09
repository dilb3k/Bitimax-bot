import { Telegraf, Scenes, session } from 'telegraf';
import { config } from '../config';
import { connectDatabase } from '../db/mongoose';
import { mongoSessionStore } from '../models/BotSession';
import { User } from '../models/User';
import { notificationService } from '../services/notificationService';
import { startHandler, createPayoutWizards, keyboardFor } from './handlers/start';
import { sellerHandler, createSellerWizard, createDealWizard, CATEGORIES } from './handlers/seller';
import { buyerHandler, createCodeWizard } from './handlers/buyer';
import { adminHandler } from './handlers/admin';
import { botApi } from './services/api';
import { escapeHtml, formatUzs } from '../utils/helpers';

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

  const bot = new Telegraf<any>(config.botToken);
  notificationService.setBot(bot);

  const stage = new Scenes.Stage<any>([
    createSellerWizard(),
    createDealWizard(),
    createCodeWizard(),
    ...createPayoutWizards(),
  ]);

  // Persisted in Mongo rather than Telegraf's default in-memory Map, so a deploy no longer
  // wipes every half-finished listing wizard and multiple replicas can share state.
  bot.use(session({ store: mongoSessionStore }));
  bot.use(stage.middleware());

  /**
   * Registers the user and stops blocked accounts at the door. `isBlocked` existed in v1 but
   * was never read anywhere — blocking a scammer flipped a boolean and changed nothing.
   */
  bot.use(async (ctx, next) => {
    if (!ctx.from) return next();

    try {
      const user = await botApi.getOrCreateUser(ctx.from.id, ctx);
      if (user.isBlocked) {
        const notice = `❌ Hisobingiz bloklangan.\n${user.blockReason || ''}\n\n${botApi.supportLink()}`;
        if (ctx.callbackQuery) await ctx.answerCbQuery('Hisobingiz bloklangan');
        else await ctx.reply(notice);
        return;
      }
      (ctx.state as any).user = user;
    } catch (err) {
      console.error('[Bot] Failed to resolve user:', err);
    }

    return next();
  });

  bot.use(startHandler);
  bot.use(sellerHandler);
  bot.use(buyerHandler);
  bot.use(adminHandler);

  bot.action('settings_notifications', async (ctx) => {
    const user = await User.findOne({ telegramId: ctx.from!.id });
    if (!user) return void ctx.answerCbQuery('Topilmadi');

    user.notificationSettings.newOrder = !user.notificationSettings.newOrder;
    await user.save();

    await ctx.answerCbQuery(user.notificationSettings.newOrder ? 'Yoqildi' : 'O‘chirildi');
    await ctx.replyWithHTML(
      `✅ Bildirishnomalar yangilandi:\n` +
        `• Yangi buyurtma: ${user.notificationSettings.newOrder ? '✅' : '❌'}\n` +
        `• To‘lov: ${user.notificationSettings.paymentConfirm ? '✅' : '❌'}\n` +
        `• Qaytarish: ${user.notificationSettings.refundUpdate ? '✅' : '❌'}`
    );
  });

  bot.action('back_main', async (ctx) => {
    const user = await User.findOne({ telegramId: ctx.from!.id });
    await ctx.reply('Asosiy menu', keyboardFor(user?.role || 'buyer'));
    await ctx.answerCbQuery();
  });

  bot.command('categories', async (ctx) => {
    await ctx.replyWithHTML('<b>📂 Kategoriyalar</b>', {
      reply_markup: {
        inline_keyboard: CATEGORIES.map((c) => [{ text: c, callback_data: `cat_${c}` }]),
      },
    });
  });

  bot.action(/^cat_(.+)$/, async (ctx) => {
    const category = ctx.match[1];
    const { products, total } = await botApi.getActiveProducts(1, 10, category);

    if (products.length === 0) {
      await ctx.editMessageText(`📂 <b>${escapeHtml(category)}</b> — mahsulot topilmadi`, {
        parse_mode: 'HTML',
      });
      await ctx.answerCbQuery();
      return;
    }

    const lines = products.map(
      (p) => `• <b>${escapeHtml(p.title)}</b> — ${formatUzs(p.price)}\n  /p_${p._id}`
    );

    await ctx.editMessageText(
      [`<b>📂 ${escapeHtml(category)}</b> (${total} ta)`, '', ...lines].join('\n'),
      { parse_mode: 'HTML' }
    );
    await ctx.answerCbQuery();
  });

  /** `/p_<id>` opens a listing — the link format the category browser emits. */
  bot.hears(/^\/p_([0-9a-fA-F]{24})$/, async (ctx) => {
    const productId = ctx.match[1];
    await ctx.replyWithHTML('Mahsulotni ochish:', {
      reply_markup: {
        inline_keyboard: [[{ text: '🔍 Batafsil', callback_data: `detail_${productId}` }]],
      },
    });
  });

  bot.command('next', async (ctx) => {
    const { total, pages } = await botApi.getActiveProducts(1, 10);
    await ctx.replyWithHTML(
      `Jami ${total} ta mahsulot (${pages} sahifa).\n\n` +
        `To‘liq katalog va filtrlar: ${config.siteUrl}`
    );
  });

  bot.catch((err: any, ctx: any) => {
    console.error(`[Bot] Error handling ${ctx?.updateType}:`, err);
  });

  // In long-polling mode bot.launch() only resolves once the bot is stopped (its internal
  // loop runs until then), so awaiting it here would hang startBot() forever and, when
  // embedded in the HTTP server process, block start() from ever finishing. It is launched
  // in the background and supervised instead.
  launchWithRetry(bot);

  process.once('SIGINT', () => {
    stopping = true;
    bot.stop('SIGINT');
  });
  process.once('SIGTERM', () => {
    stopping = true;
    bot.stop('SIGTERM');
  });
}

let stopping = false;

/**
 * Keeps the bot polling across transient Telegram failures.
 *
 * The one that matters is 409 Conflict. Render (like most platforms) does a zero-downtime
 * rollout: the new instance boots while the old one is still draining, so for a few seconds
 * two processes poll the same token and Telegram rejects one of them. Telegraf treats that as
 * fatal and stops the polling loop for good — which meant every single deploy left the bot
 * silently dead until someone noticed and restarted it by hand.
 *
 * Retrying with backoff rides out the overlap: the loser waits, the old instance finishes
 * shutting down, and the next attempt succeeds.
 */
async function launchWithRetry(bot: Telegraf<any>): Promise<void> {
  const MAX_ATTEMPTS = 20;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS && !stopping; attempt++) {
    try {
      if (attempt === 1) console.log('[Bot] Bitimax bot starting (long polling)…');
      // Resolves only once the bot is stopped, so reaching the next line means a clean stop.
      await bot.launch({ dropPendingUpdates: true });
      console.log('[Bot] Polling loop ended cleanly');
      return;
    } catch (err: any) {
      if (stopping) return;

      const code = err?.response?.error_code ?? err?.code;
      const isConflict = code === 409;

      if (!isConflict && attempt >= 5) {
        console.error('[Bot] Giving up after repeated non-conflict failures:', err?.message || err);
        return;
      }

      // Cap the wait at 30s: a deploy overlap clears in well under a minute, and a longer
      // backoff would just extend the window where the bot answers nobody.
      const waitMs = Math.min(30_000, 3_000 * 2 ** Math.min(attempt - 1, 4));
      console.warn(
        `[Bot] Polling failed (${isConflict ? '409 conflict — another instance is still polling' : code || 'unknown'}). ` +
          `Retry ${attempt}/${MAX_ATTEMPTS} in ${Math.round(waitMs / 1000)}s`
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  if (!stopping) {
    console.error('[Bot] Could not start polling after all retries — bot is NOT running');
  }
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
