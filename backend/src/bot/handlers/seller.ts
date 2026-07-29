import { Composer, Scenes } from 'telegraf';
import { User } from '../../models/User';
import { botApi } from '../services/api';
import { confirmSellerWarning, sellerMenuKeyboard, backButton, mainMenuKeyboard } from '../keyboards';

export const sellerHandler = new Composer();

const SELLER_WIZARD = 'seller_create';

sellerHandler.hears('➕ Yangi e\'lon', async (ctx) => {
  const user = await User.findOne({ telegramId: ctx.from!.id });
  if (!user || (user.role !== 'seller' && user.role !== 'admin')) {
    await ctx.reply(
      '❌ Siz hali sotuvchi sifatida ro\'yxatdan o\'tmagansiz. ' +
      'Sotuvchi bo\'lish uchun iltimos administrator bilan bog\'laning: @bitimax_admin'
    );
    return;
  }

  const warningMessage = `
<b>⚠️ MUHIM OGOHLANTIRISH!</b>

Siz raqamli mahsulot (akkaunt) e'lon qilmoqchisiz.

<b>Quyidagi qoidalarni tasdiqlaysiz:</b>
• Platformadan tashqaridagi kelishuvlar va muammolarga tizim javob bermaydi
• Har bir muvaffaqiyatli bitimdan <b>7% platforma komissiyasi</b> ushlanadi
• Akkaunt ma'lumotlari (login, parol) to'g'ri va ishlovchi holatda ekanligiga kafolat berasiz
• Soxta yoki ishlamaydigan akkaunt e'lon qilish platforma qoidalarini buzish hisoblanadi

<i>Davom etish uchun "Tushunib yetdim" tugmasini bosing.</i>
  `.trim();

  await ctx.replyWithHTML(warningMessage, confirmSellerWarning());
});

sellerHandler.action('seller_accept_warning', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.replyWithHTML(
    '<b>📝 Yangi e\'lon</b>\n\nMahsulot nomini kiriting (akkauntning nomi):',
    backButton()
  );

  (ctx as any).scene?.enter(SELLER_WIZARD);
});

sellerHandler.action('seller_cancel', async (ctx) => {
  await ctx.answerCbQuery('Bekor qilindi');
  await ctx.reply('E\'lon yaratish bekor qilindi.', mainMenuKeyboard);
});

sellerHandler.hears('📋 Mening e\'lonlarim', async (ctx) => {
  const user = await User.findOne({ telegramId: ctx.from!.id });
  if (!user) return;

  const products = await botApi.getUserProducts(user._id.toString());

  if (products.length === 0) {
    await ctx.reply('Sizda hali e\'lonlar mavjud emas. Yangi e\'lon qo\'shish uchun "➕ Yangi e\'lon" tugmasini bosing.');
    return;
  }

  let message = '<b>📋 Mening e\'lonlarim:</b>\n\n';
  for (const p of products) {
    const statusEmoji = p.status === 'active' ? '🟢' : p.status === 'sold' ? '🔴' : '🟡';
    message += `${statusEmoji} <b>${p.title}</b>\n`;
    message += `   Narx: ${p.price.toLocaleString()} UZS\n`;
    message += `   Holat: ${p.status}\n`;
    message += `   ID: ${p._id}\n\n`;
  }

  await ctx.replyWithHTML(message);
});

sellerHandler.hears('📊 Statistika', async (ctx) => {
  const user = await User.findOne({ telegramId: ctx.from!.id });
  if (!user) return;

  const userId = user._id.toString();
  const products = await botApi.getUserProducts(userId);
  const activeCount = products.filter((p: any) => p.status === 'active').length;
  const soldCount = products.filter((p: any) => p.status === 'sold').length;

  const statsText = `
<b>📊 Sotuvchi Statistikasi</b>

<b>Faol e\'lonlar:</b> ${activeCount}
<b>Sotilgan:</b> ${soldCount}
<b>Jami e\'lonlar:</b> ${products.length}

<b>Balans:</b> ${user.balance.toLocaleString()} UZS
<b>Umumiy daromad:</b> ${user.totalEarned.toLocaleString()} UZS
  `.trim();

  await ctx.replyWithHTML(statsText);
});

export function createSellerWizard() {
  const wizard = new Scenes.WizardScene(
    SELLER_WIZARD,
    async (ctx: any) => {
      ctx.session.productData = {};
      await ctx.reply('Mahsulot nomini kiriting (akkauntning nomi):');
      return ctx.wizard.next();
    },
    async (ctx: any) => {
      if (!ctx.message?.text) {
        await ctx.reply('Iltimos, matn kiriting.');
        return;
      }
      ctx.session.productData.title = ctx.message.text;
      await ctx.reply('Mahsulot tavsifini kiriting (akkaunt haqida batafsil):');
      return ctx.wizard.next();
    },
    async (ctx: any) => {
      if (!ctx.message?.text) {
        await ctx.reply('Iltimos, matn kiriting.');
        return;
      }
      ctx.session.productData.description = ctx.message.text;
      await ctx.reply('Mahsulot narxini kiriting (so\'mda, masalan: 50000):');
      return ctx.wizard.next();
    },
    async (ctx: any) => {
      const price = parseInt(ctx.message?.text, 10);
      if (isNaN(price) || price <= 0) {
        await ctx.reply('Noto\'g\'ri narx. Iltimos, to\'g\'ri narx kiriting (masalan: 50000):');
        return;
      }
      ctx.session.productData.price = price;
      await ctx.reply('Kategoriyani kiriting (masalan: Telegram, Instagram, Netflix, Boshqa):');
      return ctx.wizard.next();
    },
    async (ctx: any) => {
      if (!ctx.message?.text) {
        await ctx.reply('Iltimos, matn kiriting.');
        return;
      }
      ctx.session.productData.category = ctx.message.text;
      await ctx.reply('<b>🔐 Akkaunt ma\'lumotlari</b>\n\nLogin (email yoki username) kiriting:');
      return ctx.wizard.next();
    },
    async (ctx: any) => {
      if (!ctx.message?.text) {
        await ctx.reply('Iltimos, matn kiriting.');
        return;
      }
      ctx.session.productData.login = ctx.message.text;
      await ctx.reply('Parolni kiriting:');
      return ctx.wizard.next();
    },
    async (ctx: any) => {
      if (!ctx.message?.text) {
        await ctx.reply('Iltimos, matn kiriting.');
        return;
      }
      ctx.session.productData.password = ctx.message.text;
      await ctx.reply('Tiklash kodi (ixtiyoriy, mavjud bo\'lmasa "yo\'q" deb yozing):');
      return ctx.wizard.next();
    },
    async (ctx: any) => {
      ctx.session.productData.recoveryCode = ctx.message?.text === 'yo\'q' ? undefined : ctx.message?.text;
      const data = ctx.session.productData;

      const previewText = `
<b>📋 E\'lon Tafsilotlari</b>

<b>Nomi:</b> ${data.title}
<b>Tavsif:</b> ${data.description}
<b>Narx:</b> ${data.price.toLocaleString()} UZS
<b>Kategoriya:</b> ${data.category}
<b>Login:</b> ${data.login}
<b>Parol:</b> ${'*'.repeat(data.password.length)}
<b>Tiklash kodi:</b> ${data.recoveryCode || 'Mavjud emas'}

<i>E\'lonni chop etishni tasdiqlaysizmi?</i>
      `.trim();

      await ctx.replyWithHTML(previewText,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Tasdiqlash', callback_data: 'seller_publish_confirm' },
                { text: '❌ Bekor qilish', callback_data: 'seller_publish_cancel' },
              ],
            ],
          },
        }
      );
      return ctx.wizard.next();
    },
    async (ctx: any) => {
      if (ctx.callbackQuery?.data === 'seller_publish_confirm') {
        const user = await User.findOne({ telegramId: ctx.from!.id });
        if (!user) {
          await ctx.reply('Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
          return ctx.scene.leave();
        }

        const data = ctx.session.productData;
        await botApi.createProduct({
          sellerId: user._id.toString(),
          ...data,
        });

        await ctx.replyWithHTML(
          '✅ <b>E\'lon muvaffaqiyatli chop etildi!</b>\n\n' +
          'Endi xaridorlar sizning mahsulotingizni ko\'rishlari va sotib olishlari mumkin.',
          sellerMenuKeyboard
        );
      } else {
        await ctx.reply('E\'lon yaratish bekor qilindi.', sellerMenuKeyboard);
      }
      return ctx.scene.leave();
    }
  );

  return wizard;
}
