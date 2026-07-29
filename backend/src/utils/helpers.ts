export function generateUniqueAmount(basePrice: number): number {
  const randomCents = Math.floor(Math.random() * 900) + 100;
  return basePrice + randomCents;
}

export function extractAmountFromSms(text: string): number | null {
  const patterns = [
    /(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:so['']?m|sum|so'm|UZS|uzs)/i,
    /(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:сум|сўм)/i,
    /(\d{4,8})(?:\s*-\s*|\s)(?:so['']?m|sum|so'm)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const amount = parseFloat(match[1].replace(',', '.'));
      if (!isNaN(amount) && amount > 0) return amount;
    }
  }
  return null;
}

export function generateTemporaryPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}
