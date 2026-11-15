import jsQR from 'jsqr';
import { useEffect, useReducer, useRef, type ChangeEvent } from 'react';
import { scanReducer } from '../lib/machines.ts';
import { Dialog } from './Dialog.tsx';

// Large photos are scaled down first: decoding is faster and still reliable.
const MAX_SIDE = 1024;

function decode(source: CanvasImageSource, width: number, height: number): string | null {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || canvas.width === 0) return null;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return (
    jsQR(data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' })?.data ?? null
  );
}

const cameraErrors: Record<string, 'denied' | 'unsupported'> = {
  NotAllowedError: 'denied',
  SecurityError: 'denied',
  NotFoundError: 'unsupported',
  OverconstrainedError: 'unsupported',
};

// Reads one QR code with the rear camera, or from a photo or screenshot, then reports its text.
export default function QrScanner({
  title,
  hint,
  onScan,
  onClose,
}: {
  title: string;
  hint: string;
  onScan: (text: string) => void;
  onClose: () => void;
}) {
  const [state, send] = useReducer(scanReducer, { status: 'requesting' });
  const video = useRef<HTMLVideoElement>(null);
  const cameraOn = state.status === 'requesting' || state.status === 'scanning';

  useEffect(() => {
    if (!cameraOn) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      send({ type: 'unsupported' });
      return;
    }
    let stream: MediaStream | null = null;
    let frame = 0;
    let cancelled = false;
    let last = 0;
    const tick = (time: number) => {
      frame = requestAnimationFrame(tick);
      const el = video.current;
      // About seven tries a second is plenty and keeps phones cool.
      if (!el || el.readyState < 2 || time - last < 150) return;
      last = time;
      const text = decode(el, el.videoWidth, el.videoHeight);
      if (text) send({ type: 'decoded', text });
    };
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((media) => {
        stream = media;
        if (cancelled || !video.current) return media.getTracks().forEach((t) => t.stop());
        video.current.srcObject = media;
        void video.current.play().catch(() => {});
        send({ type: 'granted' });
        frame = requestAnimationFrame(tick);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const kind = cameraErrors[(error as { name?: string })?.name ?? ''];
        send(kind ? { type: kind } : { type: 'failed', message: 'The camera could not start.' });
      });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [cameraOn]);

  // Reported once, even if the parent passes a new callback on every render.
  const reported = useRef(false);
  useEffect(() => {
    if (state.status !== 'found' || reported.current) return;
    reported.current = true;
    onScan(state.text);
  }, [state, onScan]);

  const onPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const image = await createImageBitmap(file);
      const text = decode(image, image.width, image.height);
      image.close();
      send(
        text
          ? { type: 'decoded', text }
          : { type: 'failed', message: 'No QR code was found in that image.' },
      );
    } catch {
      send({ type: 'failed', message: 'That file could not be opened as an image.' });
    }
  };

  const message = (() => {
    switch (state.status) {
      case 'requesting':
        return 'Starting the camera…';
      case 'scanning':
        return 'Point the camera at the QR code.';
      case 'found':
        return 'QR code found.';
      case 'denied':
        return 'Camera access is blocked. Allow it in your browser settings, or choose a photo instead.';
      case 'unsupported':
        return 'No camera is available here. Choose a photo or screenshot instead.';
      case 'failed':
        return state.message;
    }
  })();

  return (
    <Dialog title={title} onClose={onClose}>
      <p className="muted">{hint}</p>
      {cameraOn && (
        <video ref={video} className="qr-video" muted playsInline aria-label="Camera preview" />
      )}
      <p role="status" className={state.status === 'failed' ? 'field-error' : undefined}>
        {message}
      </p>
      <div className="dialog-actions">
        {(state.status === 'denied' || state.status === 'failed') && (
          <button
            type="button"
            className="button button--link"
            onClick={() => send({ type: 'retry' })}
          >
            Try the camera again
          </button>
        )}
        <label className="button button--quiet file-button">
          <input
            type="file"
            accept="image/*"
            className="visually-hidden"
            onChange={(e) => void onPhoto(e)}
          />
          Choose a photo
        </label>
        <button type="button" className="button button--quiet" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Dialog>
  );
}
