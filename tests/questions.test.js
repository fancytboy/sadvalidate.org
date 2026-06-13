import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS } from '../js/data/questions.js';

const PLATFORMS = new Set(['AWS', 'Azure', 'GCP', 'Agnostic']);
const DIFFICULTIES = new Set(['Easy', 'Medium', 'Hard']);

test('there is a healthy set of seeded questions', () => {
  assert.ok(QUESTIONS.length >= 6 && QUESTIONS.length <= 24, `got ${QUESTIONS.length}`);
});

test('every question has the required shape', () => {
  for (const q of QUESTIONS) {
    assert.equal(typeof q.id, 'string');
    assert.ok(q.id.length > 0);
    assert.equal(typeof q.title, 'string');
    assert.ok(PLATFORMS.has(q.platform), `bad platform: ${q.platform}`);
    assert.ok(DIFFICULTIES.has(q.difficulty), `bad difficulty: ${q.difficulty}`);
    assert.equal(typeof q.prompt, 'string');
    assert.ok(q.prompt.length > 20, 'prompt should be descriptive');
    assert.ok(Array.isArray(q.requirements) && q.requirements.length >= 2);
    assert.ok(Array.isArray(q.expectsConcepts) && q.expectsConcepts.length >= 1);
  }
});

test('question ids are unique', () => {
  const ids = QUESTIONS.map(q => q.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('covers AWS, Azure, and Agnostic at minimum', () => {
  const platforms = new Set(QUESTIONS.map(q => q.platform));
  for (const p of ['AWS', 'Azure', 'Agnostic']) assert.ok(platforms.has(p), `missing ${p}`);
});
