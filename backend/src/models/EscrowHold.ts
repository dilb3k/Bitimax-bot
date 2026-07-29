import mongoose, { Schema, Document } from 'mongoose';
import { EscrowStatus, RefundPeriod } from '../types';

export interface IRefundLog {
  action: 'requested' | 'approved' | 'rejected' | 'partial';
  period: RefundPeriod;
  penaltyPercent: number;
  refundAmount: number;
  reason?: string;
  processedAt: Date;
}

export interface IEscrowHold extends Document {
  transactionId: mongoose.Types.ObjectId;
  buyerId: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  amount: number;
  commission: number;
  sellerPayout: number;
  status: EscrowStatus;
  boughtAt: Date;
  confirmedAt?: Date;
  refundReason?: string;
  refundPeriod?: RefundPeriod;
  refundLog: IRefundLog[];
  createdAt: Date;
  updatedAt: Date;
}

const RefundLogSchema = new Schema<IRefundLog>(
  {
    action: { type: String, enum: ['requested', 'approved', 'rejected', 'partial'], required: true },
    period: { type: String, enum: ['0-10min', '10min-2h', '2h-24h', 'over24h'], required: true },
    penaltyPercent: { type: Number, required: true },
    refundAmount: { type: Number, required: true },
    reason: { type: String },
    processedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const EscrowHoldSchema = new Schema<IEscrowHold>(
  {
    transactionId: { type: Schema.Types.ObjectId, ref: 'Transaction', required: true, unique: true },
    buyerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sellerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    amount: { type: Number, required: true },
    commission: { type: Number, required: true },
    sellerPayout: { type: Number, required: true },
    status: {
      type: String,
      enum: ['holding', 'released', 'refunded', 'partial_refunded'],
      default: 'holding',
      index: true,
    },
    boughtAt: { type: Date, required: true },
    confirmedAt: { type: Date },
    refundReason: { type: String },
    refundPeriod: { type: String, enum: ['0-10min', '10min-2h', '2h-24h', 'over24h'] },
    refundLog: [RefundLogSchema],
  },
  { timestamps: true }
);

export const EscrowHold = mongoose.model<IEscrowHold>('EscrowHold', EscrowHoldSchema);
