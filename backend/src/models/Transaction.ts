import mongoose, { Schema, Document } from 'mongoose';
import { TransactionStatus } from '../types';

export interface ITransaction extends Document {
  productId: mongoose.Types.ObjectId;
  buyerId: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  basePrice: number;
  expectedAmount: number;
  uniqueAmount: number;
  status: TransactionStatus;
  smsRawText?: string;
  smsConfirmedAt?: Date;
  createdAt: Date;
  expireAt: Date;
  completedAt?: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    buyerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sellerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    basePrice: { type: Number, required: true, min: 0 },
    expectedAmount: { type: Number, required: true, min: 0 },
    uniqueAmount: { type: Number, required: true, min: 0, index: true },
    status: {
      type: String,
      enum: ['pending_payment', 'paid', 'expired', 'refunded', 'completed'],
      default: 'pending_payment',
      index: true,
    },
    smsRawText: { type: String },
    smsConfirmedAt: { type: Date },
    expireAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

export const Transaction = mongoose.model<ITransaction>('Transaction', TransactionSchema);
