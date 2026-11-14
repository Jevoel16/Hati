// The logo glyph stands in for the H; the link that wraps this carries aria-label="Hati".
export function Wordmark() {
  return (
    <>
      <svg className="wordmark-h" viewBox="14 13 36 38" aria-hidden="true">
        <path className="wordmark-h-h" d="M14 13h6v19h24v19h-6V38H26v13H14z" />
        <path className="wordmark-h-4" d="M20 13h6v13h12V13h12v38h-6V32H20z" />
      </svg>
      ati
    </>
  );
}
