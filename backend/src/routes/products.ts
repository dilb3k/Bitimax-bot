import { Router, Request, Response } from 'express';
import { Product } from '../models/Product';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '20', category, search, sort = '-createdAt' } = req.query;

    const filter: any = { status: 'active' };
    if (category) filter.category = category;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } },
      ];
    }

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    const [products, total] = await Promise.all([
      Product.find(filter)
        .select('-sensitiveData')
        .sort(sort as string)
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
    res.status(500).json({ error: error.message });
  }
});

router.get('/categories', async (_req: Request, res: Response) => {
  try {
    const categories = await Product.distinct('category', { status: 'active' });
    res.json({ categories });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const product = await Product.findById(req.params.id)
      .select('-sensitiveData')
      .populate('sellerId', 'telegramId username');

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ product });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
