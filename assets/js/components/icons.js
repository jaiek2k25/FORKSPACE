/** Inline SVG icons. Small, single-stroke, no icon-font dependency. */
import { svg } from '../lib/dom.js';

function base(children, size = 18, extra = {}) {
  return svg('svg', {
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 1.6,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
    ...extra
  }, ...children);
}

export const icons = {
  search: (size) => base([svg('circle', { cx: 11, cy: 11, r: 7 }), svg('path', { d: 'M20 20l-3.5-3.5' })], size),
  heart: (size, filled = false) => base([svg('path', { d: 'M12 20s-7-4.35-7-9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7 3.5C19 15.65 12 20 12 20z', fill: filled ? 'currentColor' : 'none' })], size),
  arrowLeft: (size) => base([svg('path', { d: 'M14 6l-6 6 6 6' })], size),
  arrowRight: (size) => base([svg('path', { d: 'M10 6l6 6-6 6' })], size),
  list: (size) => base([svg('path', { d: 'M4 7h16M4 12h16M4 17h16' })], size),
  map: (size) => base([svg('path', { d: 'M9 4l6 2 6-2v14l-6 2-6-2-6 2V6l6-2z' }), svg('path', { d: 'M9 4v14M15 6v14' })], size),
  pin: (size) => base([svg('path', { d: 'M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z' }), svg('circle', { cx: 12, cy: 11, r: 2.2 })], size),
  columns: (size) => base([svg('rect', { x: 4, y: 5, width: 6, height: 14, rx: 1 }), svg('rect', { x: 14, y: 5, width: 6, height: 14, rx: 1 })], size),
  check: (size) => base([svg('path', { d: 'M5 13l4 4 10-10' })], size),
  close: (size) => base([svg('path', { d: 'M6 6l12 12M18 6L6 18' })], size),
  plus: (size) => base([svg('path', { d: 'M12 5v14M5 12h14' })], size),
  external: (size) => base([svg('path', { d: 'M14 5h5v5' }), svg('path', { d: 'M19 5l-8 8' }), svg('path', { d: 'M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4' })], size),
  bed: (size) => base([svg('path', { d: 'M4 18v-6h16v6M4 12V7M4 12h7V9h4a3 3 0 0 1 3 3' })], size),
  bath: (size) => base([svg('path', { d: 'M5 12h14v3a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-3z' }), svg('path', { d: 'M7 12V7a2 2 0 0 1 4 0' })], size),
  ruler: (size) => base([svg('path', { d: 'M4 14l10-10 6 6-10 10-6-6z' }), svg('path', { d: 'M8 12l2 2M11 9l2 2' })], size),
  info: (size) => base([svg('circle', { cx: 12, cy: 12, r: 8 }), svg('path', { d: 'M12 11v5M12 8h.01' })], size),
  alert: (size) => base([svg('path', { d: 'M12 4l9 16H3l9-16z' }), svg('path', { d: 'M12 10v5M12 17h.01' })], size),
  spark: (size) => base([svg('path', { d: 'M12 4l1.8 5.2L19 11l-5.2 1.8L12 18l-1.8-5.2L5 11l5.2-1.8L12 4z' })], size)
};

export function icon(name, size) {
  const builder = icons[name];
  return builder ? builder(size) : null;
}
