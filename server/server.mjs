import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildRequest, extractResponseText, PROVIDERS } from '../js/client.js';

const KEY_ENV_VARS = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  qwen: 'QWEN_API_KEY'
};

const MAX_PROMPT_CHARS = 200000;
const MAX_RESPONSE_TOKENS = 8000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const RATE_LIMIT = { limit: 30, windowMs: 60000 };

const STATIC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATIC_FILES = ['index.html', 'favicon.svg', 'manifest.webmanifest', 'sw.js'];
const STATIC_DIRS = ['css', 'js'];
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json'
};

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function readProviderKeys(env) {
  const keys = {};
  for (const [provider, envVar] of Object.entries(KEY_ENV_VARS)) {
    if (env[envVar]) keys[provider] = env[envVar];
  }
  return keys;
}

export function readOllamaBaseUrl(env) {
  return env.OLLAMA_BASE_URL || null;
}


export function listConfiguredProviders({ keys, ollamaBaseUrl }) {
  const providers = {};
  for (const provider of Object.keys(keys)) {
    const info = PROVIDERS[provider];
    if (info) providers[provider] = { label: info.label, models: info.models };
  }
  if (ollamaBaseUrl) {
    const info = PROVIDERS.ollama;
    providers.ollama = { label: info.label, models: info.models, allowsCustomModels: true };
  }
  return providers;
}

export async function fetchInstalledOllamaModels({ baseUrl, fetchImpl = fetch }) {
  try {
    const res = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/api/tags`);
    if (!res.ok) return null;
    const data = await res.json();
    const names = (data.models || []).map(model => model.name).filter(Boolean);
    return names.length ? names : null;
  } catch {
    return null;
  }
}

export function createRateLimiter({ limit, windowMs, now = Date.now }) {
  const requestLog = new Map();
  let lastSweep = now();

  function recentFor(ip) {
    const cutoff = now() - windowMs;
    return (requestLog.get(ip) || []).filter(timestamp => timestamp > cutoff);
  }

  function sweepStale() {
    const cutoff = now() - windowMs;
    for (const [ip, timestamps] of requestLog) {
      if (!timestamps.some(timestamp => timestamp > cutoff)) requestLog.delete(ip);
    }
  }

  return {
    isRateLimited(ip) {
      return recentFor(ip).length >= limit;
    },
    recordRequest(ip) {
      if (now() - lastSweep >= windowMs) {
        sweepStale();
        lastSweep = now();
      }
      const recent = recentFor(ip);
      recent.push(now());
      requestLog.set(ip, recent);
    }
  };
}

// Where a provider's request should go and with which credential: cloud
// providers need their env key; Ollama needs only its configured base URL
// and accepts any pulled model name.
function resolveProviderTarget({ provider, model, keys, ollamaBaseUrl }) {
  if (typeof provider !== 'string' || !PROVIDERS[provider]) throw new HttpError(400, 'Unknown provider');
  if (typeof model !== 'string' || !model) throw new HttpError(400, 'Unknown model for provider');
  if (provider === 'ollama') {
    if (!ollamaBaseUrl) throw new HttpError(400, 'Ollama is not configured on this server');
    return { baseUrl: ollamaBaseUrl }; // any pulled model name is accepted
  }
  if (!keys[provider]) throw new HttpError(400, `No API key configured for ${provider}`);
  if (!PROVIDERS[provider].models.includes(model)) throw new HttpError(400, 'Unknown model for provider');
  return { apiKey: keys[provider] };
}

export function validateEvaluatePayload({ payload, keys, ollamaBaseUrl }) {
  if (!payload || typeof payload !== 'object') throw new HttpError(400, 'Invalid JSON body');
  const { provider, model, system, user, maxTokens } = payload;
  const target = resolveProviderTarget({ provider, model, keys, ollamaBaseUrl });
  if (typeof system !== 'string' || typeof user !== 'string') {
    throw new HttpError(400, 'system and user must be strings');
  }
  if (system.length + user.length > MAX_PROMPT_CHARS) throw new HttpError(413, 'Prompt too large');
  const tokens = maxTokens === undefined ? undefined : Number(maxTokens);
  if (tokens !== undefined && (!Number.isFinite(tokens) || tokens < 1 || tokens > MAX_RESPONSE_TOKENS)) {
    throw new HttpError(400, `maxTokens must be between 1 and ${MAX_RESPONSE_TOKENS}`);
  }
  return { provider, model, system, user, maxTokens: tokens, ...target };
}

export function createEvaluateHandler({ keys, fetchImpl = fetch, ollamaBaseUrl = null }) {
  return async function handleEvaluate(payload) {
    const request = validateEvaluatePayload({ payload, keys, ollamaBaseUrl });
    const { url, options } = buildRequest(request);
    const res = await fetchImpl(url, options);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = data?.error?.message || '';
      throw new HttpError(502,
        `${PROVIDERS[request.provider].label} API error ${res.status}${detail ? ': ' + detail : ''}`);
    }
    return { text: extractResponseText(request.provider, data) };
  };
}


export function resolveStaticPath(urlPath) {
  let clean;
  try {
    clean = decodeURIComponent(urlPath).replace(/\\/g, '/');
  } catch {
    return null;
  }
  if (clean.includes('..') || clean.includes('\0')) return null;
  const relative = clean === '/' ? 'index.html' : clean.replace(/^\/+/, '');
  const topSegment = relative.split('/')[0];
  if (STATIC_FILES.includes(relative)) return relative;
  if (STATIC_DIRS.includes(topSegment) && relative.includes('/')) return relative;
  return null;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

const SECURITY_HEADERS = { 'x-content-type-options': 'nosniff' };

function send(res, status, headers, body) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

function sendJson(res, status, body) {
  send(res, status, { 'content-type': 'application/json; charset=utf-8' }, JSON.stringify(body));
}

export function createRequestHandler({ keys, fetchImpl = fetch, ollamaBaseUrl = null, rateLimiter = createRateLimiter(RATE_LIMIT) }) {
  const handleEvaluate = createEvaluateHandler({ keys, fetchImpl, ollamaBaseUrl });
  const staticCache = new Map();

  async function listProvidersWithLiveModels() {
    const providers = listConfiguredProviders({ keys, ollamaBaseUrl });
    if (providers.ollama) {
      const installed = await fetchInstalledOllamaModels({ baseUrl: ollamaBaseUrl, fetchImpl });
      if (installed) providers.ollama.models = installed;
    }
    return providers;
  }

  async function routeApi(req, res) {
    res.setHeader('cache-control', 'no-store');
    if (req.method === 'GET' && req.url === '/api/providers') {
      sendJson(res, 200, { providers: await listProvidersWithLiveModels() });
      return;
    }
    if (req.method === 'POST' && req.url === '/api/evaluate') {
      const ip = req.socket.remoteAddress || 'unknown';
      if (rateLimiter.isRateLimited(ip)) throw new HttpError(429, 'Too many requests');
      rateLimiter.recordRequest(ip);
      const payload = await readJsonBody(req);
      sendJson(res, 200, await handleEvaluate(payload));
      return;
    }
    throw new HttpError(404, 'Not found');
  }

  async function serveStatic(req, res) {
    if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed');
    const relative = resolveStaticPath(req.url.split('?')[0]);
    if (!relative) throw new HttpError(404, 'Not found');
    let cached = staticCache.get(relative);
    if (!cached) {
      let content;
      try {
        content = await readFile(join(STATIC_ROOT, relative));
      } catch {
        throw new HttpError(404, 'Not found');
      }
      cached = { content, contentType: MIME_TYPES[extname(relative)] || 'application/octet-stream' };
      staticCache.set(relative, cached);
    }
    send(res, 200, { 'content-type': cached.contentType }, cached.content);
  }

  return async function handleRequest(req, res) {
    try {
      if (req.url.startsWith('/api/')) await routeApi(req, res);
      else await serveStatic(req, res);
    } catch (err) {
      const known = err instanceof HttpError;
      if (!known) console.error('[server]', err);
      if (!res.headersSent) {
        sendJson(res, known ? err.status : 500, { error: known ? err.message : 'Internal server error' });
      }
    }
  };
}

export function startServer({ env = process.env, port } = {}) {
  const keys = readProviderKeys(env);
  const ollamaBaseUrl = readOllamaBaseUrl(env);
  const server = createServer(createRequestHandler({ keys, ollamaBaseUrl }));
  const resolvedPort = port || Number(env.PORT) || 8080;
  server.listen(resolvedPort, () => {
    const configured = Object.keys(listConfiguredProviders({ keys, ollamaBaseUrl }));
    console.log(`[server] listening on :${resolvedPort}; configured providers: ` +
      (configured.length ? configured.join(', ') : 'none (set ANTHROPIC_API_KEY etc. or OLLAMA_BASE_URL)'));
  });
  return server;
}

const isRunDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isRunDirectly) startServer();
