import mongoose, { Schema, Document } from 'mongoose';
import { ProductStatus } from '../types';
import { encryptSecret, decryptSecret } from '../utils/crypto';

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
  subcategory?: string;

  /** Stored AES-256-GCM encrypted; use getCredentials() to read, setCredentials() to write. */
  sensitiveData: ISensitiveData;
  /** Set once credentials are wiped after the retention window. */
  credentialsPurgedAt?: Date;

  status: ProductStatus;
  moderationNote?: string;
  moderatedBy?: mongoose.Types.ObjectId;
  moderatedAt?: Date;

  images: string[];
  tags: string[];

  /**
   * Soft reservation held while a buyer's payment window runs, so two buyers can never
   * pay for the same account. Cleared by the expiry sweeper when the window lapses.
   */
  reservedBy?: mongoose.Types.ObjectId;
  reservedUntil?: Date;

  buyerId?: mongoose.Types.ObjectId;
  soldAt?: Date;
  viewCount: number;

  /** Seller-declared attributes shown in the catalog, e.g. followers, region, age. */
  attributes: Record<string, string>;

  createdAt: Date;
  updatedAt: Date;

  getCredentials(): ISensitiveData;
  setCredentials(data: ISensitiveData): void;
}

const ProductSchema = new Schema<IProduct>(
  {
    sellerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 4000 },
    price: { type: Number, required: true, min: 1000 },
    category: { type: String, required: true, index: true },
    subcategory: { type: String },

    sensitiveData: {
      login: { type: String, required: true },
      password: { type: String, required: true },
      recoveryCode: { type: String },
      additionalInfo: { type: String },
    },
    credentialsPurgedAt: { type: Date },

    status: {
      type: String,
      enum: [
        'draft',
        'pending_review',
        'rejected',
        'active',
        'reserved',
        'sold',
        'refunded',
        'disputed',
        'archived',
      ],
      default: 'pending_review',
      index: true,
    },
    moderationNote: { type: String },
    moderatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    moderatedAt: { type: Date },

    images: [{ type: String }],
    tags: [{ type: String }],

    reservedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reservedUntil: { type: Date },

    buyerId: { type: Schema.Types.ObjectId, ref: 'User' },
    soldAt: { type: Date },
    viewCount: { type: Number, default: 0 },

    attributes: { type: Map, of: String, default: {} },
  },
  { timestamps: true }
);

// Catalog listing: active products by category, newest or cheapest first.
ProductSchema.index({ status: 1, category: 1, createdAt: -1 });
ProductSchema.index({ status: 1, price: 1 });
// Text search across the buyer-visible fields, replacing the unindexed $regex scan.
ProductSchema.index({ title: 'text', description: 'text', tags: 'text' });
// Lets the sweeper find lapsed reservations cheaply.
ProductSchema.index({ status: 1, reservedUntil: 1 });

ProductSchema.methods.setCredentials = function (this: IProduct, data: ISensitiveData) {
  this.sensitiveData = {
    login: encryptSecret(data.login),
    password: encryptSecret(data.password),
    recoveryCode: data.recoveryCode ? encryptSecret(data.recoveryCode) : undefined,
    additionalInfo: data.additionalInfo ? encryptSecret(data.additionalInfo) : undefined,
  };
};

ProductSchema.methods.getCredentials = function (this: IProduct): ISensitiveData {
  if (this.credentialsPurgedAt) {
    throw new Error('Credentials for this product have been purged after the retention window');
  }
  return {
    login: decryptSecret(this.sensitiveData?.login || ''),
    password: decryptSecret(this.sensitiveData?.password || ''),
    recoveryCode: this.sensitiveData?.recoveryCode
      ? decryptSecret(this.sensitiveData.recoveryCode)
      : undefined,
    additionalInfo: this.sensitiveData?.additionalInfo
      ? decryptSecret(this.sensitiveData.additionalInfo)
      : undefined,
  };
};

/**
 * Credentials must never travel in a serialized product, whatever its status. The previous
 * version of this hook inverted the condition and *kept* sensitiveData for sold/refunded
 * products, so any endpoint that returned a sold product handed out the account. There is
 * exactly one legitimate way to read them: getCredentials(), called from the escrow release
 * path after ownership has been verified.
 */
ProductSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.sensitiveData;
  return obj;
};

export const Product = mongoose.model<IProduct>('Product', ProductSchema);
