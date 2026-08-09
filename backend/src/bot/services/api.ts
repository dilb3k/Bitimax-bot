import crypto from 'crypto';
import { User, IUser } from '../../models/User';
import { Product } from '../../models/Product';
import { Transaction } from '../../models/Transaction';
import { EscrowHold } from '../../models/EscrowHold';
import { paymentService } from '../../services/paymentService';
import { config } from '../../config';
import { generateDealCode, normalizeDealCode } from '../../utils/helpers';

export class BlockedUserError extends Error {
  constructor(reason?: string) {
    super(reason || 'Hisobingiz bloklangan');
    this.name = 'BlockedUserError';
  }
}

export class BotApiService {
  async getOrCreateUser(telegramId: number, ctx: any): Promise<IUser> {
    const from = ctx.from || {};

    // Upsert so two updates arriving at once for a brand-new user can't create duplicates.
    const user = await User.findOneAndUpdate(
      { telegramId },
      {
        $set: {
          username: from.username,
          firstName: from.first_name,
          lastName: from.last_name,
          lastSeenAt: new Date(),
        },
        $setOnInsert: {
          role: 'buyer',
          language: from.language_code === 'ru' ? 'ru' : 'uz',
          referralCode: crypto.randomBytes(4).toString('hex'),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return user;
  }

  /**
   * Every entry point calls this. `isBlocked` existed in v1 but was never checked anywhere,
   * so blocking a scammer changed a boolean and nothing else — they kept trading.
   */
  assertNotBlocked(user: IUser) {
    if (user.isBlocked) throw new BlockedUserError(user.blockReason);
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
    const product = new Product({
      sellerId: data.sellerId,
      title: data.title,
      description: data.description,
      price: data.price,
      category: data.category,
      tags: data.tags || [],
      // New listings queue for moderation instead of going straight to the catalog — one
      // fake listing reaching a buyer costs more trust than every legitimate listing gains.
      status: 'pending_review',
    });

    // Goes through the model method so credentials are encrypted before they ever touch disk.
    product.setCredentials({
      login: data.login,
      password: data.password,
      recoveryCode: data.recoveryCode,
      additionalInfo: data.additionalInfo,
    });

    await product.save();
    await User.findByIdAndUpdate(data.sellerId, { $inc: { 'sellerStats.listed': 1 } });

    return product;
  }

  /**
   * Creates a private escrow deal: no catalog listing, no moderation, reachable only by the
   * code the seller passes to the one buyer they already agreed with.
   *
   * Moderation is skipped deliberately. Its job is to protect strangers browsing a catalog
   * from a fake listing; here there is no stranger — the buyer chose this seller and this
   * account before Bitimax was involved, and all they want is the escrow in the middle.
   */
  async createDeal(data: {
    sellerId: string;
    title: string;
    price: number;
    description?: string;
    category?: string;
    login: string;
    password: string;
    recoveryCode?: string;
  }) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const dealCode = generateDealCode();
      const product = new Product({
        sellerId: data.sellerId,
        title: data.title,
        description: data.description || `Kelishilgan bitim: ${data.title}`,
        price: data.price,
        category: data.category || 'Boshqa',
        listingType: 'private',
        dealCode,
        // An unclaimed code shouldn't stay live forever — the seller's credentials are sitting
        // in it. A week is long enough for any real handover.
        dealExpiresAt: new Date(Date.now() + 7 * 24 * 3600_000),
        status: 'active',
      });

      product.setCredentials({
        login: data.login,
        password: data.password,
        recoveryCode: data.recoveryCode,
      });

      try {
        await product.save();
        await User.findByIdAndUpdate(data.sellerId, { $inc: { 'sellerStats.listed': 1 } });
        return product;
      } catch (err: any) {
        // E11000 = the generated code collided with an existing one; draw another.
        if (err?.code === 11000) continue;
        throw err;
      }
    }
    throw new Error('Bitim kodini yaratib bo‘lmadi, qayta urinib ko‘ring');
  }

  /** Resolves a buyer-typed code to a live deal. Returns null for anything not purchasable. */
  async findDealByCode(code: string) {
    const normalized = normalizeDealCode(code);
    if (normalized.length !== 8) return null;

    return Product.findOne({
      dealCode: normalized,
      listingType: 'private',
      status: { $in: ['active', 'reserved'] },
    }).populate('sellerId', 'telegramId username trustLevel sellerStats');
  }

  /** Seller cancels their own unclaimed deal, invalidating the code. */
  async cancelDeal(productId: string, sellerId: string) {
    return Product.findOneAndUpdate(
      { _id: productId, sellerId, listingType: 'private', status: 'active' },
      { $set: { status: 'archived' }, $unset: { dealCode: '' } },
      { new: true }
    );
  }

  async getActiveProducts(page = 1, limit = 10, category?: string) {
    // Public catalog only — a private deal is reachable by its code and nowhere else.
    const filter: Record<string, unknown> = { status: 'active', listingType: 'public' };
    if (category) filter.category = category;

    const [products, total] = await Promise.all([
      Product.find(filter)
        .select('-sensitiveData')
        .sort('-createdAt')
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('sellerId', 'telegramId username trustLevel sellerStats'),
      Product.countDocuments(filter),
    ]);

    return { products, total, pages: Math.ceil(total / limit) };
  }

  async getUserProducts(userId: string) {
    return Product.find({ sellerId: userId }).select('-sensitiveData').sort('-createdAt').limit(50);
  }

  async getUserTransactions(userId: string, role: 'buyer' | 'seller') {
    const filter = role === 'buyer' ? { buyerId: userId } : { sellerId: userId };
    return Transaction.find(filter).sort('-createdAt').limit(50).populate('productId', 'title price');
  }

  async getEscrowHolds(userId: string, role: 'buyer' | 'seller') {
    const filter = role === 'buyer' ? { buyerId: userId } : { sellerId: userId };
    return EscrowHold.find(filter).sort('-createdAt').limit(50).populate('productId', 'title price');
  }

  /**
   * Opens a purchase. The reservation and the unique-amount allocation both live in
   * paymentService, which is also where the product-availability check happens atomically —
   * checking here first would only add a race window.
   */
  async initiatePurchase(productId: string, buyerId: string) {
    return paymentService.createPaymentTransaction(productId, buyerId);
  }

  /** Whether the seller is allowed to list at this price, given their trust level. */
  priceCeilingFor(user: IUser): number {
    switch (user.trustLevel) {
      case 'partner':
        return Number.MAX_SAFE_INTEGER;
      case 'trusted':
        return 5_000_000;
      case 'verified':
        return 1_500_000;
      default:
        return 300_000;
    }
  }

  /** Concurrent active listings allowed, also a function of trust. */
  listingLimitFor(user: IUser): number {
    switch (user.trustLevel) {
      case 'partner':
        return 500;
      case 'trusted':
        return 100;
      case 'verified':
        return 25;
      default:
        return 3;
    }
  }

  supportLink(): string {
    return `https://t.me/${config.supportUsername}`;
  }
}

export const botApi = new BotApiService();
