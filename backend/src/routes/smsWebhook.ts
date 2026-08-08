import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { paymentService } from '../services/paymentService';
import { notificationService } from '../services/notificationService';
import { config, safeEquals } from '../config';

const router = Router();

// The webhook secret is effectively a password guarding real money movement — throttle
// hard so it can't be brute-forced, independent of the global API rate limit.
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const smsWebhookSchema = z.object({
  secret: z.string(),
  text: z.string().min(1).max(2000),
  sender: z.string().max(200).optional(),
  received_at: z.union([z.string(), z.number()]).optional(),
});

router.post('/sms-webhook', webhookLimiter, async (req: Request, res: Response) => {
  const parsed = smsWebhookSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  const { secret, text, sender } = parsed.data;

  if (!safeEquals(secret, config.webhookSecret)) {
    return res.status(403).json({ error: 'Invalid secret' });
  }

  if (config.smsAllowedSenders.length > 0 && (!sender || !config.smsAllowedSenders.includes(sender))) {
    console.warn('[SMS Webhook] Rejected message from unrecognized sender:', sender);
    return res.status(403).json({ error: 'Unrecognized sender' });
  }

  try {
    const result = await paymentService.confirmPaymentBySms(text);

    if (result.matched) {
      const t = result.transaction;
      await notificationService.notifyAdmin(
        `💳 <b>To'lov tasdiqlandi!</b>\n\n` +
          `Summa: ${result.amount?.toLocaleString()} UZS\n` +
          `Mahsulot ID: ${t.productId}\n` +
          `Xaridor ID: ${t.buyerId}\n` +
          `Sotuvchi ID: ${t.sellerId}\n` +
          `Holat: paid`
      );

      return res.json({
        success: true,
        message: 'Payment confirmed via SMS',
        transactionId: t._id,
      });
    } else {
      return res.json({
        success: false,
        message: 'No matching pending transaction found for this amount',
      });
    }
  } catch (error: any) {
    console.error('[SMS Webhook] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/sms-webhook/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'bitimax-sms-webhook' });
});

export default router;
