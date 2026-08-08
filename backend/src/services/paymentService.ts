import mongoose from 'mongoose';
import { Transaction } from '../models/Transaction';
import { EscrowHold } from '../models/EscrowHold';
import { Product } from '../models/Product';
import { User } from '../models/User';
import { generateUniqueAmount, extractAmountFromSms } from '../utils/helpers';
import { calculateSellerPayout, calculateRefund, calculateRefundAmount } from './refundEngine';

export class AlreadyProcessedError extends Error {
  constructor(message = 'This escrow hold has already been processed') {
    super(message);
    this.name = 'AlreadyProcessedError';
  }
}

export class PaymentService {
  /**
   * Creates a pending transaction with a uniqueAmount that isn't shared with any other
   * currently-pending transaction. A DB-level partial unique index (see Transaction model)
   * backstops this against races between concurrent purchase requests.
   */
  async createPaymentTransaction(
    productId: string,
    buyerId: string,
    sellerId: string,
    basePrice: number
  ) {
    const expireAt = new Date(Date.now() + 10 * 60 * 1000);

    for (let attempt = 0; attempt < 10; attempt++) {
      const uniqueAmount = generateUniqueAmount(basePrice);
      try {
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
      } catch (err: any) {
        // E11000 = collided with another still-pending transaction's uniqueAmount; retry.
        if (err?.code === 11000) continue;
        throw err;
      }
    }
    throw new Error('Could not allocate a unique payment amount, please try again');
  }

  /**
   * Atomically claims (at most once) the pending transaction matching the SMS amount and
   * creates its escrow hold. Using findOneAndUpdate as the claim step means two concurrent/
   * duplicate webhook deliveries for the same amount can never both succeed — the second one
   * simply finds no matching pending_payment document left to claim.
   */
  async confirmPaymentBySms(smsText: string): Promise<{
    matched: boolean;
    transaction?: any;
    amount?: number;
  }> {
    const detectedAmount = extractAmountFromSms(smsText);
    if (!detectedAmount) return { matched: false };

    const roundedAmount = Math.round(detectedAmount);

    const session = await mongoose.startSession();
    let claimedTransaction: any = null;

    try {
      await session.withTransaction(async () => {
        const transaction = await Transaction.findOneAndUpdate(
          {
            uniqueAmount: roundedAmount,
            status: 'pending_payment',
            expireAt: { $gt: new Date() },
          },
          {
            $set: {
              status: 'paid',
              smsRawText: smsText,
              smsConfirmedAt: new Date(),
            },
          },
          { new: true, sort: { createdAt: 1 }, session }
        );

        if (!transaction) return;

        await Product.findByIdAndUpdate(
          transaction.productId,
          { status: 'sold', buyerId: transaction.buyerId, soldAt: new Date() },
          { session }
        );

        const { commission, sellerPayout } = calculateSellerPayout(transaction.basePrice);

        await EscrowHold.create(
          [
            {
              transactionId: transaction._id,
              buyerId: transaction.buyerId,
              sellerId: transaction.sellerId,
              productId: transaction.productId,
              amount: transaction.basePrice,
              commission,
              sellerPayout,
              status: 'holding',
              boughtAt: new Date(),
            },
          ],
          { session }
        );

        claimedTransaction = transaction;
      });
    } finally {
      await session.endSession();
    }

    if (!claimedTransaction) return { matched: false };
    return { matched: true, transaction: claimedTransaction, amount: detectedAmount };
  }

  /**
   * Atomically transitions an EscrowHold out of 'holding' exactly once. Returns the updated
   * document, or null if it was already in a different state (already released/refunded) —
   * callers must treat null as "already processed", never re-apply a balance change.
   */
  private async claimHolding(
    escrowHoldId: string,
    update: Record<string, any>,
    session: mongoose.ClientSession
  ) {
    return EscrowHold.findOneAndUpdate(
      { _id: escrowHoldId, status: 'holding' },
      update,
      { new: true, session }
    );
  }

  async processRefund(escrowHoldId: string, reason: string) {
    const existing = await EscrowHold.findById(escrowHoldId);
    if (!existing) throw new Error('Escrow hold not found');
    if (existing.status !== 'holding') throw new AlreadyProcessedError();

    const refundInfo = calculateRefund(existing.boughtAt, existing.amount);

    if (!refundInfo.allowed) {
      await this.releaseToSeller(escrowHoldId);
      return { allowed: false, message: refundInfo.message };
    }

    const { refundToBuyer, penaltyAmount, platformKeeps, sellerKeeps } =
      calculateRefundAmount(existing.amount, refundInfo.penaltyPercent);

    const session = await mongoose.startSession();
    let escrow: any = null;

    try {
      await session.withTransaction(async () => {
        escrow = await this.claimHolding(
          escrowHoldId,
          {
            $set: {
              status: refundInfo.penaltyPercent > 0 ? 'partial_refunded' : 'refunded',
              refundReason: reason,
              refundPeriod: refundInfo.period,
            },
            $push: {
              refundLog: {
                action: refundInfo.penaltyPercent > 0 ? 'partial' : 'approved',
                period: refundInfo.period,
                penaltyPercent: refundInfo.penaltyPercent,
                refundAmount: refundToBuyer,
                reason,
                processedAt: new Date(),
              },
            },
          },
          session
        );

        if (!escrow) throw new AlreadyProcessedError();

        await Transaction.findByIdAndUpdate(
          escrow.transactionId,
          { status: 'refunded' },
          { session }
        );
        await Product.findByIdAndUpdate(escrow.productId, { status: 'refunded' }, { session });

        await User.findByIdAndUpdate(
          escrow.buyerId,
          { $inc: { balance: refundToBuyer, totalSpent: -refundToBuyer } },
          { session }
        );

        if (sellerKeeps > 0) {
          await User.findByIdAndUpdate(
            escrow.sellerId,
            { $inc: { balance: sellerKeeps, totalEarned: sellerKeeps } },
            { session }
          );
        }
      });
    } finally {
      await session.endSession();
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

  async releaseToSeller(escrowHoldId: string) {
    const session = await mongoose.startSession();
    let escrow: any = null;

    try {
      await session.withTransaction(async () => {
        escrow = await this.claimHolding(
          escrowHoldId,
          { $set: { status: 'released', confirmedAt: new Date() } },
          session
        );

        if (!escrow) throw new AlreadyProcessedError();

        await User.findByIdAndUpdate(
          escrow.sellerId,
          { $inc: { balance: escrow.sellerPayout, totalEarned: escrow.sellerPayout } },
          { session }
        );

        await Transaction.findByIdAndUpdate(
          escrow.transactionId,
          { status: 'completed', completedAt: new Date() },
          { session }
        );
      });
    } finally {
      await session.endSession();
    }

    return escrow;
  }

  async confirmAndRelease(escrowHoldId: string) {
    const exists = await EscrowHold.exists({ _id: escrowHoldId });
    if (!exists) throw new Error('Escrow hold not found');

    const escrow = await this.releaseToSeller(escrowHoldId);
    return { released: true, sellerPayout: escrow.sellerPayout };
  }
}

export const paymentService = new PaymentService();
