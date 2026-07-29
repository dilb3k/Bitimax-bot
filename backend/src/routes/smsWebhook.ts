import { Router, Request, Response } from 'express';
import { paymentService } from '../services/paymentService';
import { notificationService } from '../services/notificationService';
import { config } from '../config';

const router = Router();

router.post('/sms-webhook', async (req: Request, res: Response) => {
  const { secret, text, sender, received_at } = req.body;

  if (secret !== config.webhookSecret) {
    return res.status(403).json({ error: 'Invalid secret' });
  }

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing SMS text' });
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
