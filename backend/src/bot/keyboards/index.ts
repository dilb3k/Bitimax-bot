import { Markup } from 'telegraf';

export const mainMenuKeyboard = Markup.keyboard([
  ['🛍 Mahsulotlar', '💰 Balans'],
  ['📦 Mening buyurtmalarim', '📋 E\'lonlarim'],
  ['⚙️ Sozlamalar', '❓ Yordam'],
]).resize();

export const sellerMenuKeyboard = Markup.keyboard([
  ['➕ Yangi e\'lon', '📋 Mening e\'lonlarim'],
  ['💰 Balans', '📊 Statistika'],
  ['⚙️ Sozlamalar', '🏠 Asosiy menu'],
]).resize();

export const adminMenuKeyboard = Markup.keyboard([
  ['👥 Foydalanuvchilar', '📊 Statistika'],
  ['⚙️ Sozlamalar', '🏠 Asosiy menu'],
]).resize();

export function confirmSellerWarning() {
  return Markup.inlineKeyboard([
    Markup.button.callback('✅ Tushunib yetdim, davom etish', 'seller_accept_warning'),
    Markup.button.callback('❌ Bekor qilish', 'seller_cancel'),
  ]);
}

export function productActionButtons(productId: string) {
  return Markup.inlineKeyboard([
    Markup.button.callback('📥 Sotib olish', `buy_${productId}`),
    Markup.button.callback('🔍 Batafsil', `detail_${productId}`),
  ]);
}

export function paymentConfirmationButtons(productId: string) {
  return Markup.inlineKeyboard([
    Markup.button.callback("💳 To'lovni tasdiqlash", `confirm_payment_${productId}`),
    Markup.button.callback('❌ Bekor qilish', `cancel_payment_${productId}`),
  ]);
}

export function escrowActionButtons(escrowId: string) {
  return Markup.inlineKeyboard([
    Markup.button.callback('✅ Tasdiqlayman', `confirm_escrow_${escrowId}`),
    Markup.button.callback('🔄 Qaytarish', `refund_escrow_${escrowId}`),
    Markup.button.callback('❓ Yordam', `help_escrow_${escrowId}`),
  ]);
}

export function refundReasonButtons(escrowId: string) {
  return Markup.inlineKeyboard([
    Markup.button.callback('🔑 Akkaunt ishlamayapti', `refund_reason_not_working_${escrowId}`),
    Markup.button.callback('📝 Noto\'g\'ri ma\'lumot', `refund_reason_wrong_info_${escrowId}`),
    Markup.button.callback('🕐 Boshqa sabab', `refund_reason_other_${escrowId}`),
    Markup.button.callback('❌ Bekor qilish', `refund_cancel_${escrowId}`),
  ]);
}

export function adminProductActionButtons(productId: string) {
  return Markup.inlineKeyboard([
    Markup.button.callback('🗑 Akkauntni o\'chirish', `admin_delete_product_${productId}`),
    Markup.button.callback('🚫 Sotuvchini bloklash', `admin_ban_seller_${productId}`),
    Markup.button.callback('📋 Tafsilotlar', `admin_details_${productId}`),
  ]);
}

export function backButton() {
  return Markup.keyboard([['🏠 Asosiy menu']]).resize();
}

export function profileSettingsKeyboard() {
  return Markup.inlineKeyboard([
    Markup.button.callback('📢 Bildirishnomalar', 'settings_notifications'),
    Markup.button.callback('👤 Rolni o\'zgartirish', 'settings_role'),
    Markup.button.callback('⬅ Orqaga', 'back_main'),
  ]);
}
