import mongoose, { Schema, Document } from 'mongoose';
import { ProductStatus } from '../types';

export interface ISensitiveData {
  login: string;
  password: string;
  recoveryCode?: string;
  additionalInfo?: string;
}

export interface IProduct extends Document {
  sellerId: mongoose.Types.ObjectId;
  title: string;
  description: string;
  price: number;
  category: string;
  sensitiveData: ISensitiveData;
  status: ProductStatus;
  images: string[];
  tags: string[];
  buyerId?: mongoose.Types.ObjectId;
  soldAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema = new Schema<IProduct>(
  {
    sellerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    category: { type: String, required: true, index: true },
    sensitiveData: {
      login: { type: String, required: true },
      password: { type: String, required: true },
      recoveryCode: { type: String },
      additionalInfo: { type: String },
    },
    status: {
      type: String,
      enum: ['active', 'sold', 'refunded', 'disputed'],
      default: 'active',
      index: true,
    },
    images: [{ type: String }],
    tags: [{ type: String }],
    buyerId: { type: Schema.Types.ObjectId, ref: 'User' },
    soldAt: { type: Date },
  },
  { timestamps: true }
);

ProductSchema.methods.toJSON = function () {
  const obj = this.toObject();
  if (this.status !== 'sold' && this.status !== 'refunded') {
    delete obj.sensitiveData;
  }
  return obj;
};

export const Product = mongoose.model<IProduct>('Product', ProductSchema);
