import { User } from '../../models/User';
import { Product } from '../../models/Product';
import { Transaction } from '../../models/Transaction';
import { EscrowHold } from '../../models/EscrowHold';
import { paymentService } from '../../services/paymentService';
import { notificationService } from '../../services/notificationService';

export class BotApiService {
  async getOrCreateUser(telegramId: number, ctx: any): Promise<any> {
    let user = await User.findOne({ telegramId });
    if (!user) {
      const from = ctx.from || {};
      user = await User.create({
        telegramId,
        username: from.username,
        firstName: from.first_name,
        lastName: from.last_name,
        role: 'buyer',
      });
    }
    return user;
  }

  async createProduct(data: {
    sellerId: string;
    title: string;
    description: string;
    price: number;
    category: string;
    login: string;
    password: string;
    recoveryCode?: string;
    additionalInfo?: string;
    tags?: string[];
  }) {
    return Product.create({
      sellerId: data.sellerId,
      title: data.title,
      description: data.description,
      price: data.price,
      category: data.category,
      sensitiveData: {
        login: data.login,
        password: data.password,
        recoveryCode: data.recoveryCode,
        additionalInfo: data.additionalInfo,
      },
      tags: data.tags || [],
    });
  }

  async getActiveProducts(page = 1, limit = 10) {
    const products = await Product.find({ status: 'active' })
      .select('-sensitiveData')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('sellerId', 'telegramId username');
    const total = await Product.countDocuments({ status: 'active' });
    return { products, total, pages: Math.ceil(total / limit) };
  }

  async getUserProducts(userId: string) {
    return Product.find({ sellerId: userId }).sort('-createdAt');
  }

  async getUserTransactions(userId: string, role: 'buyer' | 'seller') {
    const filter = role === 'buyer' ? { buyerId: userId } : { sellerId: userId };
    return Transaction.find(filter)
      .sort('-createdAt')
      .populate('productId', 'title price');
  }

  async getEscrowHolds(userId: string, role: 'buyer' | 'seller') {
    const filter = role === 'buyer' ? { buyerId: userId } : { sellerId: userId };
    return EscrowHold.find(filter)
      .sort('-createdAt')
      .populate('productId', 'title price');
  }

  async initiatePurchase(productId: string, buyerId: string) {
    const product = await Product.findById(productId);
    if (!product || product.status !== 'active') {
      throw new Error('Product not available');
    }

    const { transaction, uniqueAmount } =
      await paymentService.createPaymentTransaction(
        productId,
        buyerId,
        product.sellerId.toString(),
        product.price
      );

    return {
      transaction,
      uniqueAmount,
      product,
    };
  }
}

export const botApi = new BotApiService();
