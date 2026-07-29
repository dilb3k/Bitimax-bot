import { Transaction } from '../models/Transaction';
import { EscrowHold } from '../models/EscrowHold';
import { Product } from '../models/Product';
import { User } from '../models/User';
import { generateUniqueAmount, extractAmountFromSms } from '../utils/helpers';
import { calculateSellerPayout, calculateRefund, calculateRefundAmount } from './refundEngine';

export class PaymentService {
  async createPaymentTransaction(
    productId: string,
    buyerId: string,
    sellerId: string,
    basePrice: number
  ) {
    const uniqueAmount = generateUniqueAmount(basePrice);
    const expireAt = new Date(Date.now() + 10 * 60 * 1000);

    const transaction = await Transaction.create({
      productId,
      buyerId,
      sellerId,
      basePrice,
      expectedAmount: basePrice,
      uniqueAmount,
      status: 'pending_payment',
      expireAt,
    });

    return { transaction, uniqueAmount };
  }

  async confirmPaymentBySms(smsText: string): Promise<{
    matched: boolean;
    transaction?: any;
    amount?: number;
  }> {
    const detectedAmount = extractAmountFromSms(smsText);
    if (!detectedAmount) return { matched: false };

    const roundedAmount = Math.round(detectedAmount);

    const transaction = await Transaction.findOne({
      uniqueAmount: roundedAmount,
      status: 'pending_payment',
      expireAt: { $gt: new Date() },
    });

    if (!transaction) return { matched: false };

    transaction.status = 'paid';
    transaction.smsRawText = smsText;
    transaction.smsConfirmedAt = new Date();
    await transaction.save();

    await Product.findByIdAndUpdate(transaction.productId, {
      status: 'sold',
      buyerId: transaction.buyerId,
      soldAt: new Date(),
    });

    const { commission, sellerPayout } = calculateSellerPayout(transaction.basePrice);

    await EscrowHold.create({
      transactionId: transaction._id,
      buyerId: transaction.buyerId,
      sellerId: transaction.sellerId,
      productId: transaction.productId,
      amount: transaction.basePrice,
      commission,
      sellerPayout,
      status: 'holding',
      boughtAt: new Date(),
    });

    return { matched: true, transaction, amount: detectedAmount };
  }

  async processRefund(escrowHoldId: string, reason: string) {
    const escrow = await EscrowHold.findById(escrowHoldId)
      .populate('transactionId')
      .populate('buyerId')
      .populate('sellerId');

    if (!escrow) throw new Error('Escrow hold not found');

    const refundInfo = calculateRefund(escrow.boughtAt, escrow.amount);

    if (!refundInfo.allowed) {
      await this.releaseToSeller(escrow);
      return { allowed: false, message: refundInfo.message };
    }

    const { refundToBuyer, penaltyAmount, platformKeeps, sellerKeeps } =
      calculateRefundAmount(escrow.amount, refundInfo.penaltyPercent);

    const transaction = await Transaction.findById(escrow.transactionId);
    if (transaction) {
      transaction.status = 'refunded';
      await transaction.save();
    }

    await Product.findByIdAndUpdate(escrow.productId, {
      status: 'refunded',
    });

    escrow.status = refundInfo.penaltyPercent > 0 ? 'partial_refunded' : 'refunded';
    escrow.refundReason = reason;
    escrow.refundPeriod = refundInfo.period;
    escrow.refundLog.push({
      action: refundInfo.penaltyPercent > 0 ? 'partial' : 'approved',
      period: refundInfo.period,
      penaltyPercent: refundInfo.penaltyPercent,
      refundAmount: refundToBuyer,
      reason,
      processedAt: new Date(),
    });
    await escrow.save();

    await User.findByIdAndUpdate(escrow.buyerId, {
      $inc: { balance: refundToBuyer, totalSpent: -refundToBuyer },
    });

    if (sellerKeeps > 0) {
      await User.findByIdAndUpdate(escrow.sellerId, {
        $inc: { balance: sellerKeeps, totalEarned: sellerKeeps },
      });
    }

    return {
      allowed: true,
      refundToBuyer,
      penaltyAmount,
      platformKeeps,
      sellerKeeps,
      period: refundInfo.period,
      message: refundInfo.message,
    };
  }

  async releaseToSeller(escrow: any) {
    await User.findByIdAndUpdate(escrow.sellerId, {
      $inc: { balance: escrow.sellerPayout, totalEarned: escrow.sellerPayout },
    });

    escrow.status = 'released';
    escrow.confirmedAt = new Date();
    await escrow.save();

    const transaction = await Transaction.findById(escrow.transactionId);
    if (transaction) {
      transaction.status = 'completed';
      transaction.completedAt = new Date();
      await transaction.save();
    }
  }

  async confirmAndRelease(escrowHoldId: string) {
    const escrow = await EscrowHold.findById(escrowHoldId);
    if (!escrow) throw new Error('Escrow hold not found');

    await this.releaseToSeller(escrow);

    return { released: true, sellerPayout: escrow.sellerPayout };
  }
}

export const paymentService = new PaymentService();
