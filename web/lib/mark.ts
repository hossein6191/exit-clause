// The Exit Clause mark: an envelope with an arrow leaving it through the side. One drawing, used by
// the header (components/logo.tsx), the browser icon (app/icon.svg), the app icon and the share card.

export const POSTAL = "#D7263D";
export const INK = "#111827";

/** The mark as SVG markup on a 32-unit grid. `tile` draws it white on a postal-red rounded square. */
export function markSvg({ size = 32, tile = false }: { size?: number; tile?: boolean } = {}): string {
  const line = tile ? "#FFFFFF" : INK;
  const arrow = tile ? "#FFFFFF" : POSTAL;
  const paper = tile ? POSTAL : "#FFFFFF";
  const back = tile ? `<rect x="0" y="0" width="32" height="32" rx="7" fill="${POSTAL}"/>` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">` +
    back +
    `<rect x="3.5" y="8.5" width="19" height="15" rx="2" fill="${paper}" stroke="${line}" stroke-width="2"/>` +
    `<path d="M4.5 10 L13 16.5 L21.5 10" fill="none" stroke="${line}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<path d="M17 20 H28.5" fill="none" stroke="${arrow}" stroke-width="2.6" stroke-linecap="round"/>` +
    `<path d="M24.5 16 L28.5 20 L24.5 24" fill="none" stroke="${arrow}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`
  );
}

/** The mark as a data URI, for next/og images. */
export const markDataUri = (opts: { size?: number; tile?: boolean } = {}): string =>
  "data:image/svg+xml;base64," + Buffer.from(markSvg(opts)).toString("base64");
