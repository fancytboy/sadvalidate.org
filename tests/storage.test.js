import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeStorage } from '../js/storage.js';

function mockBackend(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    key: i => [...map.keys()][i] ?? null,
    get length() { return map.size; },
    _raw: map
  };
}

test('API keys live in memory only and are never written to the backend', () => {
  const backend = mockBackend();
  const storage = makeStorage(backend);
  assert.equal(storage.getApiKey('anthropic'), null);
  storage.setSessionApiKey('anthropic', 'sk-ant-123');
  assert.equal(storage.getApiKey('anthropic'), 'sk-ant-123');
  const persisted = [...backend._raw.keys()].filter(k => k.startsWith('sdp.key.') || k === 'sdp.apiKey');
  assert.deepEqual(persisted, []);
});

test('a session key is not visible to a fresh storage over the same backend', () => {
  const backend = mockBackend();
  makeStorage(backend).setSessionApiKey('anthropic', 'sk-session');
  assert.equal(makeStorage(backend).getApiKey('anthropic'), null);
});

test('keys and error logs persisted by older versions are purged at construction', () => {
  const backend = mockBackend({
    'sdp.apiKey': 'sk-legacy',
    'sdp.key.anthropic': 'sk-old',
    'sdp.errors': '[]',
    'sdp.provider': 'openai'
  });
  const storage = makeStorage(backend);
  assert.equal(backend._raw.has('sdp.apiKey'), false);
  assert.equal(backend._raw.has('sdp.key.anthropic'), false);
  assert.equal(backend._raw.has('sdp.errors'), false);
  assert.equal(storage.getApiKey('anthropic'), null);
  assert.equal(storage.getProvider(), 'openai'); // non-key settings survive
});

test('base URL round-trips per provider and clears when set to empty', () => {
  const storage = makeStorage(mockBackend());
  assert.equal(storage.getBaseUrl('anthropic'), null);
  storage.setBaseUrl('anthropic', 'https://gateway.example.com');
  assert.equal(storage.getBaseUrl('anthropic'), 'https://gateway.example.com');
  storage.setBaseUrl('anthropic', '');
  assert.equal(storage.getBaseUrl('anthropic'), null);
});

test('provider and model round-trip with sensible defaults', () => {
  const storage = makeStorage(mockBackend());
  assert.equal(storage.getProvider(), 'anthropic'); // default
  assert.equal(storage.getModel(), null);
  storage.setProvider('gemini');
  storage.setModel('gemini-3.5-flash');
  assert.equal(storage.getProvider(), 'gemini');
  assert.equal(storage.getModel(), 'gemini-3.5-flash');
});

test('saveDesign wraps the design in a versioned envelope', () => {
  const backend = mockBackend();
  const storage = makeStorage(backend);
  const design = { question: 'q1', nodes: [{ id: 'n1' }], edges: [], _seq: 1 };
  storage.saveDesign(design);
  const raw = JSON.parse(backend._raw.get('sdp.design.q1'));
  assert.equal(raw.v, 1);
  assert.deepEqual(raw.design, design);
  assert.deepEqual(storage.loadDesign('q1'), design);
});

test('loadDesign accepts legacy unversioned designs', () => {
  const legacy = { question: 'q1', nodes: [], edges: [], _seq: 0 };
  const storage = makeStorage(mockBackend({ 'sdp.design.q1': JSON.stringify(legacy) }));
  assert.deepEqual(storage.loadDesign('q1'), legacy);
});

test('loadDesign returns null for missing, corrupt, or future-version data', () => {
  const storage = makeStorage(mockBackend({
    'sdp.design.corrupt': '{not json',
    'sdp.design.future': JSON.stringify({ v: 99, design: { question: 'future' } })
  }));
  assert.equal(storage.loadDesign('nope'), null);
  assert.equal(storage.loadDesign('corrupt'), null);
  assert.equal(storage.loadDesign('future'), null);
});
