export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STATUS_ICON_PATHS = {
  good: '<polyline points="20 6 9 17 4 12"></polyline>',
  problem: '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>'
};

export function statusIconSvg(rating, size = 14) {
  const inner = STATUS_ICON_PATHS[rating];
  if (!inner) return '';
  return `<svg class="status-icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" ` +
    'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    `${inner}</svg>`;
}
