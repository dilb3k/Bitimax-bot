import { Composer, Scenes } from 'telegraf';
import { User } from '../../models/User';
import { Product } from '../../models/Product';
import { botApi } from '../services/api';
import { notificationService } from '../../services/notificationService';
import { config } from '../../config';
import { escapeHtml, formatUzs } from '../../utils/helpers';
import { confirmSellerWarning, sellerMenuKeyboard, backButton, mainMenuKeyboard } from '../keyboards';

export const sellerHandler = new Composer();

const SELLER_WIZARD = 'seller_create';

/** Curated taxonomy. Free-text categories in v1 meant "Instagram", "instagram" and
 * "Инстаграм" were three different catalog buckets nobody could filter on. */
export const CATEGORIES = [
  'Telegram',
  'Instagram',
  'TikTok',
  'YouTube',
  'Steam / Gaming',
  'Netflix / Streaming',
  'Email',
  'Boshqa',
];

sellerHandler.hears('➕ Yangi e’lon', async (ctx) => {
  const user = await User.findOne({ telegramId: ctx.from!.id });
  if (!user) return;

  if (user.isBlocked) {
    await ctx.reply('❌ Hisobingiz bloklangan.');
    return;
  }

  if (user.role !== 'seller' && user.role !== 'admin') {
    await ctx.replyWithHTML(
      `❌ Siz hali sotuvchi emassiz.\n\n` +
        `Sotuvchi bo‘lish uchun “⚙️ Sozlamalar” → “🧑‍💼 Sotuvchi bo‘lish” ni bosing.`
    );
    return;
  }

  // Trust-based limits: a brand-new account cannot list twenty expensive accounts at once,
  // which is exactly the shape of a dump-and-run scam.
  const activeCount = await Product.countDocuments({
    sellerId: user._id,
    status: { $in: ['active', 'pending_review', 'reserved'] },
  });
  const limit = botApi.listingLimitFor(user);

  if (activeCount >= limit) {
    await ctx.replyWithHTML(
      `⚠️ Sizning darajangizda (<b>${user.trustLevel}</b>) bir vaqtda ${limit} ta e’lon mumkin.\n\n` +
        `Muvaffaqiyatli bitimlardan keyin limit avtomatik oshadi.`
    );
    return;
  }

  await ctx.replyWithHTML(
    [
      `<b>⚠️ MUHIM OGOHLANTIRISH</b>`,
      '',
      `Siz raqamli akkaunt e’lon qilmoqchisiz. Davom etish bilan quyidagilarni tasdiqlaysiz:`,
      '',
      `• Platformadan tashqaridagi kelishuvlarga tizim javob bermaydi`,
      `• Muvaffaqiyatli bitimdan <b>${config.platformCommission}% komissiya</b> ushlanadi`,
      `• Akkaunt ma’lumotlari to‘g‘ri va ishlaydigan holatda`,
      `• Akkaunt boshqa joyda sotilmagan va siz uni qaytarib olmaysiz`,
      `• Pul xaridor tasdiqlagach yoki ${config.autoReleaseHours} soatdan keyin balansingizga tushadi`,
      '',
      `<b>Soxta akkaunt = bloklash + barcha e’lonlar arxivi.</b>`,
      '',
      `<i>Narx chegarangiz: ${formatUzs(botApi.priceCeilingFor(user))}</i>`,
    ].join('\n'),
    confirmSellerWarning()
  );
});

sellerHandler.action('seller_accept_warning', async (ctx) => {
  await ctx.answerCbQuery();
  await (ctx as any).scene?.enter(SELLER_WIZARD);
});

sellerHandler.action('seller_cancel', async (ctx) => {
  await ctx.answerCbQuery('Bekor qilindi');
  await ctx.reply('E’lon yaratish bekor qilindi.', mainMenuKeyboard);
});

sellerHandler.hears('📋 Mening e’lonlarim', async (ctx) => {
  const user = await User.findOne({ telegramId: ctx.from!.id });
  if (!user) return;

  const products = await botApi.getUserProducts(user._id.toString());

  if (products.length === 0) {
    await ctx.reply('Sizda hali e’lonlar yo‘q. “➕ Yangi e’lon” ni bosing.');
    return;
  }

  const emoji: Record<string, string> = {
    active: '🟢',
    pending_review: '🕐',
    rejected: '❌',
    reserved: '🔒',
    sold: '🔴',
    refunded: '🔄',
    disputed: '⚖️',
    archived: '📦',
    draft: '✏️',
  };

  const lines = products.map(
    (p) =>
      `${emoji[p.status] || '•'} <b>${escapeHtml(p.title)}</b>\n` +
      `   ${formatUzs(p.price)} — ${p.status}`
  );

  await ctx.replyWithHTML([`<b>📋 Mening e’lonlarim (${products.length})</b>`, '', ...lines].join('\n'));
});

sellerHandler.hears('📊 Statistika', async (ctx) => {
  const user = await User.findOne({ telegramId: ctx.from!.id });
  if (!user || user.role === 'admin') return; // admin has its own stats screen

  const products = await botApi.getUserProducts(user._id.toString());
  const activeCount = products.filter((p) => p.status === 'active').length;
  const rating = user.averageRating();

  await ctx.replyWithHTML(
    [
      `<b>📊 Sotuvchi statistikasi</b>`,
      '',
      `Daraja: <b>${user.trustLevel}</b>`,
      `Reyting: ${rating ? `⭐ ${rating} (${user.sellerStats.ratingCount} baho)` : 'hali baho yo‘q'}`,
      '',
      `Faol e’lonlar: ${activeCount} / ${botApi.listingLimitFor(user)}`,
      `Sotilgan: ${user.sellerStats.sold}`,
      `Qaytarilgan: ${user.sellerStats.refunded}`,
      `Yo‘qotilgan nizolar: ${user.sellerStats.disputesLost}`,
      '',
      `Balans: <b>${formatUzs(user.balance)}</b>`,
      `Umumiy daromad: ${formatUzs(user.totalEarned)}`,
      `Narx chegarasi: ${formatUzs(botApi.priceCeilingFor(user))}`,
    ].join('\n')
  );
});

/**
 * Listing wizard. Each step validates before advancing so a bad value can't reach the
 * database, and the state lives in the Mongo-backed session so a restart mid-wizard no longer
 * loses everything the seller typed.
 */
export function createSellerWizard() {
  return new Scenes.WizardScene<any>(
    SELLER_WIZARD,
    async (ctx: any) => {
      ctx.session.productData = {};
      await ctx.replyWithHTML(
        '<b>📝 1/7 — Nomi</b>\n\nMahsulot nomini kiriting (masalan: “Instagram 12k obunachi, 2019”):',
        backButton()
      );
      return ctx.wizard.next();
    },

    async (ctx: any) => {
      const text = ctx.message?.text?.trim();
      if (!text || text.length < 5 || text.length > 120) {
        await ctx.reply('Nom 5–120 belgi bo‘lishi kerak. Qaytadan kiriting:');
        return;
      }
      ctx.session.productData.title = text;
      await ctx.replyWithHTML(
        '<b>📝 2/7 — Tavsif</b>\n\nAkkaunt haqida batafsil yozing (obunachilar, yosh, geografiya, ' +
          'nima uchun sotilyapti):'
      );
      return ctx.wizard.next();
    },

    async (ctx: any) => {
      const text = ctx.message?.text?.trim();
      if (!text || text.length < 20) {
        await ctx.reply('Tavsif kamida 20 belgi bo‘lishi kerak. Batafsil yozing:');
        return;
      }
      ctx.session.productData.description = text.slice(0, 4000);
      await ctx.replyWithHTML(
        `<b>📝 3/7 — Narx</b>\n\nNarxni so‘mda kiriting (faqat raqam, masalan: 250000):`
      );
      return ctx.wizard.next();
    },

    async (ctx: any) => {
      const price = parseInt(String(ctx.message?.text || '').replace(/\D/g, ''), 10);
      const user = await User.findOne({ telegramId: ctx.from!.id });
      if (!user) return ctx.scene.leave();

      if (isNaN(price) || price < 1000) {
        await ctx.reply('Minimal narx 1 000 UZS. Qaytadan kiriting:');
        return;
      }
      const ceiling = botApi.priceCeilingFor(user);
      if (price > ceiling) {
        await ctx.reply(
          `Sizning darajangizda maksimal narx ${formatUzs(ceiling)}. Pastroq narx kiriting:`
        );
        return;
      }

      ctx.session.productData.price = price;
      const { commission, sellerPayout } = {
        commission: Math.round((price * config.platformCommission) / 100),
        sellerPayout: price - Math.round((price * config.platformCommission) / 100),
      };

      await ctx.replyWithHTML(
        `<b>📝 4/7 — Kategoriya</b>\n\n` +
          `<i>Bu narxda siz olasiz: ${formatUzs(sellerPayout)} (komissiya ${formatUzs(commission)})</i>\n\n` +
          `Kategoriyani tanlang:`,
        {
          reply_markup: {
            keyboard: CATEGORIES.map((c) => [c]),
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );
      return ctx.wizard.next();
    },

    async (ctx: any) => {
      const text = ctx.message?.text?.trim();
      if (!text || !CATEGORIES.includes(text)) {
        await ctx.reply('Iltimos, ro‘yxatdagi kategoriyalardan birini tanlang:');
        return;
      }
      ctx.session.productData.category = text;
      await ctx.replyWithHTML(
        `<b>📝 5/7 — Login</b>\n\n🔐 Akkaunt login (email yoki username) ni kiriting:\n\n` +
          `<i>Bu ma’lumot shifrlangan holda saqlanadi va faqat to‘lov tasdiqlangach ` +
          `xaridorga ochiladi.</i>`,
        backButton()
      );
      return ctx.wizard.next();
    },

    async (ctx: any) => {
      const text = ctx.message?.text?.trim();
      if (!text) {
        await ctx.reply('Iltimos, loginni kiriting:');
        return;
      }
      ctx.session.productData.login = text;
      await ctx.reply('🔐 6/7 — Parolni kiriting:');
      return ctx.wizard.next();
    },

    async (ctx: any) => {
      const text = ctx.message?.text?.trim();
      if (!text) {
        await ctx.reply('Iltimos, parolni kiriting:');
        return;
      }
      ctx.session.productData.password = text;
      await ctx.reply('🔐 7/7 — Tiklash kodi / qo‘shimcha ma’lumot (bo‘lmasa "yo‘q" deb yozing):');
      return ctx.wizard.next();
    },

    async (ctx: any) => {
      const text = ctx.message?.text?.trim();
      ctx.session.productData.recoveryCode =
        !text || /^(yo['’]?q|yoq|no|-)$/i.test(text) ? undefined : text;

      const data = ctx.session.productData;
      const commission = Math.round((data.price * config.platformCommission) / 100);

      await ctx.replyWithHTML(
        [
          `<b>📋 E’lonni tekshirib chiqing</b>`,
          '',
          `<b>Nomi:</b> ${escapeHtml(data.title)}`,
          `<b>Tavsif:</b> ${escapeHtml(data.description.slice(0, 300))}`,
          `<b>Narx:</b> ${formatUzs(data.price)}`,
          `<b>Kategoriya:</b> ${escapeHtml(data.category)}`,
          '',
          `<b>Login:</b> ${escapeHtml(data.login)}`,
          `<b>Parol:</b> ${'•'.repeat(Math.min(12, data.password.length))}`,
          `<b>Tiklash kodi:</b> ${data.recoveryCode ? 'kiritilgan' : 'yo‘q'}`,
          '',
          `<b>Siz olasiz:</b> ${formatUzs(data.price - commission)}`,
          `<b>Komissiya:</b> ${formatUzs(commission)}`,
          '',
          `<i>Tasdiqlagandan keyin e’lon moderatorga yuboriladi.</i>`,
        ].join('\n'),
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Yuborish', callback_data: 'seller_publish_confirm' },
                { text: '❌ Bekor qilish', callback_data: 'seller_publish_cancel' },
              ],
            ],
          },
        }
      );
      return ctx.wizard.next();
    },

    async (ctx: any) => {
      const action = ctx.callbackQuery?.data;

      if (action !== 'seller_publish_confirm') {
        await ctx.answerCbQuery?.('Bekor qilindi');
        await ctx.reply('E’lon yaratish bekor qilindi.', sellerMenuKeyboard);
        return ctx.scene.leave();
      }

      const user = await User.findOne({ telegramId: ctx.from!.id });
      if (!user) {
        await ctx.reply('Xatolik yuz berdi. /start bosib qaytadan urinib ko‘ring.');
        return ctx.scene.leave();
      }

      const data = ctx.session.productData;
      const product = await botApi.createProduct({ sellerId: user._id.toString(), ...data });

      // Clear the plaintext credentials out of the session as soon as they're persisted —
      // no reason to leave a live password sitting in a session document.
      ctx.session.productData = {};

      await ctx.answerCbQuery('Yuborildi');
      await ctx.replyWithHTML(
        `✅ <b>E’lon moderatorga yuborildi!</b>\n\n` +
          `Tasdiqlangach katalogda paydo bo‘ladi va sizga xabar keladi.`,
        sellerMenuKeyboard
      );

      await notificationService.notifyAdmin(
        `🆕 <b>Yangi e’lon ko‘rikda</b>\n\n` +
          `${escapeHtml(product.title)}\n${formatUzs(product.price)}\n` +
          `Sotuvchi: @${escapeHtml(user.username || String(user.telegramId))} (${user.trustLevel})\n\n` +
          `<i>“🛡 Moderatsiya” bo‘limida ko‘ring.</i>`
      );

      return ctx.scene.leave();
    }
  );
}
