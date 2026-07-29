import dotenv from 'dotenv';
dotenv.config();

export const config = {
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/bitimax',
  port: parseInt(process.env.PORT || '3001', 10),
  botToken: process.env.BOT_TOKEN || '',
  adminChatId: process.env.ADMIN_CHAT_ID || '5583276966',
  webhookSecret: process.env.WEBHOOK_SECRET || 'bitimax_webhook_secret',
  platformCommission: parseInt(process.env.PLATFORM_COMMISSION || '7', 10),
  siteUrl: process.env.SITE_URL || 'https://bitimax.uz',
};
