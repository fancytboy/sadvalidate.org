import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvaluationPrompt, parseFeedback, renderFeedback, evaluateDesign,
  buildNodeReviewPrompt, parseNodeReviews, reviewNodes } from '../js/feedback.js';

const question = {
  title: 'URL Shortener',
  prompt: 'Design a URL shortener.',
  requirements: ['100M URLs', 'fast reads'],
  expectsConcepts: ['caching', 'CDN']
};
const serialized = {
  question: 'url-shortener-aws',
  nodes: [{ id: 'n1', type: 'Lambda', label: 'Redirect', platform: 'AWS' }],
  edges: []
};

test('buildEvaluationPrompt includes question, requirements, concepts, design, and JSON instruction', () => {
  const { system, user } = buildEvaluationPrompt(question, serialized);
  assert.match(system, /system design/i);
  assert.match(user, /URL Shortener/);
  assert.match(user, /100M URLs/);
  assert.match(user, /caching/);
  assert.match(user, /Lambda/);
  assert.match(user, /JSON/);
});

test('parseFeedback parses a clean JSON object', () => {
  const fb = parseFeedback(JSON.stringify({
    score: 80, summary: 'good',
    strengths: [{ title: 't', detail: 'd' }], concerns: [], missing: [], suggestions: []
  }));
  assert.equal(fb.score, 80);
  assert.equal(fb.strengths[0].title, 't');
});

test('parseFeedback strips ```json code fences', () => {
  const fenced = '```json\n{"score":50,"summary":"s","strengths":[],"concerns":[],"missing":[],"suggestions":[]}\n```';
  const fb = parseFeedback(fenced);
  assert.equal(fb.score, 50);
});

test('parseFeedback normalizes missing arrays to empty arrays', () => {
  const fb = parseFeedback('{"score":10,"summary":"s"}');
  assert.deepEqual(fb.strengths, []);
  assert.deepEqual(fb.concerns, []);
  assert.deepEqual(fb.missing, []);
  assert.deepEqual(fb.suggestions, []);
});

test('parseFeedback throws on non-JSON', () => {
  assert.throws(() => parseFeedback('the model said no'), /parse|JSON/i);
});

test('parseFeedback clamps the score to 0-100 and rounds it', () => {
  const fb = (score) => parseFeedback(JSON.stringify({ score, summary: 's' })).score;
  assert.equal(fb(150), 100);
  assert.equal(fb(-5), 0);
  assert.equal(fb(82.6), 83);
  assert.equal(fb(80), 80);
});

// Minimal fake DOM node sufficient for renderFeedback's append/innerHTML use.
function fakeEl() {
  const el = {
    children: [], innerHTML: '', className: '',
    set textContent(v) { this._text = v; }, get textContent() { return this._text; },
    appendChild(c) { this.children.push(c); return c; },
    append(...cs) { this.children.push(...cs); }
  };
  return el;
}

test('renderFeedback clears and writes a score + groups', () => {
  const host = fakeEl();
  // provide a document stub for createElement
  globalThis.document = { createElement: () => fakeEl() };
  renderFeedback(host, {
    score: 72, summary: 'ok',
    strengths: [{ title: 'a', detail: 'b' }],
    concerns: [], missing: [{ title: 'm', detail: 'n' }], suggestions: []
  });
  assert.ok(host.children.length > 0);
});

test('evaluateDesign wires prompt -> aiClient -> parse', async () => {
  const fakeClient = {
    evaluate: async ({ system, user }) => {
      assert.match(user, /Challenge/);
      return '{"score":90,"summary":"great","strengths":[],"concerns":[],"missing":[],"suggestions":[]}';
    }
  };
  const fb = await evaluateDesign({
    question: { title: 'Q', prompt: 'p', requirements: ['r'], expectsConcepts: ['c'] },
    serializedDesign: { question: 'q', nodes: [], edges: [] },
    aiClient: fakeClient
  });
  assert.equal(fb.score, 90);
});

// ===== Deep per-node review =====

test('buildNodeReviewPrompt asks for a per-node JSON array referencing node ids', () => {
  const { system, user } = buildNodeReviewPrompt(question, serialized);
  assert.match(system, /component by component/i);
  assert.match(user, /URL Shortener/);
  assert.match(user, /100M URLs/);
  assert.match(user, /Lambda/);     // the design is included
  assert.match(user, /JSON array/i);
  assert.match(user, /"rating"/);
});

test('parseNodeReviews returns a map keyed by node id', () => {
  const map = parseNodeReviews(JSON.stringify([
    { id: 'n1', rating: 'good', role: 'fits', issues: [], alternatives: [] },
    { id: 'n2', rating: 'problem', role: 'wrong', issues: ['SPOF'], alternatives: ['use X'] }
  ]));
  assert.equal(map.n1.rating, 'good');
  assert.equal(map.n2.rating, 'problem');
  assert.deepEqual(map.n2.issues, ['SPOF']);
  assert.deepEqual(map.n2.alternatives, ['use X']);
});

test('parseNodeReviews strips code fences and normalizes a bad rating to warning', () => {
  const fenced = '```json\n[{"id":"n1","rating":"meh","role":"r"}]\n```';
  const map = parseNodeReviews(fenced);
  assert.equal(map.n1.rating, 'warning');
  assert.deepEqual(map.n1.issues, []);
  assert.deepEqual(map.n1.alternatives, []);
});

test('parseNodeReviews throws on non-JSON', () => {
  assert.throws(() => parseNodeReviews('the model refused'), /parse|JSON/i);
});

test('reviewNodes wires prompt -> aiClient(maxTokens) -> parse', async () => {
  let sawMaxTokens = null;
  const fakeClient = {
    evaluate: async ({ user, maxTokens }) => {
      sawMaxTokens = maxTokens;
      assert.match(user, /Challenge/);
      return '[{"id":"n1","rating":"warning","role":"ok","issues":[],"alternatives":[]}]';
    }
  };
  const map = await reviewNodes({
    question: { title: 'Q', prompt: 'p', requirements: ['r'], expectsConcepts: ['c'] },
    serializedDesign: { question: 'q', nodes: [{ id: 'n1', type: 'T', label: 'L', platform: 'AWS' }], edges: [] },
    aiClient: fakeClient
  });
  assert.equal(map.n1.rating, 'warning');
  assert.ok(sawMaxTokens > 1500, 'deep review should request more tokens');
});
