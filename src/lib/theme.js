// The user's colour becomes the app's accent. Colours too dark to read on black are
// lightened until they are, so any pick stays usable (links, ticks, buttons).
export const DEFAULT_ACCENT = '#ff7854';
const STORAGE_KEY = 'gymbro:accent';

export function normalizeHex(value) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(value ?? '').trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}

const toRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (rgb) => `#${rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

// WCAG relative luminance
function luminance(rgb) {
  const [r, g, b] = rgb.map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

// Mixes toward white until the colour reaches 4.5:1 on black (readable as text)
export function readableAccent(value) {
  let rgb = toRgb(normalizeHex(value) ?? DEFAULT_ACCENT);
  for (let i = 0; i < 40 && contrast(luminance(rgb), 0) < 4.5; i++) {
    rgb = rgb.map(v => v + (255 - v) * 0.1);
  }
  return toHex(rgb);
}

// Black or white text on an accent-coloured button, whichever reads better
export function textOnAccent(hex) {
  const l = luminance(toRgb(hex));
  return contrast(l, 0) >= contrast(l, 1) ? '#000000' : '#ffffff';
}

export function applyAccent(value) {
  const accent = readableAccent(value);
  const [r, g, b] = toRgb(accent);
  const style = document.documentElement.style;
  style.setProperty('--accent', accent);
  style.setProperty('--accent-hover', toHex([r, g, b].map(v => v + (255 - v) * 0.15)));
  style.setProperty('--accent-soft', `rgba(${r}, ${g}, ${b}, 0.16)`);
  style.setProperty('--accent-muted', `rgba(${r}, ${g}, ${b}, 0.08)`);
  style.setProperty('--accent-contrast', textOnAccent(accent));
  return accent;
}

export function loadSavedAccent() {
  try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_ACCENT; } catch { return DEFAULT_ACCENT; }
}

// Applies and remembers it on this phone, so the app opens in the right colour without a flash
export function saveAccent(value) {
  const accent = applyAccent(value);
  try { localStorage.setItem(STORAGE_KEY, accent); } catch { /* storage unavailable: colour still applied */ }
  return accent;
}
