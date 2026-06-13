import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMPONENTS } from '../js/data/components.js';

const PLATFORMS = new Set(['AWS', 'Azure', 'GCP', 'Generic']);

test('every component has the required shape', () => {
  assert.ok(COMPONENTS.length >= 20, 'expected a meaningful palette');
  for (const c of COMPONENTS) {
    assert.equal(typeof c.type, 'string');
    assert.ok(c.type.length > 0);
    assert.ok(PLATFORMS.has(c.platform), `bad platform: ${c.platform}`);
    assert.equal(typeof c.category, 'string');
    assert.equal(typeof c.icon, 'string');
    assert.equal(typeof c.description, 'string');
  }
});

test('component type+platform pairs are unique', () => {
  const seen = new Set();
  for (const c of COMPONENTS) {
    const key = c.platform + ':' + c.type;
    assert.ok(!seen.has(key), `duplicate ${key}`);
    seen.add(key);
  }
});

test('all four platforms are represented', () => {
  const platforms = new Set(COMPONENTS.map(c => c.platform));
  for (const p of PLATFORMS) assert.ok(platforms.has(p), `missing ${p}`);
});
