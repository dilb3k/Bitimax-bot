export type UserRole = 'buyer' | 'seller' | 'admin';
export type ProductStatus = 'active' | 'sold' | 'refunded' | 'disputed';
export type TransactionStatus = 'pending_payment' | 'paid' | 'expired' | 'refunded' | 'completed';
export type EscrowStatus = 'holding' | 'released' | 'refunded' | 'partial_refunded';
export type RefundPeriod = '0-10min' | '10min-2h' | '2h-24h' | 'over24h';

export interface RefundResult {
  allowed: boolean;
  penaltyPercent: number;
  refundPercent: number;
  period: RefundPeriod;
  message: string;
}

export interface PaymentInfo {
  expectedAmount: number;
  uniqueAmount: number;
  qrCode?: string;
  cardNumber?: string;
  bankName?: string;
}
