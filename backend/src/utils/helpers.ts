export function generateUniqueAmount(basePrice: number): number {
  const randomCents = Math.floor(Math.random() * 900) + 100;
  return basePrice + randomCents;
}

// UZS bank SMS amounts are always whole so'm, commonly written with a thousands
// separator (space, comma, apostrophe or dot), e.g. "1 250 000 so'm" or "1,250,000 UZS".
// We capture the whole run of digits+separators before the currency marker and strip the
// separators, rather than the old \d{1,6} pattern which silently failed (or truncated) on
// any amount over 999,999 or written with a separator.
const CURRENCY_MARKER = "(?:so['’]?m|sum|UZS|uzs|сум|сўм)";
const AMOUNT_RUN = "\\d{1,3}(?:[\\s.,']\\d{3})*(?:[\\s.,']\\d{1,2})?|\\d+";

export function extractAmountFromSms(text: string): number | null {
  const pattern = new RegExp(`(${AMOUNT_RUN})\\s*${CURRENCY_MARKER}`, 'i');
  const match = text.match(pattern);
  if (!match) return null;

  const digitsOnly = match[1].replace(/[\s.,']/g, '');
  const amount = parseInt(digitsOnly, 10);
  return !isNaN(amount) && amount > 0 ? amount : null;
}

export function generateTemporaryPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}
