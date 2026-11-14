import { useEffect, useId, useRef, type ReactNode } from 'react';

// Native <dialog>: showModal() traps focus, Esc closes it, and focus returns to the opener.
// A dialog that must be answered (set your password) passes dismissable={false}.
export function Dialog({
  title,
  onClose,
  dismissable = true,
  children,
}: {
  title: string;
  onClose?: () => void;
  dismissable?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        if (!dismissable) event.preventDefault();
      }}
      // React StrictMode re-runs the effect in development; ignore the close it causes.
      onClose={() => {
        if (!ref.current?.open) onClose?.();
      }}
    >
      <div className="stack">
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
