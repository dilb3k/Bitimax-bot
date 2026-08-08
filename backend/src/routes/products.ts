import { Router, Request, Response } from 'express';
import { Product } from '../models/Product';
import { validateObjectId } from '../middleware/validateObjectId';
import { config } from '../config';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '20', category, search, sort = '-createdAt' } = req.query;

    const filter: any = { status: 'active' };
    if (category) filter.category = category;
    if (search && typeof search === 'string') {
      // Escape regex metacharacters so user input can't build an expensive/malicious pattern
      // (ReDoS) or an unintended structural query.
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 200);
      filter.$or = [
        { title: { $regex: escaped, $options: 'i' } },
        { description: { $regex: escaped, $options: 'i' } },
        { tags: { $regex: escaped, $options: 'i' } },
      ];
    }

    // Only allow sorting by an explicit safe set of fields — passing arbitrary user input
    // straight into .sort() lets a caller probe/abuse unindexed fields.
    const allowedSort = new Set(['-createdAt', 'createdAt', '-price', 'price']);
    const sortValue = allowedSort.has(sort as string) ? (sort as string) : '-createdAt';

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));

    const [products, total] = await Promise.all([
      Product.find(filter)
        .select('-sensitiveData')
        .sort(sortValue)
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .populate('sellerId', 'telegramId username'),
      Product.countDocuments(filter),
    ]);

    res.json({
      products,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: config.isProd ? 'Internal server error' : error.message });
  }
});

router.get('/categories', async (_req: Request, res: Response) => {
  try {
    const categories = await Product.distinct('category', { status: 'active' });
    res.json({ categories });
  } catch (error: any) {
    res.status(500).json({ error: config.isProd ? 'Internal server error' : error.message });
  }
});

router.get('/:id', validateObjectId(), async (req: Request, res: Response) => {
  try {
    const product = await Product.findById(req.params.id)
      .select('-sensitiveData')
      .populate('sellerId', 'telegramId username');

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ product });
  } catch (error: any) {
    res.status(500).json({ error: config.isProd ? 'Internal server error' : error.message });
  }
});

export default router;
