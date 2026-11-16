import type { Currency } from './types.ts';

const formatters = new Map<Currency, Intl.NumberFormat>();
function formatterFor(currency: Currency): Intl.NumberFormat {
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-PH', { style: 'currency', currency });
    formatters.set(currency, formatter);
  }
  return formatter;
}

// Amounts are integers in the currency's smallest unit: 2 decimals for PHP, none for JPY.
export const minorDigits = (currency: Currency): number =>
  formatterFor(currency).resolvedOptions().maximumFractionDigits ?? 2;

export const formatMoney = (minor: number, currency: Currency): string =>
  formatterFor(currency).format(minor / 10 ** minorDigits(currency));

// "₱" for PHP, "¥" for JPY: for field labels.
export const currencySymbol = (currency: Currency): string =>
  formatterFor(currency)
    .formatToParts(0)
    .find((part) => part.type === 'currency')?.value ?? currency;

// An example amount for hints and errors: "1250.50" in pesos, "1250" in yen.
export const sampleAmount = (currency: Currency): string =>
  minorDigits(currency) === 0 ? '1250' : '1250.50';

// "1250.5" PHP -> 125050. Works on the digits, never on floats, so no rounding can creep in.
export function parseAmount(text: string, currency: Currency): number | null {
  const digits = minorDigits(currency);
  const fraction = digits === 0 ? '' : String.raw`(?:\.(\d{1,${digits}}))?`;
  const match = new RegExp(String.raw`^(\d{1,9})${fraction}$`).exec(text.trim().replace(/,/g, ''));
  if (!match) return null;
  return Number(match[1]) * 10 ** digits + Number((match[2] ?? '').padEnd(digits, '0') || 0);
}

// For pre-filling an amount field: 125050 PHP -> "1250.50", 1250 JPY -> "1250".
export const toAmountInput = (minor: number, currency: Currency): string =>
  (minor / 10 ** minorDigits(currency)).toFixed(minorDigits(currency));

// Says a balance in words, so it never depends on colour or a bare minus sign.
export function describeBalance(
  netMinor: number,
  subject: 'you' | 'they',
  currency: Currency,
): string {
  if (netMinor === 0) return subject === 'you' ? 'You are settled up' : 'settled up';
  const amount = formatMoney(Math.abs(netMinor), currency);
  if (subject === 'you') return netMinor > 0 ? `You are owed ${amount}` : `You owe ${amount}`;
  return netMinor > 0 ? `is owed ${amount}` : `owes ${amount}`;
}

export const todayIso = (): string => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

const dayFormat = new Intl.DateTimeFormat('en-PH', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const monthFormat = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' });

// Date-only strings are built from their parts, so the time zone cannot shift the day.
export function formatDay(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  return dayFormat.format(new Date(year, month - 1, day));
}

export function formatMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number) as [number, number];
  return monthFormat.format(new Date(year, month - 1, 1));
}
