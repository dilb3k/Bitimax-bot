import dayjs from 'dayjs';
import { RefundPeriod, RefundResult } from '../types';

const PLATFORM_COMMISSION = 7;

export function calculateRefund(
  boughtAt: Date,
  amount: number
): RefundResult {
  const now = dayjs();
  const bought = dayjs(boughtAt);
  const diffMinutes = now.diff(bought, 'minute');

  if (diffMinutes <= 10) {
    return {
      allowed: true,
      penaltyPercent: 0,
      refundPercent: PLATFORM_COMMISSION,
      period: '0-10min',
      message:
        'Siz akkauntni 10 daqiqa ichida qaytaryapsiz. Pulingiz to\'liq qaytariladi (faqat bank/tizim komissiyasi ushlanadi).',
    };
  }

  if (diffMinutes <= 120) {
    return {
      allowed: true,
      penaltyPercent: 10,
      refundPercent: 90 - PLATFORM_COMMISSION,
      period: '10min-2h',
      message:
        '10 daqiqadan oshganligi sababli akkaunt summasidan 10% jarima ushlanadi. Qolgan 90% sizga qaytariladi.',
    };
  }

  if (diffMinutes <= 1440) {
    return {
      allowed: true,
      penaltyPercent: 50,
      refundPercent: 50 - PLATFORM_COMMISSION,
      period: '2h-24h',
      message:
        '2 soatdan oshganligi sababli akkaunt summasidan 50% jarima ushlanadi. Qolgan 50% sizga qaytariladi.',
    };
  }

  return {
    allowed: false,
    penaltyPercent: 100,
    refundPercent: 0,
    period: 'over24h',
    message:
      '24 soatdan oshganligi sababli qaytarish MUMKIN EMAS. Pul to\'liq sotuvchiga o\'tkaziladi.',
  };
}

export function calculateSellerPayout(amount: number): {
  commission: number;
  sellerPayout: number;
} {
  const commission = Math.round((amount * PLATFORM_COMMISSION) / 100);
  const sellerPayout = amount - commission;
  return { commission, sellerPayout };
}

export function calculateRefundAmount(
  amount: number,
  penaltyPercent: number,
  platformCommission: number = PLATFORM_COMMISSION
): {
  penaltyAmount: number;
  refundToBuyer: number;
  platformKeeps: number;
  sellerKeeps: number;
} {
  const platformKeeps = Math.round((amount * platformCommission) / 100);
  const penaltyAmount = Math.round((amount * penaltyPercent) / 100);
  const refundToBuyer = amount - penaltyAmount - platformKeeps;
  const sellerKeeps = penaltyAmount;

  return { penaltyAmount, refundToBuyer, platformKeeps, sellerKeeps };
}
