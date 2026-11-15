// QR Ph (the InstaPay/PESONet QR used by GCash, Maya and banks) follows the EMVCo
// merchant-presented format: fields of a 2-digit id, a 2-digit length and the value,
// ending in a CRC. See docs/decisions.md for why Hati only rewrites the amount.

export type Field = { id: string; value: string };

export const MAX_QR_LENGTH = 512;

// CRC-16/CCITT-FALSE (polynomial 0x1021, start 0xFFFF), as 4 uppercase hex digits.
export function crc16(text: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(text)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Splits the top-level fields; null when the text is not well-formed.
function readFields(text: string): Field[] | null {
  const fields: Field[] = [];
  let at = 0;
  while (at < text.length) {
    const id = text.slice(at, at + 2);
    const length = text.slice(at + 2, at + 4);
    if (!/^\d\d$/.test(id) || !/^\d\d$/.test(length)) return null;
    const end = at + 4 + Number(length);
    if (end > text.length) return null;
    fields.push({ id, value: text.slice(at + 4, end) });
    at = end;
  }
  return fields;
}

export const tlv = (f: Field) => `${f.id}${String(f.value.length).padStart(2, '0')}${f.value}`;

// Joins fields and appends the CRC field (63), which covers everything before its value.
export function encode(fields: Field[]): string {
  const body = fields
    .filter((f) => f.id !== '63')
    .map(tlv)
    .join('');
  return `${body}6304${crc16(`${body}6304`)}`;
}

const isAccountTemplate = (id: string) => Number(id) >= 26 && Number(id) <= 51;

// A payee's own QR Ph: well-formed, CRC intact, in pesos, with an account and a name.
export function parseQrPh(input: string): { payeeName: string } | null {
  const text = input.trim();
  if (text.length > MAX_QR_LENGTH) return null;
  const fields = readFields(text);
  if (!fields || fields.length < 3) return null;
  const value = (id: string) => fields.find((f) => f.id === id)?.value;

  const crc = fields.at(-1)!;
  if (crc.id !== '63' || crc.value !== crc16(text.slice(0, -4))) return null;
  if (fields[0]!.id !== '00' || fields[0]!.value !== '01') return null;
  if (value('53') !== '608') return null;
  const country = value('58');
  if (country !== undefined && country !== 'PH') return null;
  if (!fields.some((f) => isAccountTemplate(f.id))) return null;
  const payeeName = value('59')?.trim();
  return payeeName ? { payeeName } : null;
}

// Centavos to the "1234.50" the amount field (54) expects, with no floating point.
export const amountText = (centavos: number) =>
  `${Math.floor(centavos / 100)}.${String(centavos % 100).padStart(2, '0')}`;

// The same QR made single-use ("12") with the exact amount filled in. Call on a parsed QR only.
export function withAmount(text: string, centavos: number): string {
  if (!Number.isInteger(centavos) || centavos < 1) throw new Error('Amount must be centavos.');
  const fields = (readFields(text.trim()) ?? []).filter((f) => !['01', '54', '63'].includes(f.id));
  const amountAt = fields.findIndex((f) => Number(f.id) > 54);
  fields.splice(amountAt === -1 ? fields.length : amountAt, 0, {
    id: '54',
    value: amountText(centavos),
  });
  fields.splice(1, 0, { id: '01', value: '12' });
  return encode(fields);
}
