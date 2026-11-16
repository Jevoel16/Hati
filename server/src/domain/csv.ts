// Spreadsheets run a cell that starts with one of these as a formula (CSV injection).
const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

export function csvCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

// The byte-order mark makes Excel read names like Peña as UTF-8.
export const BOM = String.fromCharCode(0xfeff);

// CRLF row endings, as RFC 4180 asks.
export const toCsv = (rows: string[][]): string =>
  BOM + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
