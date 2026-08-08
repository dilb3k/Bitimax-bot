import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const isProd = process.env.NODE_ENV === 'production';

function required(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value && value.trim().length > 0) return value;
  if (isProd) {
    // Fail closed in production instead of silently running with a weak/default secret.
    throw new Error(`[Config] Missing required environment variable: ${name}`);
  }
  console.warn(
    `[Config] ${name} not set — using an insecure development fallback. Set it before deploying.`
  );
  return devFallback;
}

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd,
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/bitimax',
  port: parseInt(process.env.PORT || '3001', 10),
  botToken: process.env.BOT_TOKEN || '',
  adminChatId: process.env.ADMIN_CHAT_ID || '',
  webhookSecret: required('WEBHOOK_SECRET', 'dev_only_webhook_secret_change_me'),
  // Shared secret required on every internal (non-public) backend route, e.g. escrow/transactions
  // management. Only the bot process and trusted internal tools should ever hold this value.
  internalApiKey: required('INTERNAL_API_KEY', 'dev_only_internal_key_change_me'),
  platformCommission: parseInt(process.env.PLATFORM_COMMISSION || '7', 10),
  siteUrl: process.env.SITE_URL || 'https://bitimax.uz',
  // Comma-separated list of origins allowed to call the public API from a browser.
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  // Optional comma-separated allowlist of SMS sender ids/names (e.g. bank shortcodes).
  // When empty, sender is not checked (backward compatible with current SMS forwarder setup).
  smsAllowedSenders: (process.env.SMS_ALLOWED_SENDERS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

// Constant-time comparison so guessing the webhook/internal secret can't be sped up via
// response-time side channels.
export function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // Still run a comparison of equal length buffers so the timing doesn't leak length either.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}
