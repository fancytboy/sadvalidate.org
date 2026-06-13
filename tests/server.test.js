import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readProviderKeys, readOllamaBaseUrl, listConfiguredProviders, fetchInstalledOllamaModels,
  createRateLimiter, validateEvaluatePayload, createEvaluateHandler, resolveStaticPath, HttpError
} from '../server/server.mjs';

const KEYS = { anthropic: 'sk-ant-test' };
const OLLAMA_URL = 'http://localhost:11434';

test('readProviderKeys picks up only the configured provider env vars', () => {
  const keys = readProviderKeys({
    ANTHROPIC_API_KEY: 'a',
    GEMINI_API_KEY: 'g',
    UNRELATED: 'x'
  });
  assert.deepEqual(keys, { anthropic: 'a', gemini: 'g' });
  assert.deepEqual(readProviderKeys({}), {});
});

test('readOllamaBaseUrl reads OLLAMA_BASE_URL, defaulting to null', () => {
  assert.equal(readOllamaBaseUrl({ OLLAMA_BASE_URL: OLLAMA_URL }), OLLAMA_URL);
  assert.equal(readOllamaBaseUrl({}), null);
});

test('listConfiguredProviders exposes label and models only for keyed providers', () => {
  const providers = listConfiguredProviders({ keys: { anthropic: 'a', openai: 'o' } });
  assert.deepEqual(Object.keys(providers).sort(), ['anthropic', 'openai']);
  assert.equal(providers.anthropic.label, 'Anthropic');
  assert.ok(Array.isArray(providers.anthropic.models) && providers.anthropic.models.length > 0);
  assert.equal(providers.anthropic.keyPlaceholder, undefined);
});

test('listConfiguredProviders includes keyless Ollama when a base URL is configured', () => {
  const providers = listConfiguredProviders({ keys: {}, ollamaBaseUrl: OLLAMA_URL });
  assert.deepEqual(Object.keys(providers), ['ollama']);
  assert.equal(providers.ollama.allowsCustomModels, true);
  assert.ok(providers.ollama.models.length > 0);
  assert.deepEqual(listConfiguredProviders({ keys: {} }), {});
});

test('fetchInstalledOllamaModels lists the daemon models and tolerates failures', async () => {
  const okFetch = async () => ({ ok: true, json: async () => ({ models: [{ name: 'qwen3:8b' }, { name: 'gemma3:1b' }] }) });
  assert.deepEqual(
    await fetchInstalledOllamaModels({ baseUrl: OLLAMA_URL, fetchImpl: okFetch }),
    ['qwen3:8b', 'gemma3:1b']
  );
  const downFetch = async () => { throw new Error('connection refused'); };
  assert.equal(await fetchInstalledOllamaModels({ baseUrl: OLLAMA_URL, fetchImpl: downFetch }), null);
});

test('validateEvaluatePayload rejects unknown providers, models, and oversize prompts', () => {
  const base = { provider: 'anthropic', model: 'claude-opus-4-8', system: 's', user: 'u' };
  assert.throws(() => validateEvaluatePayload({ payload: null, keys: KEYS }), HttpError);
  assert.throws(() => validateEvaluatePayload({ payload: { ...base, provider: 'nope' }, keys: KEYS }), /Unknown provider/);
  assert.throws(() => validateEvaluatePayload({ payload: base, keys: {} }), /No API key/);
  assert.throws(() => validateEvaluatePayload({ payload: { ...base, model: 'made-up' }, keys: KEYS }), /Unknown model/);
  assert.throws(() => validateEvaluatePayload({ payload: { ...base, user: 42 }, keys: KEYS }), /must be strings/);
  assert.throws(
    () => validateEvaluatePayload({ payload: { ...base, user: 'x'.repeat(300000) }, keys: KEYS }),
    /Prompt too large/
  );
  assert.throws(() => validateEvaluatePayload({ payload: { ...base, maxTokens: 99999 }, keys: KEYS }), /maxTokens/);
  const valid = validateEvaluatePayload({ payload: { ...base, maxTokens: 4000 }, keys: KEYS });
  assert.equal(valid.maxTokens, 4000);
});

test('validateEvaluatePayload: Ollama needs a configured base URL and accepts custom model names', () => {
  const payload = { provider: 'ollama', model: 'my-custom:7b', system: 's', user: 'u' };
  assert.throws(() => validateEvaluatePayload({ payload, keys: KEYS }), /not configured/);
  assert.throws(
    () => validateEvaluatePayload({ payload: { ...payload, model: '' }, keys: KEYS, ollamaBaseUrl: OLLAMA_URL }),
    /Unknown model/
  );
  const valid = validateEvaluatePayload({ payload, keys: KEYS, ollamaBaseUrl: OLLAMA_URL });
  assert.equal(valid.model, 'my-custom:7b');
  assert.equal(valid.baseUrl, OLLAMA_URL);
  assert.equal(valid.apiKey, undefined);
});

test('createEvaluateHandler forwards Ollama requests to the configured daemon without a key', async () => {
  let captured = null;
  const fakeFetch = async (url, options) => {
    captured = { url, options };
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'local-grade' } }] }) };
  };
  const handleEvaluate = createEvaluateHandler({ keys: {}, fetchImpl: fakeFetch, ollamaBaseUrl: OLLAMA_URL });
  const result = await handleEvaluate({ provider: 'ollama', model: 'qwen3:8b', system: 'SYS', user: 'USR' });
  assert.deepEqual(result, { text: 'local-grade' });
  assert.equal(captured.url, 'http://localhost:11434/v1/chat/completions');
  assert.equal(captured.options.headers.authorization, undefined);
});

test('createEvaluateHandler forwards to the provider with the server-side key and returns the text', async () => {
  let captured = null;
  const fakeFetch = async (url, options) => {
    captured = { url, options };
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'graded' }] }) };
  };
  const handleEvaluate = createEvaluateHandler({ keys: KEYS, fetchImpl: fakeFetch });
  const result = await handleEvaluate({
    provider: 'anthropic', model: 'claude-opus-4-8', system: 'SYS', user: 'USR'
  });
  assert.deepEqual(result, { text: 'graded' });
  assert.equal(captured.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(captured.options.headers['x-api-key'], 'sk-ant-test');
});

test('createEvaluateHandler maps provider HTTP failures to a 502 HttpError', async () => {
  const fakeFetch = async () => ({
    ok: false, status: 401, json: async () => ({ error: { message: 'bad key' } })
  });
  const handleEvaluate = createEvaluateHandler({ keys: KEYS, fetchImpl: fakeFetch });
  await assert.rejects(
    () => handleEvaluate({ provider: 'anthropic', model: 'claude-opus-4-8', system: 's', user: 'u' }),
    (err) => err instanceof HttpError && err.status === 502 && /bad key/.test(err.message)
  );
});

test('rate limiter trips after the limit inside the window and recovers after it', () => {
  let clock = 0;
  const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => clock });
  assert.equal(limiter.isRateLimited('ip1'), false);
  limiter.recordRequest('ip1');
  limiter.recordRequest('ip1');
  assert.equal(limiter.isRateLimited('ip1'), true);
  assert.equal(limiter.isRateLimited('ip2'), false); // per-ip isolation
  clock = 2000; // window elapsed
  assert.equal(limiter.isRateLimited('ip1'), false);
});

test('resolveStaticPath allows only the app shell and blocks traversal', () => {
  assert.equal(resolveStaticPath('/'), 'index.html');
  assert.equal(resolveStaticPath('/index.html'), 'index.html');
  assert.equal(resolveStaticPath('/js/app.js'), 'js/app.js');
  assert.equal(resolveStaticPath('/css/styles.css'), 'css/styles.css');
  assert.equal(resolveStaticPath('/server/server.mjs'), null);
  assert.equal(resolveStaticPath('/tests/server.test.js'), null);
  assert.equal(resolveStaticPath('/../secrets'), null);
  assert.equal(resolveStaticPath('/js/../server/server.mjs'), null);
  assert.equal(resolveStaticPath('/README.md'), null);
});
