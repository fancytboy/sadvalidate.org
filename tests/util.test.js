import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from '../js/util.js';

test('escapeHtml neutralizes markup-significant characters', () => {
  assert.equal(
    escapeHtml('<img src=x onerror="alert(1)">'),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
  );
  assert.equal(escapeHtml("a & b < c > d ' e"), 'a &amp; b &lt; c &gt; d &#39; e');
});

test('escapeHtml passes plain text through and coerces non-strings', () => {
  assert.equal(escapeHtml('URL Shortener'), 'URL Shortener');
  assert.equal(escapeHtml(42), '42');
  assert.equal(escapeHtml(''), '');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
});
