const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

export const formatPeso = (centavos: number): string => peso.format(centavos / 100);

// "1250.5" -> 125050. Works on the digits, never on floats, so no rounding can creep in.
export function parsePesos(text: string): number | null {
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(text.trim().replace(/,/g, ''));
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

// For pre-filling an amount field: 125050 -> "1250.50".
export const toPesoInput = (centavos: number): string => (centavos / 100).toFixed(2);

// Says a balance in words, so it never depends on colour or a bare minus sign.
export function describeBalance(netCentavos: number, subject: 'you' | 'they'): string {
  if (netCentavos === 0) return subject === 'you' ? 'You are settled up' : 'settled up';
  const amount = formatPeso(Math.abs(netCentavos));
  if (subject === 'you') return netCentavos > 0 ? `You are owed ${amount}` : `You owe ${amount}`;
  return netCentavos > 0 ? `is owed ${amount}` : `owes ${amount}`;
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
