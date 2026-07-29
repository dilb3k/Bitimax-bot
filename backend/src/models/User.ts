import mongoose, { Schema, Document } from 'mongoose';
import { UserRole } from '../types';

export interface IUser extends Document {
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  role: UserRole;
  balance: number;
  totalEarned: number;
  totalSpent: number;
  isBlocked: boolean;
  notificationSettings: {
    newOrder: boolean;
    paymentConfirm: boolean;
    refundUpdate: boolean;
    promo: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    telegramId: { type: Number, required: true, unique: true, index: true },
    username: { type: String },
    firstName: { type: String },
    lastName: { type: String },
    role: {
      type: String,
      enum: ['buyer', 'seller', 'admin'],
      default: 'buyer',
    },
    balance: { type: Number, default: 0, min: 0 },
    totalEarned: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    isBlocked: { type: Boolean, default: false },
    notificationSettings: {
      newOrder: { type: Boolean, default: true },
      paymentConfirm: { type: Boolean, default: true },
      refundUpdate: { type: Boolean, default: true },
      promo: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', UserSchema);
