import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterComponents } from '../js/palette.js';

const comps = [
  { type: 'Lambda', platform: 'AWS', category: 'Compute', icon: 'λ', description: 'fn' },
  { type: 'S3', platform: 'AWS', category: 'Storage', icon: '🪣', description: 'blob' },
  { type: 'Functions', platform: 'Azure', category: 'Compute', icon: 'λ', description: 'fn' }
];

test('filters by platform', () => {
  const r = filterComponents(comps, { platform: 'Azure', query: '' });
  assert.equal(r.length, 1);
  assert.equal(r[0].type, 'Functions');
});

test('platform "All" returns everything', () => {
  assert.equal(filterComponents(comps, { platform: 'All', query: '' }).length, 3);
});

test('query matches type or description, case-insensitive', () => {
  assert.equal(filterComponents(comps, { platform: 'All', query: 'lamb' }).length, 1);
  assert.equal(filterComponents(comps, { platform: 'All', query: 'BLOB' })[0].type, 'S3');
});

test('platform and query combine', () => {
  const r = filterComponents(comps, { platform: 'AWS', query: 'fn' });
  assert.equal(r.length, 1);
  assert.equal(r[0].type, 'Lambda');
});
