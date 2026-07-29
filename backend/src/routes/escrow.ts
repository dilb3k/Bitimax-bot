import { Router, Request, Response } from 'express';
import { EscrowHold } from '../models/EscrowHold';
import { paymentService } from '../services/paymentService';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, userId, role, page = '1', limit = '20' } = req.query;

    const filter: any = {};
    if (status) filter.status = status;
    if (userId && role === 'buyer') filter.buyerId = userId;
    if (userId && role === 'seller') filter.sellerId = userId;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    const [holds, total] = await Promise.all([
      EscrowHold.find(filter)
        .sort('-createdAt')
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .populate('productId', 'title price')
        .populate('buyerId', 'telegramId username')
        .populate('sellerId', 'telegramId username'),
      EscrowHold.countDocuments(filter),
    ]);

    res.json({
      holds,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/refund', async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({ error: 'Refund reason is required' });
    }

    const result = await paymentService.processRefund(req.params.id, reason);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/confirm', async (req: Request, res: Response) => {
  try {
    const result = await paymentService.confirmAndRelease(req.params.id);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const hold = await EscrowHold.findById(req.params.id)
      .populate('productId')
      .populate('buyerId', 'telegramId username firstName')
      .populate('sellerId', 'telegramId username firstName');

    if (!hold) {
      return res.status(404).json({ error: 'Escrow hold not found' });
    }

    res.json({ hold });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
