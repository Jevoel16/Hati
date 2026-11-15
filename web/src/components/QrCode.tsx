import qrcode from 'qrcode-generator';
import { useMemo, useState } from 'react';

// Four modules of white border on every side, which scanners need to find the code.
const QUIET = 4;

function encode(text: string) {
  const qr = qrcode(0, 'M');
  // The library writes one byte per character, so pass it the UTF-8 bytes as characters.
  qr.addData(String.fromCharCode(...new TextEncoder().encode(text)), 'Byte');
  qr.make();
  const size = qr.getModuleCount();
  const dark: [number, number][] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) if (qr.isDark(row, col)) dark.push([col, row]);
  }
  return { size, dark };
}

function toPng(code: ReturnType<typeof encode>): Promise<Blob | null> {
  const scale = 12;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = (code.size + QUIET * 2) * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  for (const [x, y] of code.dark)
    ctx.fillRect((x + QUIET) * scale, (y + QUIET) * scale, scale, scale);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

// Always black on white, whatever the theme, so every banking app can read it.
export function QrCode({
  text,
  label,
  fileName,
  shareText,
}: {
  text: string;
  label: string;
  fileName: string;
  shareText?: string;
}) {
  const code = useMemo(() => encode(text), [text]);
  const [note, setNote] = useState('');
  const side = code.size + QUIET * 2;
  const path = code.dark.map(([x, y]) => `M${x + QUIET} ${y + QUIET}h1v1h-1z`).join('');

  const file = async () => {
    const blob = await toPng(code);
    return blob && new File([blob], `${fileName}.png`, { type: 'image/png' });
  };
  const download = async () => {
    const png = await file();
    if (!png) return setNote('Could not make the image.');
    const url = URL.createObjectURL(png);
    const link = document.createElement('a');
    link.href = url;
    link.download = png.name;
    link.click();
    URL.revokeObjectURL(url);
  };
  const share = async () => {
    const png = await file();
    if (png && navigator.canShare?.({ files: [png] })) {
      // Closing the share sheet without picking an app rejects; that is not an error.
      await navigator.share({ files: [png], title: label, text: shareText }).catch(() => {});
    } else {
      await download();
      setNote('Sharing is not available here, so the image was downloaded instead.');
    }
  };

  return (
    <div className="qr stack stack--sm">
      <svg className="qr-image" viewBox={`0 0 ${side} ${side}`} role="img" aria-label={label}>
        <rect width={side} height={side} fill="#fff" />
        <path d={path} fill="#000" shapeRendering="crispEdges" />
      </svg>
      <div className="row">
        <button type="button" className="button button--quiet" onClick={() => void share()}>
          Share
        </button>
        <button type="button" className="button button--link" onClick={() => void download()}>
          Download
        </button>
      </div>
      <p role="status" className="muted">
        {note}
      </p>
    </div>
  );
}
