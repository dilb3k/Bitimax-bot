import { Composer } from 'telegraf';
import { User } from '../../models/User';
import { botApi } from '../services/api';
import {
  mainMenuKeyboard,
  sellerMenuKeyboard,
  adminMenuKeyboard,
} from '../keyboards';

export const startHandler = new Composer();

startHandler.start(async (ctx) => {
  const telegramId = ctx.from!.id;
  const user = await botApi.getOrCreateUser(telegramId, ctx);

  const welcomeMessage = `
<b>🔰 Bitimax Platformasiga Xush Kelibsiz!</b>

Bitimax — bu P2P Escrow (kafil) tizimida ishlovchi raqamli mahsulotlar bozori.

<b>🛡 Nima qila olasiz:</b>
• Raqamli akkauntlarni xavfsiz sotib olish/sotish
• 7% komissiya bilan kafillangan tranzaksiyalar
• Avtomatik to'lov tizimi (SMS orqali)
• 24 soatgacha qaytarish imkoniyati

<b>⚠️ Eslatma:</b> Platformadan tashqaridagi kelishuvlar va muammolarga tizim javob bermaydi.
  `.trim();

  let keyboard = mainMenuKeyboard;
  if (user.role === 'seller') keyboard = sellerMenuKeyboard;
  if (user.role === 'admin') keyboard = adminMenuKeyboard;

  await ctx.replyWithHTML(welcomeMessage, keyboard);
  await ctx.deleteMessage();
});

startHandler.help(async (ctx) => {
  const helpText = `
<b>❓ Yordam</b>

<b>Sotib olish:</b>
1. Mahsulotlar ro'yxatidan kerakli akkauntni tanlang
2. "Sotib olish" tugmasini bosing
3. Ko'rsatilgan summani (shu jumladan noyob tiyinlar) bank kartangiz orqali to'lang
4. SMS xabaringiz avtomatik tizim tomonidan aniqlanadi
5. To'lov tasdiqlangach, login va parolni olasiz

<b>Sotish:</b>
1. "Yangi e'lon" tugmasini bosing
2. Akkaunt ma'lumotlarini kiriting (login, parol, tiklash kodi)
3. Xaridor to'lovni amalga oshirgach, pul escrow'da saqlanadi
4. Xaridor tasdiqlagach yoki 24 soatdan so'ng pul hisobingizga tushadi

<b>Komissiya:</b> Har bir muvaffaqiyatli bitimdan 7% platforma komissiyasi ushlanadi.

<b>Admin:</b> @bitimax_admin
  `.trim();

  await ctx.replyWithHTML(helpText);
});

startHandler.command('balance', async (ctx) => {
  const telegramId = ctx.from!.id;
  const user = await User.findOne({ telegramId });

  if (!user) {
    return ctx.reply('Foydalanuvchi topilmadi. Iltimos /start buyrug\'ini bosing.');
  }

  const balanceText = `
<b>💰 Sizning Balansingiz</b>

<b>Mavjud balans:</b> ${user.balance.toLocaleString()} UZS
<b>Umumiy daromad:</b> ${user.totalEarned.toLocaleString()} UZS
<b>Umumiy xarajat:</b> ${user.totalSpent.toLocaleString()} UZS

<i>Balansingizni to'ldirish uchun admin bilan bog'laning.</i>
  `.trim();

  await ctx.replyWithHTML(balanceText);
});
