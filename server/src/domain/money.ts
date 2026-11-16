// Amounts are integers in the currency's smallest unit (centavos for PHP, yen for JPY).
export const MAX_AMOUNT_CENTAVOS = 100_000_000;

export const CATEGORIES = [
  'rent',
  'utilities',
  'groceries',
  'food',
  'transport',
  'supplies',
  'fun',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CURRENCIES = ['PHP', 'USD', 'EUR', 'JPY', 'SGD', 'KRW', 'HKD'] as const;
export type Currency = (typeof CURRENCIES)[number];

const formatters = new Map<Currency, Intl.NumberFormat>();
function formatterFor(currency: Currency): Intl.NumberFormat {
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-PH', { style: 'currency', currency });
    formatters.set(currency, formatter);
  }
  return formatter;
}

// 2 for PHP and USD, 0 for JPY and KRW: taken from the built-in currency data.
export const minorDigits = (currency: Currency): number =>
  formatterFor(currency).resolvedOptions().maximumFractionDigits ?? 2;

export const formatMoney = (minor: number, currency: Currency): string =>
  formatterFor(currency).format(minor / 10 ** minorDigits(currency));

// Plain digits for a spreadsheet cell: 125050 PHP -> "1250.50", 1250 JPY -> "1250".
export function toMajorString(minor: number, currency: Currency): string {
  const digits = minorDigits(currency);
  const sign = minor < 0 ? '-' : '';
  const text = String(Math.abs(minor)).padStart(digits + 1, '0');
  return digits === 0 ? sign + text : `${sign}${text.slice(0, -digits)}.${text.slice(-digits)}`;
}
