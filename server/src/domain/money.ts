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

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

export const formatPeso = (centavos: number): string => peso.format(centavos / 100);
