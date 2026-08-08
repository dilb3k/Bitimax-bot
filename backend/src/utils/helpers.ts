import crypto from 'crypto';

/**
 * Adds a random tail to the price so the bank SMS identifies which buyer paid. The tail is
 * drawn with a CSPRNG rather than Math.random: a buyer who could predict the next tail could
 * craft a transfer that claims someone else's pending order.
 */
export function generateUniqueAmount(basePrice: number): number {
  const randomTail = crypto.randomInt(100, 1000); // 100..999 so'm
  return basePrice + randomTail;
}

// UZS bank SMS amounts are always whole so'm, commonly written with a thousands
// separator (space, comma, apostrophe or dot), e.g. "1 250 000 so'm" or "1,250,000 UZS".
// We capture the whole run of digits+separators before the currency marker and strip the
// separators, rather than the old \d{1,6} pattern which silently failed (or truncated) on
// any amount over 999,999 or written with a separator.
const CURRENCY_MARKER = "(?:so['’]?m|sum|UZS|uzs|сум|сўм)";
const AMOUNT_RUN = "\\d{1,3}(?:[\\s.,']\\d{3})*(?:[\\s.,']\\d{1,2})?|\\d+";

/**
 * Words that mark an SMS as a debit/withdrawal rather than an incoming transfer. Crediting an
 * order because the account was *charged* would confirm payments that never arrived, so those
 * messages are rejected outright.
 *
 * Uzbek banks send the same message in Uzbek, Russian Cyrillic and Latin-transliterated
 * Russian depending on the bank and the card's language setting, so all three spellings of
 * each marker have to be here — matching only Cyrillic "списан" would miss "Spisano".
 */
const OUTGOING_MARKERS = new RegExp(
  [
    // Uzbek
    "yechildi|yechib|yechim|xarid|to['’]?lov amalga",
    // Russian, Cyrillic
    'списан|оплата|покупка|снятие|расход',
    // Russian, Latin transliteration
    'spisan|oplata|pokupka|snyatie|rasxod|raschod',
    // English (some banks / aggregators)
    'debit|withdrawal|purchase',
  ].join('|'),
  'i'
);

const INCOMING_MARKERS = new RegExp(
  [
    // Uzbek
    "tushdi|kirim|o['’]?tkazma|qabul|hisobingizga",
    // Russian, Cyrillic
    'пополнен|зачислен|поступ|перевод|приход',
    // Russian, Latin transliteration
    'popolnen|zachislen|postupil|perevod|prixod|prihod',
    // English
    'credit|incoming|deposit',
  ].join('|'),
  'i'
);

export function extractAmountFromSms(text: string): number | null {
  const pattern = new RegExp(`(${AMOUNT_RUN})\\s*${CURRENCY_MARKER}`, 'i');
  const match = text.match(pattern);
  if (!match) return null;

  const digitsOnly = match[1].replace(/[\s.,']/g, '');
  const amount = parseInt(digitsOnly, 10);
  return !isNaN(amount) && amount > 0 ? amount : null;
}

/**
 * True when the SMS looks like money arriving. A message that carries an outgoing marker and
 * no incoming marker is treated as a debit notification and must not confirm an order.
 */
export function looksLikeIncomingPayment(text: string): boolean {
  const outgoing = OUTGOING_MARKERS.test(text);
  const incoming = INCOMING_MARKERS.test(text);
  if (outgoing && !incoming) return false;
  return true;
}

/** Stable identity for an SMS delivery, used to drop redeliveries of the same message. */
export function smsFingerprint(text: string, sender?: string, receivedAt?: string | number): string {
  return crypto
    .createHash('sha256')
    .update(`${sender || ''}|${String(receivedAt || '')}|${text.trim()}`)
    .digest('hex');
}

/** `8600 1234 5678 9012` → `8600 •••• •••• 9012`. Only the masked form is ever displayed. */
export function maskCard(cardNumber: string): string {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length < 8) return '••••';
  return `${digits.slice(0, 4)} •••• •••• ${digits.slice(-4)}`;
}

export function isValidUzCard(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, '');
  return digits.length === 16;
}

/** Escapes HTML so user-supplied text can't inject markup into a Telegram HTML message. */
export function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function formatUzs(amount: number): string {
  return `${Math.round(amount).toLocaleString('en-US').replace(/,/g, ' ')} UZS`;
}
