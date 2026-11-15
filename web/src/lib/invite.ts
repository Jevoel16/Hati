// Invite codes are 8 characters from A-Z and 2-9; links end in /join/<code>.
const CODE = /^[A-Z2-9]{8}$/;

// Accepts a bare code, a pasted invite link or a scanned QR's text; null when it is none of them.
export function parseInviteCode(input: string): string | null {
  const last =
    input
      .trim()
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '')
      .split('/')
      .pop() ?? '';
  const code = last.toUpperCase();
  return CODE.test(code) ? code : null;
}
